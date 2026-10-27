import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, Notice } from 'obsidian-test-mocks/obsidian';
import type { SponsorsManager } from '../src/license/index';
import OpmlNoteImportPlugin, { ImportModal } from '../src/main';
import { bindPro, resetPro } from '../src/pro';
import manifest from '../manifest.json';

// A free user can select Save preset and Preview changes in the import window. The select shows the shared Pro
// notice with the "Sponsor on GitHub" button. No preset is saved, no note is read for a comparison, and the
// preview text stays. A Pro user saves the preset and gets the comparison.
const PITCH = 'Sponsor on GitHub, then sign in from the plugin settings.';
const XML = '<opml><body><outline text="A"><outline text="one"/></outline><outline text="B" note="Detail"/></body></opml>';

function fakePro(pro: boolean): SponsorsManager {
	return {
		isPro: () => pro,
		onChange: () => () => undefined,
		hasToken: () => false,
		isChecking: () => false,
		getState: () => ({ status: 'unchecked', lastAttemptAt: 0 }),
		config: { sponsorLogin: 'theluckystrike', source: 'opml-note-import' },
	} as unknown as SponsorsManager;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setup(pro: boolean) {
	const app = App.createConfigured__({ files: { 'Outline.opml': XML } });
	const plugin = new OpmlNoteImportPlugin(app as never, manifest as never);
	await plugin.loadSettings();
	plugin.saveSettings = vi.fn(async () => undefined);
	bindPro(fakePro(pro));
	const shown: { text: string; buttons: number }[] = [];
	vi.spyOn(Notice.prototype as unknown as { constructor__(): void }, 'constructor__').mockImplementation(function (this: Notice) {
		shown.push({ text: this.messageEl.textContent ?? '', buttons: this.messageEl.querySelectorAll('.pf-pro-notice-sponsor').length });
	});
	const modal = new ImportModal(plugin, 'Outline.opml');
	modal.onOpen();
	return { plugin, modal, shown };
}

const button = (modal: ImportModal, text: string) => {
	const b = [...modal.contentEl.querySelectorAll('button')].find((x) => x.textContent === text);
	if (!b) throw new Error(`No button "${text}".`);
	return b;
};
const output = (modal: ImportModal) => modal.contentEl.querySelector('.opml-note-import-output')?.textContent ?? '';

describe('Pro controls of the import window', () => {
	afterEach(() => { resetPro(); vi.restoreAllMocks(); });

	it('a free user who selects Save preset or Preview changes gets the Pro notice with a Sponsor button, and nothing saves or runs', async () => {
		const { plugin, modal, shown } = await setup(false);
		const savePreset = vi.spyOn(plugin, 'savePreset');
		const repeatPreview = vi.spyOn(plugin, 'repeatPreview');
		const read = vi.spyOn(plugin.app.vault, 'read');
		await modal.showPreview();
		const preview = output(modal);
		expect(preview).toContain('2 root notes');
		const before = JSON.stringify(plugin.settings);
		const save = button(modal, 'Save preset');
		const compare = button(modal, 'Preview changes');
		expect(save.disabled).toBe(false);
		expect(compare.disabled).toBe(false);
		save.click(); await flush();
		compare.click(); await flush();
		expect(shown).toEqual([
			{ text: `Saved import layouts need Pro. ${PITCH}Sponsor on GitHub`, buttons: 1 },
			{ text: `Repeat previews need Pro. ${PITCH}Sponsor on GitHub`, buttons: 1 },
		]);
		expect(savePreset).not.toHaveBeenCalled();
		expect(repeatPreview).not.toHaveBeenCalled();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(JSON.stringify(plugin.settings)).toBe(before);
		// The free preview stays. No error text replaces it.
		expect(output(modal)).toBe(preview);
		expect(read).toHaveBeenCalledTimes(1);
		modal.close();
	});

	it('a Pro user who selects Save preset and Preview changes saves the preset and gets the comparison, with no Pro notice', async () => {
		const { plugin, modal, shown } = await setup(true);
		const name = modal.contentEl.querySelector<HTMLInputElement>('.opml-note-import-pro input')!;
		expect(name.disabled).toBe(false);
		name.value = 'Plan';
		name.dispatchEvent(new Event('input'));
		button(modal, 'Save preset').click();
		// The window draws again after the save: the preset is in the preset list.
		await vi.waitFor(() => { expect([...modal.contentEl.querySelectorAll('.opml-note-import-pro option')].map((o) => o.textContent)).toContain('Plan'); });
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(plugin.settings.presets.map((p) => p.name)).toEqual(['Plan']);
		button(modal, 'Preview changes').click();
		await vi.waitFor(() => { expect(output(modal)).toContain('Comparison by output path.'); });
		expect(output(modal)).toContain('OPML imports/A.md: new');
		expect(shown.filter((n) => n.buttons > 0)).toEqual([]);
		modal.close();
	});
});
