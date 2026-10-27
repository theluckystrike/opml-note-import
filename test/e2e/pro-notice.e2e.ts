import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { pluginId } from './load';

// A free user can select Save preset and Preview changes in the import window. The select shows the shared Pro
// notice with the "Sponsor on GitHub" button. No preset is saved and the preview text stays. A Pro user gets the
// comparison of a repeated import.
interface Importer {
	dialogs: Set<{ close(): void }>;
	pro: { opts: { http: unknown }; refreshNow(): Promise<void>; signOut(): void; isPro(): boolean };
	settings: { presets: { name: string }[] };
	loadData(): Promise<unknown>;
}
type Host = { plugins: { plugins: Record<string, Importer> } };
const XML = '<opml><body><outline text="Alpha"><outline text="one"/></outline><outline text="Beta"/></body></opml>';

async function setPro(on: boolean): Promise<boolean> {
	return browser.executeObsidian(async ({ app }, id, enabled) => {
		const p = (app as unknown as Host).plugins.plugins[id]!;
		if (!enabled) { p.pro.signOut(); return p.pro.isPro(); }
		// Synthetic HTTP answer and token. No network request.
		p.pro.opts.http = () => Promise.resolve({ status: 200, json: { data: { viewer: { login: 'demo-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
		app.secretStorage.setSecret(`${id}-github-token`, 'gho_' + '0'.repeat(36));
		await p.pro.refreshNow();
		return p.pro.isPro();
	}, pluginId, on);
}

async function openWindow(): Promise<void> {
	await obsidianPage.write('Pro notice.opml', XML);
	await browser.waitUntil(async () => browser.executeObsidian(({ app }) => app.vault.getAbstractFileByPath('Pro notice.opml') !== null), { timeout: 10000, timeoutMsg: 'OPML file was not indexed' });
	await browser.executeObsidian(({ app }, id) => {
		activeDocument.querySelectorAll('.notice').forEach((n) => n.remove());
		(app as unknown as { plugins: { plugins: Record<string, { openImport(source?: string): void }> } }).plugins.plugins[id]!.openImport('Pro notice.opml');
	}, pluginId);
	await browser.$('.modal-content.opml-note-import').waitForExist();
}

/** Selects the button with this text, then returns the notices, the output text and the saved settings. */
async function select(button: string | null) {
	return browser.executeObsidian(async ({ app }, id, button) => {
		const root = activeDocument.querySelector('.modal-content.opml-note-import')!;
		if (button) {
			activeDocument.querySelectorAll('.notice').forEach((n) => n.remove());
			const b = [...root.querySelectorAll('button')].find((x) => x.textContent === button);
			if (!b) throw new Error(`No button "${button}".`);
			if (b.disabled) throw new Error(`The button "${button}" is disabled.`);
			b.click();
		}
		await new Promise((r) => setTimeout(r, 500));
		const p = (app as unknown as Host).plugins.plugins[id]!;
		return {
			notices: [...activeDocument.querySelectorAll('.notice')].map((n) => ({ text: n.textContent ?? '', sponsor: n.querySelectorAll('.pf-pro-notice-sponsor').length })),
			output: root.querySelector('.opml-note-import-output')?.textContent ?? '',
			presets: JSON.stringify(p.settings.presets),
			saved: JSON.stringify((await p.loadData()) ?? {}),
		};
	}, pluginId, button);
}

describe('Pro controls of the import window', function () {
	afterEach(async () => {
		await browser.executeObsidian(({ app }, id) => { for (const d of (app as unknown as Host).plugins.plugins[id]!.dialogs) d.close(); }, pluginId);
		await setPro(false);
	});

	it('a free user who selects Save preset or Preview changes gets the Pro notice with a Sponsor button, and nothing saves or runs', async () => {
		expect(await setPro(false)).toBe(false);
		await openWindow();
		await select('Preview');
		const before = await select(null);
		expect(before.output).toContain('2 root notes.');
		const save = await select('Save preset');
		if (!save.notices.some((n) => n.text.includes('Saved import layouts need Pro.') && n.sponsor === 1)) throw new Error(`No Pro notice after Save preset: ${JSON.stringify(save.notices)}`);
		expect(save.presets).toBe(before.presets);
		expect(save.saved).toBe(before.saved);
		const compare = await select('Preview changes');
		if (!compare.notices.some((n) => n.text.includes('Repeat previews need Pro.') && n.sponsor === 1)) throw new Error(`No Pro notice after Preview changes: ${JSON.stringify(compare.notices)}`);
		// The free preview stays. No comparison and no error text.
		expect(compare.output).toBe(before.output);
		expect(compare.saved).toBe(before.saved);
	});

	it('a Pro user who selects Preview changes gets the comparison and no Pro notice', async () => {
		expect(await setPro(true)).toBe(true);
		await openWindow();
		const compare = await select('Preview changes');
		expect(compare.output).toContain('Comparison by output path.');
		expect(compare.notices.filter((n) => n.sponsor > 0)).toEqual([]);
	});
});
