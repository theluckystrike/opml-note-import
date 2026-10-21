import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { DEFAULT_LAYOUT, MAX_DEPTH, type Layout } from './outline';
import { PRO_UI } from './pro';
import type OpmlNoteImportPlugin from './main';
import { helloSettingItems } from './hello/settings';
export interface Preset extends Layout { name: string }
export interface OpmlNoteImportSettings { layout: Layout; presets: Preset[] }
export const DEFAULT_SETTINGS: OpmlNoteImportSettings = { layout: { ...DEFAULT_LAYOUT }, presets: [] };
export function normalizeSettings(saved: unknown): OpmlNoteImportSettings {
	const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<OpmlNoteImportSettings>;
	const layout = (v: Partial<Layout> | undefined): Layout => ({ folder: typeof v?.folder === 'string' ? v.folder : DEFAULT_LAYOUT.folder, prefix: typeof v?.prefix === 'string' ? v.prefix : '', includeSource: typeof v?.includeSource === 'boolean' ? v.includeSource : true, depth: typeof v?.depth === 'number' && Number.isInteger(v.depth) && v.depth >= 1 && v.depth <= MAX_DEPTH ? v.depth : 1 });
	return { layout: layout(s.layout), presets: Array.isArray(s.presets) ? s.presets.filter((v) => v && typeof v.name === 'string').slice(0, 50).map((v) => ({ name: v.name, ...layout(v) })) : [] };
}
export class OpmlNoteImportSettingTab extends PluginSettingTab {
	constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], private importer: OpmlNoteImportPlugin) { super(app, importer); }
	getSettingDefinitions(): SettingDefinitionItem[] {
		// The product rows, then the "More from NoteMods" card (packages/hello).
		return [...this.productSettingDefinitions(), ...helloSettingItems()];
	}

	productSettingDefinitions(): SettingDefinitionItem[] { return this.importer.pro ? sponsorsSettingItems(this.importer.pro, PRO_UI).map((item) => 'type' in item && item.type === 'group' ? { ...item, heading: undefined } : item) : []; }
}
