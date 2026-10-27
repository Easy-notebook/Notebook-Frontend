import { describe, it, expect } from 'vitest';
import {
  NotebookKnowledgeDocument,
  emptyKnowledge,
  type ContextCuration,
  type ContextSource,
} from './model';
const source = (text = 'Keep the original purpose. Check the missing data.'): ContextSource => ({
  id: crypto.randomUUID(),
  notebookId: 'book',
  cellId: 'agent',
  conversationId: 'session',
  messageId: 'turn',
  role: 'user',
  text,
  capturedAt: '2026-10-27T00:00:00Z',
});
const curation = (doc: NotebookKnowledgeDocument): ContextCuration => ({
  expectedVersion: doc.value.version,
  overview: 'Investigate missing values using the captured evidence.',
  startingPoint: 'Preserve the original purpose.',
  openQuestions: 'Which rows are missing?',
  nextSteps: 'Inspect the dataset.',
  references: doc.value.entries.map((entry) => entry.id),
  annotations: [],
});
describe('NotebookKnowledgeDocument', () => {
  it('keeps exact source snapshots, deduplicates selection and builds readable linked folders', () => {
    const message = source();
    const doc = new NotebookKnowledgeDocument(emptyKnowledge('book')).capture(
      message,
      'origin',
      'Original purpose',
      0,
      26
    );
    expect(doc.value.entries[0].quote).toBe(message.text.slice(0, 26));
    expect(doc.capture({ ...message, id: crypto.randomUUID() }, 'origin', 'duplicate', 0, 26)).toBe(
      doc
    );
    const files = doc.files();
    expect(files.get('notebook-context/30-context/current.md')).toContain('Original purpose');
    expect(files.get(`notebook-context/40-sources/${message.id}.md`)).toContain(message.text);
    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        'notebook-context/README.md',
        'notebook-context/00-origins/index.md',
        'notebook-context/10-facts/index.md',
        'notebook-context/20-leads/index.md',
        'notebook-context/90-history/v1.md',
      ])
    );
  });
  it('rejects cross-notebook sources and tampered quote provenance', () => {
    const doc = new NotebookKnowledgeDocument(emptyKnowledge('book'));
    expect(() => doc.capture({ ...source(), notebookId: 'other' }, 'fact', 'Fact', 0, 4)).toThrow(
      'another notebook'
    );
    expect(() => doc.capture(source('short'), 'fact', 'Invalid range', 0, 99)).toThrow('snapshot');
    const next = doc.capture(source(), 'fact', 'Fact', 0, 4);
    expect(
      () =>
        new NotebookKnowledgeDocument({
          ...next.value,
          entries: [{ ...next.value.entries[0], quote: 'invented' }],
        })
    ).toThrow('snapshot');
  });
  it('preserves starting points and facts across curation and exposes conflicts', () => {
    const doc = new NotebookKnowledgeDocument(emptyKnowledge('book')).capture(
      source(),
      'origin',
      'Purpose',
      0,
      26
    );
    const organized = doc.curate(curation(doc));
    expect(organized.value.entries[0]).toEqual(doc.value.entries[0]);
    expect(organized.value.sources).toEqual(doc.value.sources);
    expect(organized.value.history).toHaveLength(2);
    expect(() => organized.curate(curation(doc))).toThrow('VERSION_CONFLICT');
    expect(() =>
      doc.curate({
        ...curation(doc),
        annotations: [
          { id: doc.value.entries[0].id, status: 'resolved', note: 'Changed', relatedIds: [] },
        ],
      })
    ).toThrow('Only leads');
    expect(() => doc.curate({ ...curation(doc), references: [crypto.randomUUID()] })).toThrow(
      'Unknown evidence'
    );
    expect(() => doc.curate({ ...curation(doc), references: [] })).toThrow('must cite');
  });
  it('keeps new evidence visible while marking the older summary stale', () => {
    const doc = new NotebookKnowledgeDocument(emptyKnowledge('book')).capture(
      source(),
      'fact',
      'Evidence',
      0,
      4
    );
    const organized = doc.curate(curation(doc));
    const next = organized.capture(source('New clue'), 'lead', 'New clue', 0, 8);
    expect(next.currentMarkdown()).toContain('整理摘要待更新');
    expect(next.currentMarkdown()).toContain('New clue');
    expect(next.value.curation?.overview).toBe(organized.value.curation?.overview);
  });
});
