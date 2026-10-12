import { describe, expect, it } from 'vitest';
import vectors from './vectors/opml-note-import.json';
import { planImport, type Layout } from '../src/outline';
interface Case { name: string; args: [string, string, Layout, string[]]; expected: Record<string, unknown> }
describe('golden acceptance vectors', () => {
 it('has at least 20 cases', () => expect(vectors.cases.length).toBeGreaterThanOrEqual(20));
 for (const c of vectors.cases as Case[]) it(c.name, () => {
  if (c.expected.error) { expect(() => planImport(...c.args)).toThrow(String(c.expected.error)); return; }
  const result = planImport(...c.args);
  const got = { paths: result.notes.map(n => n.path), bodies: result.notes.map(n => n.content.replace(/^---\n[\s\S]*?---\n\n/, '')), duplicates: result.notes.map(n => n.duplicate), statuses: result.notes.map(n => n.status), warnings: result.warnings };
  expect(Object.fromEntries(Object.keys(c.expected).map(k => [k, got[k as keyof typeof got]]))).toEqual(c.expected);
 });
});
