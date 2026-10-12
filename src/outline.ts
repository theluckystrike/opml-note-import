import { normalizePath, stringifyYaml } from 'obsidian';

export interface OutlineItem { text: string; notes: string[]; urls: string[]; children: OutlineItem[] }
export interface Layout { folder: string; prefix: string; includeSource: boolean }
export interface PlannedNote { path: string; content: string; duplicate: boolean; status: 'new' | 'skip'; sourceId: string }
export interface ImportPlan { notes: PlannedNote[]; warnings: string[] }
export const DEFAULT_LAYOUT: Layout = { folder: 'OPML imports', prefix: '', includeSource: true };

/** Check XML syntax before DOMParser. The browser parser supplies decoded attributes. */
function checkXml(xml: string): void {
	if (xml.length > 2_000_000) throw new Error('The OPML file exceeds the 2 MB text limit.');
	if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DOCTYPE and entity declarations are not permitted.');
	const tokens = xml.match(/<!--[\s\S]*?-->|<\?[^?]*(?:\?(?!>)[^?]*)*\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+/gy) ?? [];
	if (tokens.join('') !== xml) throw new Error('Invalid XML: an incomplete tag was found.');
	const stack: string[] = []; let roots = 0;
	const entities = (text: string) => {
		if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(text)) throw new Error('Invalid XML: an unknown entity was found.');
	};
	for (const token of tokens) {
		if (token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<![CDATA[')) continue;
		if (!token.startsWith('<')) { entities(token); if (!stack.length && token.trim()) throw new Error('Invalid XML: text outside the document.'); continue; }
		const close = /^<\/([\w:.-]+)\s*>$/.exec(token);
		if (close) { if (stack.pop() !== close[1]) throw new Error('Invalid XML: tags do not match.'); continue; }
		const open = /^<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>$/.exec(token);
		if (!open) throw new Error('Invalid XML: a tag or attribute is invalid.');
		const names = [...open[2]!.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)];
		if (new Set(names.map((a) => a[1])).size !== names.length) throw new Error('Invalid XML: duplicate attributes.');
		for (const a of names) entities(a[2] ?? a[3] ?? '');
		if (!stack.length) roots++;
		if (stack.length + 1 > 100) throw new Error('The outline exceeds the 100 level limit.');
		if (!open[3]) stack.push(open[1]!);
	}
	if (stack.length || roots !== 1) throw new Error('Invalid XML: the document is incomplete.');
}

export function safeName(text: string): string {
	let name = Array.from(text.normalize('NFC'), (c) => c.charCodeAt(0) < 32 ? ' ' : c).join('').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
	// Leave room for the extension and a duplicate suffix on byte-limited file systems.
	let bytes = 0;
	name = Array.from(name).slice(0, 100).filter((c) => { bytes += new TextEncoder().encode(c).length; return bytes <= 240; }).join('').replace(/[. ]+$/g, '');
	name = name.replace(/^\.+/, '_');
	if (!name || name === '.') name = 'Untitled';
	if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
	return name;
}
export function cleanLayout(layout: Layout): Layout {
	const folder = normalizePath(layout.folder.trim());
	if (Array.from(folder).some((c) => c.charCodeAt(0) < 32) || folder.split('/').some((s) => s === '..' || s === '.' || /[:*?"<>|]/.test(s)) || folder.split('/').some((s) => s.startsWith('.'))) throw new Error('Use a vault folder path without reserved characters or dot segments.');
	return { folder, prefix: layout.prefix, includeSource: layout.includeSource };
}
function literal(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/([`*_{}[\]<>#!|%])/g, '\\$1').replace(/\r\n?/g, '\n');
}
export function renderItem(root: OutlineItem): string {
	const lines = [`# ${literal(root.text).replace(/\n/g, ' ')}`, ''];
	for (const note of root.notes) lines.push(literal(note), '');
	for (const url of root.urls) lines.push(literal(url), '');
	const visit = (item: OutlineItem, depth: number) => {
		const pad = '  '.repeat(depth);
		lines.push(`${pad}- ${literal(item.text).replace(/\n/g, `\n${pad}  `)}`);
		for (const value of [...item.notes, ...item.urls]) for (const line of literal(value).split('\n')) lines.push(`${pad}  ${line}`);
		for (const child of item.children) visit(child, depth + 1);
	};
	for (const child of root.children) visit(child, 0);
	return lines.join('\n').trimEnd() + '\n';
}
export function planImport(xml: string, source = 'Outline.opml', layout: Layout = DEFAULT_LAYOUT, existing: string[] = []): ImportPlan {
	checkXml(xml);
	const doc = new DOMParser().parseFromString(xml, 'application/xml');
	const error = doc.querySelector('parsererror');
	if (error) throw new Error(`Invalid XML: ${error.textContent ?? 'parse error'}`);
	if (doc.documentElement?.tagName !== 'opml') throw new Error('The document must have an opml root.');
	const bodies = Array.from(doc.documentElement.children).filter((e) => e.tagName === 'body');
	if (bodies.length !== 1) throw new Error('The OPML file must have one body.');
	const warnings: string[] = []; let count = 0;
	const read = (e: Element): OutlineItem => {
		if (++count > 10_000) throw new Error('The outline exceeds the 10000 item limit.');
		const notes: string[] = []; const urls: string[] = [];
		for (const a of Array.from(e.attributes)) {
			if (a.name === 'note' || a.name === '_note') notes.push(a.value);
			else if (['xmlUrl', 'htmlUrl', 'url'].includes(a.name)) urls.push(a.value);
			else if (!['text', 'type'].includes(a.name)) warnings.push(`Unknown attribute ${a.name} on ${e.getAttribute('text') ?? 'Untitled'}.`);
		}
		const children: OutlineItem[] = [];
		for (const child of Array.from(e.children)) { if (child.tagName !== 'outline') throw new Error('Only outline elements can occur inside an outline.'); children.push(read(child)); }
		return { text: e.getAttribute('text') ?? 'Untitled', notes, urls, children };
	};
	const roots = Array.from(bodies[0]!.children).map((e) => { if (e.tagName !== 'outline') throw new Error('Only outline elements can occur inside the body.'); return read(e); });
	const options = cleanLayout(layout); const used = new Set<string>();
	const existingPaths = new Set(existing.map((path) => path.toLowerCase()));
	const nextSuffix = new Map<string, number>();
	const notes = roots.map((root, index): PlannedNote => {
		const base = safeName(options.prefix + root.text); let title = base; let suffix = nextSuffix.get(base.toLowerCase()) ?? 2;
		while (used.has(title.toLowerCase())) title = `${base} ${suffix++}`;
		nextSuffix.set(base.toLowerCase(), suffix);
		const duplicate = title !== base; used.add(title.toLowerCase());
		const path = normalizePath(`${options.folder}/${title}.md`);
		const sourceId = `${normalizePath(source)}#${index + 1}`;
		const header = options.includeSource ? `---\n${stringifyYaml({ opml_source: normalizePath(source), opml_root: index + 1, opml_source_id: sourceId })}---\n\n` : '';
		return { path, content: header + renderItem(root), duplicate, status: existingPaths.has(path.toLowerCase()) ? 'skip' : 'new', sourceId };
	});
	return { notes, warnings };
}
export function compareText(before: string, after: string): { status: 'unchanged' | 'changed'; added: string[]; removed: string[] } {
	const a = before.split('\n'), b = after.split('\n');
	return { status: before === after ? 'unchanged' : 'changed', added: b.filter((line) => !a.includes(line)), removed: a.filter((line) => !b.includes(line)) };
}
