import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { pluginId, reloadPlugin } from './load';
interface Importer {
 dialogs: Set<{ close(): void }>;
 pro: { opts: { http: unknown }; refreshNow(): Promise<void>; signOut(): void };
 settings: { presets: { name: string; folder: string }[] };
 preview(source: string, layout: Layout): Promise<{ notes: { path: string; duplicate: boolean }[] }>;
 runImport(source: string, layout: Layout): Promise<{ created: string[]; skipped: string[]; errors: string[] }>;
 savePreset(name: string, layout: Layout): Promise<boolean>;
 repeatPreview(source: string, layout: Layout): Promise<string[]>;
}
interface Layout { folder: string; prefix: string; includeSource: boolean }
const layout: Layout = { folder: 'Imported', prefix: '', includeSource: true };
const XML = '<opml><body><outline text="Project A" note="First" _note="Second"><outline text="one"><outline text="sub"/></outline><outline text="two"/></outline><outline text="Project A"/></body></opml>';
async function setPro(on: boolean): Promise<void> {
 await browser.executeObsidian(async ({ app }, id, enabled) => {
  const p = (app as unknown as { plugins: { plugins: Record<string, Importer> } }).plugins.plugins[id]!;
  if (!enabled) { p.pro.signOut(); return; }
  p.pro.opts.http = () => Promise.resolve({ status: 200, json: { data: { viewer: { login: 'demo-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
  app.secretStorage.setSecret(`${id}-github-token`, 'gho_' + '0'.repeat(36)); await p.pro.refreshNow();
 }, pluginId, on);
}
describe(`${pluginId} in the real app`, function () {
 it('creates visible Unicode notes and preserves comment-like text in reading view', async function () {
  const result = await browser.executeObsidian(async ({ app, obsidian }, id) => {
   const p = (app as unknown as { plugins: { plugins: Record<string, Importer> } }).plugins.plugins[id]!;
   const title = '日'.repeat(100);
   await app.vault.create('Unicode.opml', `<opml><body><outline text="${title}" note="%%keep this%%"/><outline text=".secret"/></body></opml>`);
   const imported = await p.runImport('Unicode.opml', { folder: 'Unicode notes', prefix: '', includeSource: false });
   const file = app.vault.getFileByPath(imported.created[0]!);
   if (!file) throw new Error('The Unicode note was not created.');
   const el = document.createElement('div'); const component = new obsidian.Component(); component.load();
   try {
    await obsidian.MarkdownRenderer.render(app, await app.vault.read(file), el, file.path, component);
    return { imported, visible: el.textContent, hidden: app.vault.getFileByPath('Unicode notes/_secret.md') !== null };
   } finally { component.unload(); }
  }, pluginId);
  expect(result.imported.errors).toEqual([]); expect(result.imported.created).toHaveLength(2);
  expect(result.visible).toContain('%%keep this%%'); expect(result.hidden).toBe(true);
 });
 it('loads and reloads without errors', async function () { expect(await reloadPlugin(pluginId)).toEqual({ enabled: true, reloaded: true, errors: [] }); });
 it('opens the vault file selector and previews through the UI', async function () {
  await obsidianPage.write('Outline.opml', XML);
  await browser.waitUntil(async () => browser.executeObsidian(({ app }) => app.vault.getAbstractFileByPath('Outline.opml') !== null), { timeout: 10000, timeoutMsg: 'OPML file was not indexed' });
  await setPro(false);
  await browser.executeObsidianCommand(`${pluginId}:import-opml`);
  const modal = browser.$('.modal-content.opml-note-import'); await modal.waitForExist();
  const select = modal.$('select'); await select.selectByAttribute('value', 'Outline.opml');
  const preview = modal.$('button=Preview'); await preview.click();
  await browser.waitUntil(async () => (await modal.getText()).includes('2 root notes.'), { timeout: 10000, timeoutMsg: 'preview did not finish' });
  expect(await modal.getText()).toContain('name conflict, numbered suffix');
  const summaries = await modal.$$('.opml-note-import-output summary'); expect(await summaries.length).toBe(2);
  await summaries[0]!.click(); expect(await modal.getText()).toContain('  - sub');
  await browser.executeObsidian(({ app }, id) => { const p = (app as unknown as { plugins: { plugins: Record<string, Importer> } }).plugins.plugins[id]!; for (const dialog of p.dialogs) dialog.close(); }, pluginId);
 });
 it('imports ordered notes and skips existing output without overwrite', async function () {
  const first = await browser.executeObsidian(async ({ app }, id, opts) => (app as unknown as { plugins: { plugins: Record<string, Importer> } }).plugins.plugins[id]!.runImport('Outline.opml', opts), pluginId, layout);
  expect(first.created).toEqual(['Imported/Project A.md', 'Imported/Project A 2.md']); expect(first.errors).toEqual([]);
  const content = await obsidianPage.read(first.created[0]!); expect(content).toContain('First\n\nSecond'); expect(content).toContain('- one\n  - sub\n- two'); expect(content).toContain('opml_source_id: Outline.opml#1');
  await obsidianPage.write(first.created[0]!, '# Personal text\n');
  const second = await browser.executeObsidian(async ({ app }, id, opts) => (app as unknown as { plugins: { plugins: Record<string, Importer> } }).plugins.plugins[id]!.runImport('Outline.opml', opts), pluginId, layout);
  expect(second.created).toEqual([]); expect(second.skipped).toEqual(first.created); expect(await obsidianPage.read(first.created[0]!)).toBe('# Personal text\n');
 });
 it('rejects malformed XML and external declarations before creation', async function () {
  const results = await browser.executeObsidian(async ({ app }, id) => {
   const p = (app as unknown as { plugins: { plugins: Record<string, Importer> } }).plugins.plugins[id]!; const errors: string[] = [];
   for (const [name, xml] of [['Bad.opml', '<opml><body>'], ['Entity.opml', '<!DOCTYPE opml SYSTEM "https://example.invalid/a"><opml><body><outline text="Bad"/></body></opml>']]) {
    await app.vault.create(name!, xml!); try { await p.runImport(name!, { folder: 'Rejected', prefix: '', includeSource: true }); } catch (error) { errors.push(String(error)); }
   }
   return { errors, exists: app.vault.getAbstractFileByPath('Rejected') !== null };
  }, pluginId);
  expect(results.errors[0]).toContain('Invalid XML'); expect(results.errors[1]).toContain('DOCTYPE'); expect(results.exists).toBe(false);
 });
 it('gates presets and repeat previews, then compares with a stubbed Sponsors reply', async function () {
  const free = await browser.executeObsidian(async ({ app }, id, opts) => {
   const p = (app as unknown as { plugins: { plugins: Record<string, Importer> } }).plugins.plugins[id]!;
   let blocked = false; try { await p.repeatPreview('Outline.opml', opts); } catch { blocked = true; }
   return { saved: await p.savePreset('Project', opts), blocked };
  }, pluginId, layout); expect(free).toEqual({ saved: false, blocked: true });
  await setPro(true);
  const pro = await browser.executeObsidian(async ({ app }, id, opts) => {
   const p = (app as unknown as { plugins: { plugins: Record<string, Importer> } }).plugins.plugins[id]!;
   return { saved: await p.savePreset('Project', opts), rows: await p.repeatPreview('Outline.opml', opts), presets: p.settings.presets };
  }, pluginId, layout);
  expect(pro.saved).toBe(true); expect(pro.presets.some(p => p.name === 'Project')).toBe(true); expect(pro.rows[0]).toContain('changed'); expect(pro.rows[0]).toContain('- # Personal text'); expect(pro.rows[1]).toContain('unchanged');
  expect(await obsidianPage.read('Imported/Project A.md')).toBe('# Personal text\n');
  await setPro(false);
 });
});
