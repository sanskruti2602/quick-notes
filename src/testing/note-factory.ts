import { Note } from '../app/features/notes/models/note.model';

let counter = 0;

/** Builds a valid note for tests; override any field. */
export function makeNote(overrides: Partial<Note> = {}): Note {
  counter++;
  const timestamp = overrides.updatedAt ?? '2026-01-01T10:00:00.000Z';
  return {
    id: overrides.id ?? `test-note-${counter}`,
    title: 'Test note',
    content: 'Some content',
    tags: [],
    color: 'default',
    isPinned: false,
    isArchived: false,
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

/** Sequential, predictable IDs for services under test. */
export function sequentialIds(prefix = 'id'): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
