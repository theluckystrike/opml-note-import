import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import OpmlNoteImportPlugin from '../src/main';
import { DEFAULT_LAYOUT } from '../src/outline';
import { resetPro } from '../src/pro';
import manifest from '../manifest.json';

const bytes = (text: string) => Uint8Array.from(Array.from(text, (c) => c.charCodeAt(0))).buffer;
async function plugin(source: ArrayBuffer) {
 const p = new OpmlNoteImportPlugin(App.createConfigured__({ files: {} }) as never, manifest as never);
 await p.app.vault.createBinary('Outline.opml', source);
 // The vault decodes each text read as UTF-8, as Obsidian does.
 vi.spyOn(p.app.vault, 'read').mockImplementation(async () => new TextDecoder().decode(source));
 return p;
}
afterEach(() => { resetPro(); vi.restoreAllMocks(); });

describe('declared encoding', () => {
 it('decodes a Latin-1 outline with the declared encoding', async () => {
  const p = await plugin(bytes('<?xml version="1.0" encoding="ISO-8859-1"?><opml><body><outline text="Caf\xe9" note="na\xefve"/></body></opml>'));
  const plan = await p.preview('Outline.opml', DEFAULT_LAYOUT);
  expect(plan.notes[0]?.path).toBe('OPML imports/Café.md');
  expect(plan.notes[0]?.content).toContain('naïve');
 });
 it('keeps the UTF-8 read for a UTF-8 declaration', async () => {
  const p = await plugin(new TextEncoder().encode('<?xml version="1.0" encoding="utf-8"?><opml><body><outline text="Café"/></body></opml>').buffer);
  const binary = vi.spyOn(p.app.vault, 'readBinary');
  expect((await p.preview('Outline.opml', DEFAULT_LAYOUT)).notes[0]?.path).toBe('OPML imports/Café.md');
  expect(binary).not.toHaveBeenCalled();
 });
 it('rejects an encoding that the app cannot decode before writing', async () => {
  const p = await plugin(bytes('<?xml version="1.0" encoding="x-unknown"?><opml><body><outline text="A"/></body></opml>'));
  const create = vi.spyOn(p.app.vault, 'create');
  await expect(p.runImport('Outline.opml', DEFAULT_LAYOUT)).rejects.toThrow('x-unknown');
  expect(create).not.toHaveBeenCalled();
 });
});
