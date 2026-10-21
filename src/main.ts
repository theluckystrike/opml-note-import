import { Modal, Notice, Plugin, Setting, TFile, TFolder, normalizePath } from 'obsidian';
import { createGitHubSponsors } from './license/github-obsidian';
import type { SponsorsManager } from './license/index';
import { bindPro, isPro, onProChange, resetPro, SPONSORS } from './pro';
import { cleanLayout, compareText, declaredEncoding, MAX_DEPTH, planImport, type ImportPlan, type Layout } from './outline';
import { DEFAULT_SETTINGS, normalizeSettings, OpmlNoteImportSettingTab, type OpmlNoteImportSettings } from './settings';
import { setupHello } from './hello/index';
import WHATS_NEW from './whats-new.json';

export default class OpmlNoteImportPlugin extends Plugin {
	settings: OpmlNoteImportSettings = structuredClone(DEFAULT_SETTINGS);
	pro: SponsorsManager | null = null;
	private dialogs = new Set<ImportModal>();
	private importing = false;
	private stopped = false;
	async onload(): Promise<void> {
		// First: "What's new" reads its state before the settings load (packages/hello). It does not wait.
		setupHello(this, WHATS_NEW);
		await this.loadSettings();
		if (this.stopped) return;
		const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this); pro.init(); this.pro = pro; bindPro(pro);
		const tab = new OpmlNoteImportSettingTab(this.app, this); this.addSettingTab(tab); this.register(pro.onChange(() => tab.update()));
		this.addCommand({ id: 'import-opml', name: 'Import an outline file', callback: () => this.openImport() });
		this.app.workspace.onLayoutReady(() => { if (this.stopped) return; void pro.refresh(); this.registerInterval(window.setInterval(() => void pro.refresh(), 6 * 60 * 60 * 1000)); });
	}
	onunload(): void { this.stopped = true; for (const dialog of this.dialogs) dialog.close(); resetPro(); }
	async loadSettings(): Promise<void> { this.settings = normalizeSettings(await this.loadData()); }
	async saveSettings(): Promise<void> { await this.saveData(this.settings); }
	openImport(source?: string): void { const dialog = new ImportModal(this, source); this.dialogs.add(dialog); dialog.open(); }
	removeDialog(dialog: ImportModal): void { this.dialogs.delete(dialog); }
	async preview(source: string, layout: Layout): Promise<ImportPlan> {
		const options = cleanLayout({ ...layout });
		const file = this.app.vault.getAbstractFileByPath(normalizePath(source));
		if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'opml') throw new Error('Select an OPML file in the vault.');
		const plan = planImport(await this.readOutline(file), file.path, options, this.app.vault.getAllLoadedFiles().map((f) => f.path));
		for (const note of plan.notes) {
			if (this.app.vault.getAbstractFileByPath(note.path)) note.status = 'skip';
			const parts = note.path.split('/'); parts.pop(); let parent = '';
			for (const part of parts) { parent = normalizePath(`${parent}/${part}`); const found = this.app.vault.getAbstractFileByPath(parent); if (found && !(found instanceof TFolder)) throw new Error(`A file blocks the destination folder: ${parent}`); }
		}
		return plan;
	}
	/** Obsidian reads text as UTF-8. Read the bytes again when the XML declaration names another encoding. */
	private async readOutline(file: TFile): Promise<string> {
		const text = await this.app.vault.read(file);
		const label = declaredEncoding(text);
		if (!label || /^utf-?8$/i.test(label)) return text;
		let decoder: TextDecoder;
		try { decoder = new TextDecoder(label); } catch { throw new Error(`The outline uses the ${label} encoding, which this app cannot read.`); }
		return decoder.decode(await this.app.vault.readBinary(file));
	}
	async runImport(source: string, layout: Layout): Promise<{ created: string[]; skipped: string[]; errors: string[]; warnings: string[] }> {
		if (this.stopped) throw new Error('The plugin has stopped.');
		if (this.importing) throw new Error('An import is in progress.');
		this.importing = true;
		try {
			const plan = await this.preview(source, layout); const result = { created: [] as string[], skipped: [] as string[], errors: [] as string[], warnings: plan.warnings };
			if (this.stopped) throw new Error('The plugin has stopped.');
			for (const note of plan.notes) {
				if (this.stopped) { result.errors.push('The plugin has stopped. Remaining notes were not created.'); break; }
				if (note.status === 'skip' || this.app.vault.getAbstractFileByPath(note.path)) { result.skipped.push(note.path); continue; }
				try {
					const parts = note.path.split('/'); parts.pop(); let parent = '';
					for (const part of parts) { if (this.stopped) throw new Error('The plugin has stopped.'); parent = normalizePath(`${parent}/${part}`); if (!this.app.vault.getAbstractFileByPath(parent)) await this.app.vault.createFolder(parent); }
					if (this.stopped) throw new Error('The plugin has stopped.');
					await this.app.vault.create(note.path, note.content); result.created.push(note.path);
				} catch (error) { result.errors.push(`${note.path}: ${String(error)}`); }
			}
			return result;
		} finally { this.importing = false; }
	}
	async savePreset(name: string, layout: Layout): Promise<boolean> {
		if (!isPro()) return false;
		const title = name.trim(); if (!title) throw new Error('Enter a preset name.');
		const preset = { name: title, ...cleanLayout(layout) };
		this.settings.presets = [...this.settings.presets.filter((p) => p.name !== title), preset].slice(-50); await this.saveSettings(); return true;
	}
	async repeatPreview(source: string, layout: Layout): Promise<string[]> {
		if (!isPro()) throw new Error('Repeat previews need Pro.');
		const plan = await this.preview(source, layout); const rows: string[] = [];
		const existing = new Map(this.app.vault.getAllLoadedFiles().map((file) => [file.path.toLowerCase(), file]));
		for (const note of plan.notes) {
			const file = this.app.vault.getAbstractFileByPath(note.path) ?? existing.get(note.path.toLowerCase());
			if (file instanceof TFile) { const delta = compareText(await this.app.vault.read(file), note.content); rows.push(`${note.path}: ${delta.status}\n${delta.added.map((s) => '+ ' + s).join('\n')}\n${delta.removed.map((s) => '- ' + s).join('\n')}`); }
			else rows.push(`${note.path}: ${file ? 'blocked by a folder' : 'new'}`);
		}
		return rows;
	}
}

export class ImportModal extends Modal {
	private source: string;
	private layout: Layout;
	private output!: HTMLElement;
	private release: (() => void) | null = null;
	private revision = 0;
	constructor(private importer: OpmlNoteImportPlugin, source?: string) { super(importer.app); this.source = source ?? ''; this.layout = { ...importer.settings.layout }; }
	onOpen(): void { this.setTitle('Import an outline'); this.contentEl.addClass('opml-note-import'); this.draw(); this.release = onProChange(() => this.draw()); }
	onClose(): void { this.revision++; this.release?.(); this.contentEl.empty(); this.importer.removeDialog(this); }
	private draw(): void {
		this.revision++; this.contentEl.empty(); const el = this.contentEl;
		el.createEl('p', { text: 'One note per item at the chosen level. Nested items stay in order. Existing notes are skipped.' });
		const files = this.app.vault.getFiles().filter((f) => f.extension.toLowerCase() === 'opml');
		if (!this.source) this.source = files[0]?.path ?? '';
		new Setting(el).setName('Source file').addDropdown((d) => { d.addOption('', 'Select a file'); for (const f of files) d.addOption(f.path, f.path); d.setValue(this.source).onChange((v) => { this.source = v; this.invalidate(); }); });
		new Setting(el).setName('Destination folder').addText((t) => t.setValue(this.layout.folder).onChange((v) => { this.layout.folder = v; this.invalidate(); }));
		new Setting(el).setName('File name prefix').addText((t) => t.setValue(this.layout.prefix).onChange((v) => { this.layout.prefix = v; this.invalidate(); }));
		new Setting(el).setName('Note level').setDesc('Level 1 makes one note for each root item. A higher level makes one note for each item at that level.').addDropdown((d) => { for (let n = 1; n <= MAX_DEPTH; n++) d.addOption(String(n), n === 1 ? '1 (root items)' : String(n)); d.setValue(String(this.layout.depth)).onChange((v) => { this.layout.depth = Number(v); this.invalidate(); }); });
		new Setting(el).setName('Source properties').setDesc('Add the source path and root number to each new note. A level above 1 also adds the level and parent items.').addToggle((t) => t.setValue(this.layout.includeSource).onChange((v) => { this.layout.includeSource = v; this.invalidate(); }));
		new Setting(el).setName('Preview and import').addButton((b) => b.setButtonText('Preview').onClick(() => this.showPreview())).addButton((b) => b.setButtonText('Import notes').setCta().onClick(async () => {
			b.setDisabled(true); this.revision++;
			try { const result = await this.importer.runImport(this.source, this.layout); this.output.empty(); this.output.createEl('pre', { text: `Created ${result.created.length} notes. Skipped ${result.skipped.length}. Errors ${result.errors.length}.\n\n${[...result.created.map((p) => 'Created: ' + p), ...result.skipped.map((p) => 'Skipped: ' + p), ...result.errors, ...result.warnings].join('\n')}` }); this.importer.settings.layout = { ...this.layout }; await this.importer.saveSettings(); }
			catch (error) { this.showError(error); } finally { b.setDisabled(false); }
		}));
		this.output = el.createDiv({ cls: 'opml-note-import-output' }); this.output.createEl('p', { text: files.length ? 'Select Preview to inspect names and text.' : 'Copy an .opml file into the vault, then open this command again.' });
		const proControls = el.createEl('details', { cls: 'opml-note-import-pro' }); proControls.createEl('summary', { text: 'Pro layouts and repeat preview' });
		new Setting(proControls).setName('Pro layout presets').setDesc(isPro() ? 'Save the folder, prefix, level and source property option.' : 'Saved layouts and repeat previews need Pro. Open the plugin settings to sign in.').addDropdown((d) => { d.addOption('', 'Select a preset'); if (isPro()) for (const p of this.importer.settings.presets) d.addOption(p.name, p.name); d.setDisabled(!isPro()).onChange((v) => { if (!isPro()) return; const p = this.importer.settings.presets.find((x) => x.name === v); if (p) { this.layout = { folder: p.folder, prefix: p.prefix, includeSource: p.includeSource, depth: p.depth }; this.draw(); } }); });
		let presetName = '';
		new Setting(proControls).setName('Preset name').addText((t) => t.setDisabled(!isPro()).onChange((v) => { presetName = v; })).addButton((b) => b.setButtonText('Save preset').setDisabled(!isPro()).onClick(async () => { try { if (await this.importer.savePreset(presetName, this.layout)) { new Notice('Import layout saved.'); this.draw(); } } catch (error) { this.showError(error); } }));
		new Setting(proControls).setName('Repeated outline import').addButton((b) => b.setButtonText('Preview changes').setDisabled(!isPro()).onClick(async () => {
			const revision = ++this.revision;
			try { const rows = await this.importer.repeatPreview(this.source, this.layout); if (revision !== this.revision) return; this.output.empty(); this.output.createEl('pre', { text: 'Comparison by output path. Existing notes stay unchanged.\n\n' + rows.join('\n\n') }); } catch (error) { if (revision === this.revision) this.showError(error); }
		}));
	}
	private invalidate(): void { this.revision++; this.output.empty(); this.output.createEl('p', { text: 'The options changed. Select preview again.' }); }
	private showError(error: unknown): void { this.output.empty(); this.output.createEl('p', { cls: 'opml-note-import-error', text: String(error) }); }
	async showPreview(): Promise<void> {
		const revision = ++this.revision;
		try {
			const plan = await this.importer.preview(this.source, this.layout); if (revision !== this.revision) return;
			this.output.empty(); this.output.createEl('p', { text: `${plan.notes.length} ${this.layout.depth === 1 ? 'root notes' : `notes from level ${this.layout.depth}`}. ${plan.notes.filter((n) => n.status === 'skip').length} existing paths will be skipped.` });
			for (const note of plan.notes) { const detail = this.output.createEl('details'); detail.createEl('summary', { text: `${note.path} — ${note.status}${note.duplicate ? ' — name conflict, numbered suffix' : ''}` }); detail.createEl('pre', { text: note.content }); }
			for (const warning of plan.warnings) this.output.createEl('p', { text: warning });
			this.output.scrollIntoView({ block: 'nearest' });
		} catch (error) { if (revision === this.revision) this.showError(error); }
	}
}
