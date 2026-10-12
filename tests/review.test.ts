import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import OpmlNoteImportPlugin from '../src/main';
import { OpmlNoteImportSettingTab } from '../src/settings';
import { DEFAULT_LAYOUT, planImport, safeName } from '../src/outline';
import { bindPro, resetPro } from '../src/pro';
import manifest from '../manifest.json';

const xml = (text: string) => `<opml><body><outline text="${text}"/></body></opml>`;
const plugin = (files: Record<string, string> = { 'Outline.opml': xml('A') }) => new OpmlNoteImportPlugin(App.createConfigured__({ files }) as never, manifest as never);
afterEach(() => { resetPro(); vi.restoreAllMocks(); });

describe('review regressions', () => {
 it('rejects a malformed 100 KB tag stream without blocking the UI', () => {
  const start = performance.now();
  expect(() => planImport('<'.repeat(100_000))).toThrow('Invalid XML');
  expect(performance.now() - start).toBeLessThan(1000);
 }, 30000);
 it('keeps Unicode file names within the byte limit, including suffixes', () => {
  const title = '日'.repeat(100);
  const plan = planImport(`<opml><body><outline text="${title}"/><outline text="${title}"/></body></opml>`);
  for (const note of plan.notes) expect(new TextEncoder().encode(note.path.split('/').at(-1)).length).toBeLessThanOrEqual(255);
  expect(plan.notes[0]?.content).toContain(title);
 });
 it('does not split a Unicode character when it shortens a title', () => {
  const name = safeName('a'.repeat(99) + '😀');
  expect(new TextDecoder().decode(new TextEncoder().encode(name))).toBe(name);
 });
 it('does not create a hidden output name', () => { expect(safeName('.secret')).toBe('_secret'); });
 it('counts a self-closing element in the XML depth limit', () => {
  expect(() => planImport('<opml><body>' + '<outline>'.repeat(98) + '<outline/>' + '</outline>'.repeat(98) + '</body></opml>')).toThrow('100 level');
 });
 it('does not hide imported text as an Obsidian comment', () => {
  expect(planImport('<opml><body><outline text="A" note="%%keep this%%"/></body></opml>').notes[0]?.content).toContain('\\%\\%keep this\\%\\%');
 });
 it('indexes existing vault paths once for a multi-root outline', () => {
  let reads = 0;
  const existing = new Proxy(Array.from({ length: 500 }, (_, i) => `Other/${i}.md`), { get(target, key, receiver) { if (typeof key === 'string' && /^\d+$/.test(key)) reads++; return Reflect.get(target, key, receiver); } });
  planImport('<opml><body>' + '<outline text="A"/>'.repeat(100) + '</body></opml>', 'Outline.opml', DEFAULT_LAYOUT, existing);
  expect(reads).toBeLessThanOrEqual(existing.length);
 });
 it('compares the case variant that the importer skips', async () => {
  bindPro({ isPro: () => true, onChange: () => () => {} } as never);
  const p = plugin({ 'Outline.opml': xml('A'), 'OPML imports/a.md': '# Old\n' });
  const rows = await p.repeatPreview('Outline.opml', DEFAULT_LAYOUT);
  expect(rows[0]).toContain('changed');
  expect(rows[0]).toContain('- # Old');
 });
 it('reports a destination folder as blocked in the repeat preview', async () => {
  bindPro({ isPro: () => true, onChange: () => () => {} } as never);
  const p = plugin();
  await p.app.vault.createFolder('OPML imports/A.md');
  expect((await p.repeatPreview('Outline.opml', DEFAULT_LAYOUT))[0]).toContain('blocked');
 });
 it('has no heading for the only account settings section', () => {
  const p = plugin(); p.pro = {} as never;
  const tab = new OpmlNoteImportSettingTab(p.app, p);
  expect(tab.getSettingDefinitions().some(item => 'heading' in item && item.heading)).toBe(false);
 });
 it('does not start the refresh timer after unload before layout ready', async () => {
  const p = plugin(); let ready = () => {};
  vi.spyOn(p.app.workspace, 'onLayoutReady').mockImplementation(callback => { ready = callback; });
  vi.spyOn(p, 'addSettingTab').mockImplementation(() => {});
  await p.onload();
  const refresh = vi.spyOn(p.pro!, 'refresh').mockResolvedValue();
  const interval = vi.spyOn(p, 'registerInterval');
  p.onunload(); ready();
  expect(refresh).not.toHaveBeenCalled();
  expect(interval).not.toHaveBeenCalled();
 });
 it('does not create notes after unload during the source read', async () => {
  const p = plugin();
  vi.spyOn(p.app.vault, 'read').mockImplementation(async () => { p.onunload(); return xml('A'); });
  const create = vi.spyOn(p.app.vault, 'create');
  await expect(p.runImport('Outline.opml', DEFAULT_LAYOUT)).rejects.toThrow('stopped');
  expect(create).not.toHaveBeenCalled();
 });
 it('accepts 10000 roots without Pro and rejects the next item', () => {
  const roots = '<outline text="A"/>'.repeat(10_000);
  const plan = planImport(`<opml><body>${roots}</body></opml>`, 'Outline.opml', { ...DEFAULT_LAYOUT, includeSource: false });
  expect(plan.notes).toHaveLength(10_000);
  expect(plan.notes.at(-1)?.path).toBe('OPML imports/A 10000.md');
  expect(() => planImport(`<opml><body>${roots}<outline/></body></opml>`)).toThrow('10000 item');
 });
 it('accepts the XML depth boundary with a self-closing leaf', () => {
  expect(planImport('<opml><body>' + '<outline>'.repeat(97) + '<outline/>' + '</outline>'.repeat(97) + '</body></opml>').notes).toHaveLength(1);
 });
 it('reports storage errors while it keeps created notes and the source', async () => {
  const source = '<opml><body><outline text="A"/><outline text="B"/><outline text="C"/></body></opml>';
  const p = plugin({ 'Outline.opml': source });
  const create = p.app.vault.create.bind(p.app.vault);
  vi.spyOn(p.app.vault, 'create').mockImplementation(async (path, content) => { if (path.endsWith('/B.md')) throw new Error('Storage error'); return create(path, content); });
  const result = await p.runImport('Outline.opml', DEFAULT_LAYOUT);
  expect(result.created).toEqual(['OPML imports/A.md', 'OPML imports/C.md']);
  expect(result.errors).toEqual(['OPML imports/B.md: Error: Storage error']);
  const original = p.app.vault.getFileByPath('Outline.opml')!;
  expect(await p.app.vault.read(original)).toBe(source);
 });
 it('replaces named presets and keeps the newest 50 layouts', async () => {
  bindPro({ isPro: () => true, onChange: () => () => {} } as never);
  const p = plugin(); vi.spyOn(p, 'saveSettings').mockResolvedValue();
  for (let i = 0; i < 51; i++) await p.savePreset(`Layout ${i}`, DEFAULT_LAYOUT);
  expect(p.settings.presets).toHaveLength(50);
  expect(p.settings.presets[0]?.name).toBe('Layout 1');
  await p.savePreset('Layout 50', { ...DEFAULT_LAYOUT, prefix: 'Updated ' });
  expect(p.settings.presets).toHaveLength(50);
  expect(p.settings.presets.at(-1)?.prefix).toBe('Updated ');
 });
});
