import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import OpmlNoteImportPlugin from '../src/main';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';
import { bindPro, resetPro } from '../src/pro';
import { DEFAULT_LAYOUT, compareText, planImport } from '../src/outline';
import manifest from '../manifest.json';
const XML = '<opml><body><outline text="A"><outline text="one"/></outline><outline text="B" note="Detail"/></body></opml>';
function plugin(files: Record<string, string> = { 'Outline.opml': XML }) { return new OpmlNoteImportPlugin(App.createConfigured__({ files }) as never, manifest as never); }
afterEach(() => resetPro());
describe('vault import', () => {
 it('loads defaults', async () => { const p = plugin(); await p.loadSettings(); expect(p.settings).toEqual(DEFAULT_SETTINGS); });
 it('repairs bad settings', () => { expect(normalizeSettings({ layout: { folder: 5 }, presets: 'bad' })).toEqual(DEFAULT_SETTINGS); expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS); });
 it('creates roots in order and keeps existing notes', async () => { const p = plugin(); const first = await p.runImport('Outline.opml', DEFAULT_LAYOUT); expect(first.created).toEqual(['OPML imports/A.md', 'OPML imports/B.md']); expect(first.errors).toEqual([]); const second = await p.runImport('Outline.opml', DEFAULT_LAYOUT); expect(second.created).toEqual([]); expect(second.skipped).toEqual(first.created); const a = p.app.vault.getAbstractFileByPath(first.created[0]!)!; expect(await p.app.vault.read(a as never)).toContain('- one'); });
 it('uses the layout captured before an asynchronous file read', async () => { const p = plugin(); const layout = { ...DEFAULT_LAYOUT }; vi.spyOn(p.app.vault, 'read').mockImplementation(async () => { layout.folder = 'Changed'; return XML; }); const result = await p.preview('Outline.opml', layout); expect(result.notes[0]?.path).toBe('OPML imports/A.md'); });
 it('rejects malformed XML before writing', async () => { const p = plugin({ 'Outline.opml': '<opml><body>' }); const create = vi.spyOn(p.app.vault, 'create'); await expect(p.runImport('Outline.opml', DEFAULT_LAYOUT)).rejects.toThrow('Invalid XML'); expect(create).not.toHaveBeenCalled(); });
 it('rejects a file that blocks the destination', async () => { const p = plugin({ 'Outline.opml': XML, 'Blocked': 'note' }); await expect(p.preview('Outline.opml', { ...DEFAULT_LAYOUT, folder: 'Blocked/Notes' })).rejects.toThrow('blocks'); });
 it('free account cannot save presets or compare repeats', async () => { const p = plugin(); expect(await p.savePreset('Plan', DEFAULT_LAYOUT)).toBe(false); await expect(p.repeatPreview('Outline.opml', DEFAULT_LAYOUT)).rejects.toThrow('Pro'); });
 it('Pro saves a layout and previews changed text without writing', async () => { bindPro({ isPro: () => true, onChange: () => () => {} } as never); const p = plugin(); vi.spyOn(p, 'saveSettings').mockResolvedValue(); expect(await p.savePreset('Plan', DEFAULT_LAYOUT)).toBe(true); expect(p.settings.presets[0]?.name).toBe('Plan'); await p.runImport('Outline.opml', DEFAULT_LAYOUT); const a = p.app.vault.getAbstractFileByPath('OPML imports/A.md'); await p.app.vault.modify(a as never, '# Personal edit\n'); const create = vi.spyOn(p.app.vault, 'create'); const rows = await p.repeatPreview('Outline.opml', DEFAULT_LAYOUT); expect(rows[0]).toContain('changed'); expect(rows[0]).toContain('- # Personal edit'); expect(rows[1]).toContain('unchanged'); expect(create).not.toHaveBeenCalled(); expect(await p.app.vault.read(a as never)).toBe('# Personal edit\n'); });
 it('preserves source provenance in YAML', () => { expect(planImport(XML, 'Folder/Outline.opml').notes[0]?.content).toContain('opml_source_id: Folder/Outline.opml#1'); });
 it('classifies changed and unchanged text', () => { expect(compareText('A\n', 'A\n').status).toBe('unchanged'); expect(compareText('A\n', 'B\n')).toEqual({ status: 'changed', added: ['B'], removed: ['A'] }); });
 it('makes no request for feeds or external declarations', () => { const fetch = vi.spyOn(globalThis, 'fetch'); try { planImport('<opml><body><outline text="Feed" xmlUrl="https://example.invalid/feed"/></body></opml>'); expect(() => planImport('<!DOCTYPE opml SYSTEM "https://example.invalid/entity"><opml><body/></opml>')).toThrow('DOCTYPE'); expect(fetch).not.toHaveBeenCalled(); } finally { fetch.mockRestore(); } });
 it('rejects size and depth limits', () => { expect(() => planImport(' '.repeat(2_000_001))).toThrow('2 MB'); expect(() => planImport('<opml><body>' + '<outline>'.repeat(100) + '</outline>'.repeat(100) + '</body></opml>')).toThrow('100 level'); });
});
