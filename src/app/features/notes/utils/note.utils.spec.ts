import { makeNote, sequentialIds } from '../../../../testing/note-factory';
import { NOTE_LIMITS, NoteQuery } from '../models/note.model';
import {
  applyNoteUpdate,
  archiveNote,
  collectTags,
  createNote,
  displayTitle,
  draftErrors,
  formatNoteDate,
  generateUniqueId,
  isInView,
  matchesSearch,
  nextTimestamp,
  normalizeTag,
  normalizeTags,
  parseTagInput,
  partitionPinned,
  pinNote,
  previewText,
  queryNotes,
  restoreNote,
  sanitizeNotes,
  sortNotes,
  trashNote,
  unarchiveNote,
  unpinNote,
} from './note.utils';

const NOW = new Date('2026-03-10T12:00:00.000Z');

function query(overrides: Partial<NoteQuery> = {}): NoteQuery {
  return { view: 'all', search: '', tag: null, pinnedOnly: false, sort: 'modified', ...overrides };
}

describe('note.utils', () => {
  describe('titles and previews', () => {
    it('uses "Untitled Note" for empty or whitespace titles', () => {
      expect(displayTitle({ title: '' })).toBe('Untitled Note');
      expect(displayTitle({ title: '   ' })).toBe('Untitled Note');
      expect(displayTitle({ title: '  Groceries ' })).toBe('Groceries');
    });

    it('keeps line breaks in previews and truncates long content', () => {
      expect(previewText('Line 1\r\nLine 2')).toBe('Line 1\nLine 2');
      expect(previewText('a\n\n\n\nb')).toBe('a\n\nb');
      const long = 'x'.repeat(300);
      const preview = previewText(long, 50);
      expect(preview.length).toBe(51);
      expect(preview.endsWith('…')).toBeTrue();
    });
  });

  describe('tags', () => {
    it('trims leading/trailing whitespace and collapses inner spaces', () => {
      expect(normalizeTag('  work   stuff  ')).toBe('work stuff');
      expect(normalizeTag('#ideas')).toBe('ideas');
      expect(normalizeTag('   ')).toBe('');
    });

    it('drops empty tags and case-insensitive duplicates, keeping the first spelling', () => {
      expect(normalizeTags(['Work', ' work ', 'WORK', '', '  ', 'home'])).toEqual(['Work', 'home']);
    });

    it('enforces the maximum tag length and count', () => {
      const longTag = 'a'.repeat(NOTE_LIMITS.tagMaxLength + 10);
      expect(normalizeTag(longTag).length).toBe(NOTE_LIMITS.tagMaxLength);
      const many = Array.from({ length: NOTE_LIMITS.maxTags + 5 }, (_, i) => `tag${i}`);
      expect(normalizeTags(many).length).toBe(NOTE_LIMITS.maxTags);
    });

    it('parses comma-separated input', () => {
      expect(parseTagInput(' a, b ,, c ,a')).toEqual(['a', 'b', 'c']);
    });

    it('collects tags from active notes only, with counts', () => {
      const notes = [
        makeNote({ tags: ['Work', 'ideas'] }),
        makeNote({ tags: ['work'] }),
        makeNote({ tags: ['archived-only'], isArchived: true }),
        makeNote({ tags: ['trash-only'], isDeleted: true }),
      ];
      expect(collectTags(notes)).toEqual([
        { name: 'ideas', count: 1 },
        { name: 'Work', count: 2 },
      ]);
    });
  });

  describe('ids and timestamps', () => {
    it('never returns an id that already exists', () => {
      const factory = jasmine.createSpy('factory').and.returnValues('a', 'b', 'c');
      expect(generateUniqueId(new Set(['a', 'b']), factory)).toBe('c');
    });

    it('falls back to a counter if the factory keeps colliding', () => {
      const id = generateUniqueId(new Set(['dup']), () => 'dup');
      expect(id).not.toBe('dup');
    });

    it('produces strictly increasing timestamps for edits within the same millisecond', () => {
      const first = nextTimestamp(null, NOW);
      const second = nextTimestamp(first, NOW);
      const third = nextTimestamp(second, new Date(NOW.getTime() - 5000));
      expect(Date.parse(second)).toBeGreaterThan(Date.parse(first));
      expect(Date.parse(third)).toBeGreaterThan(Date.parse(second));
    });
  });

  describe('createNote', () => {
    it('creates a note with a title and content', () => {
      const note = createNote({ title: '  Plan  ', content: 'Body' }, new Set(), NOW, () => 'n1');
      expect(note).toEqual({
        id: 'n1',
        title: 'Plan',
        content: 'Body',
        tags: [],
        color: 'default',
        isPinned: false,
        isArchived: false,
        isDeleted: false,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        deletedAt: null,
      });
    });

    it('allows content without a title and a title without content', () => {
      const untitled = createNote({ content: 'Only content' }, new Set(), NOW);
      const empty = createNote({ title: 'Only title' }, new Set(), NOW);
      expect(displayTitle(untitled)).toBe('Untitled Note');
      expect(empty.content).toBe('');
    });

    it('normalises tags and avoids duplicate ids', () => {
      const ids = sequentialIds('n');
      const existing = new Set(['n-1']);
      const note = createNote({ tags: [' a ', 'A', 'b'] }, existing, NOW, ids);
      expect(note.id).toBe('n-2');
      expect(note.tags).toEqual(['a', 'b']);
    });
  });

  describe('applyNoteUpdate', () => {
    it('preserves id and createdAt and bumps updatedAt', () => {
      const note = makeNote({ id: 'keep', createdAt: '2025-01-01T00:00:00.000Z' });
      const result = applyNoteUpdate(note, { title: 'New title' }, NOW);
      expect(result.ok).toBeTrue();
      if (result.ok) {
        expect(result.note.id).toBe('keep');
        expect(result.note.createdAt).toBe('2025-01-01T00:00:00.000Z');
        expect(result.note.title).toBe('New title');
        expect(result.note.updatedAt).toBe(NOW.toISOString());
      }
    });

    it('returns the same object when nothing changed', () => {
      const note = makeNote({ title: 'Same' });
      const result = applyNoteUpdate(note, { title: '  Same  ' }, NOW);
      expect(result.ok && result.note).toBe(note);
    });

    it('does not bump updatedAt for a pin-only change', () => {
      const note = makeNote();
      const result = applyNoteUpdate(note, { isPinned: true }, NOW);
      expect(result.ok && result.note.updatedAt).toBe(note.updatedAt);
      expect(result.ok && result.note.isPinned).toBeTrue();
    });

    it('rejects edits to notes in Trash and pinning archived notes', () => {
      expect(applyNoteUpdate(makeNote({ isDeleted: true }), { title: 'x' }, NOW)).toEqual({
        ok: false,
        error: 'in-trash',
      });
      expect(applyNoteUpdate(makeNote({ isArchived: true }), { isPinned: true }, NOW)).toEqual({
        ok: false,
        error: 'archived-cannot-pin',
      });
    });
  });

  describe('organisation rules', () => {
    it('pins and unpins active notes', () => {
      const pinned = pinNote(makeNote());
      expect(pinned.ok && pinned.note.isPinned).toBeTrue();
      const unpinned = pinned.ok ? unpinNote(pinned.note) : pinned;
      expect(unpinned.ok && unpinned.note.isPinned).toBeFalse();
    });

    it('refuses to pin archived or trashed notes', () => {
      expect(pinNote(makeNote({ isArchived: true }))).toEqual({ ok: false, error: 'archived-cannot-pin' });
      expect(pinNote(makeNote({ isDeleted: true }))).toEqual({ ok: false, error: 'in-trash' });
    });

    it('unpins a note when archiving it, and restores it unpinned', () => {
      const archived = archiveNote(makeNote({ isPinned: true }));
      expect(archived.ok && archived.note).toEqual(jasmine.objectContaining({ isArchived: true, isPinned: false }));
      const restored = archived.ok ? unarchiveNote(archived.note) : archived;
      expect(restored.ok && restored.note.isArchived).toBeFalse();
    });

    it('moves to Trash (unpinning) and restores to the original section', () => {
      const archived = makeNote({ isArchived: true });
      const trashed = trashNote(archived, NOW);
      expect(trashed.ok && trashed.note).toEqual(
        jasmine.objectContaining({ isDeleted: true, isArchived: true, deletedAt: NOW.toISOString() }),
      );
      const restored = trashed.ok ? restoreNote(trashed.note) : trashed;
      expect(restored.ok && restored.note).toEqual(
        jasmine.objectContaining({ isDeleted: false, isArchived: true, deletedAt: null }),
      );
    });

    it('only restores notes that are in Trash', () => {
      expect(restoreNote(makeNote())).toEqual({ ok: false, error: 'not-in-trash' });
    });
  });

  describe('views and search', () => {
    const active = makeNote({ id: 'active', title: 'Shopping list', content: 'Milk\nEggs' });
    const pinned = makeNote({ id: 'pinned', title: 'Pinned', isPinned: true });
    const archived = makeNote({ id: 'archived', title: 'Old shopping', isArchived: true });
    const trashed = makeNote({ id: 'trashed', title: 'Shopping trash', isDeleted: true });
    const all = [active, pinned, archived, trashed];

    it('keeps archived and trashed notes out of All Notes', () => {
      expect(all.filter((n) => isInView(n, 'all')).map((n) => n.id)).toEqual(['active', 'pinned']);
      expect(all.filter((n) => isInView(n, 'pinned')).map((n) => n.id)).toEqual(['pinned']);
      expect(all.filter((n) => isInView(n, 'archived')).map((n) => n.id)).toEqual(['archived']);
      expect(all.filter((n) => isInView(n, 'trash')).map((n) => n.id)).toEqual(['trashed']);
    });

    it('searches title and content case-insensitively', () => {
      expect(matchesSearch(active, 'SHOPPING')).toBeTrue();
      expect(matchesSearch(active, 'eggs')).toBeTrue();
      expect(matchesSearch(active, 'milk shopping')).toBeTrue();
      expect(matchesSearch(active, 'bread')).toBeFalse();
    });

    it('ignores accents and surrounding whitespace', () => {
      const note = makeNote({ title: 'Café notes' });
      expect(matchesSearch(note, '  cafe ')).toBeTrue();
      expect(matchesSearch(note, '')).toBeTrue();
    });

    it('never returns trashed notes from normal search', () => {
      const results = queryNotes(all, query({ search: 'shopping' }));
      expect(results.map((n) => n.id)).toEqual(['active']);
    });

    it('searches within the current view', () => {
      expect(queryNotes(all, query({ view: 'trash', search: 'shopping' })).map((n) => n.id)).toEqual([
        'trashed',
      ]);
    });

    it('returns an empty list when nothing matches', () => {
      expect(queryNotes(all, query({ search: 'zzz' }))).toEqual([]);
    });

    it('filters by tag (case-insensitive) and pinned status', () => {
      const tagged = makeNote({ id: 'tagged', tags: ['Work'], isPinned: true });
      const notes = [...all, tagged];
      expect(queryNotes(notes, query({ tag: ' work ' })).map((n) => n.id)).toEqual(['tagged']);
      expect(queryNotes(notes, query({ pinnedOnly: true })).map((n) => n.id).sort()).toEqual([
        'pinned',
        'tagged',
      ]);
    });

    it('splits pinned from other notes', () => {
      const { pinned: p, others } = partitionPinned([active, pinned]);
      expect(p).toEqual([pinned]);
      expect(others).toEqual([active]);
    });
  });

  describe('sortNotes', () => {
    const a = makeNote({ id: 'a', title: 'banana', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' });
    const b = makeNote({ id: 'b', title: 'Apple', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z' });
    const c = makeNote({ id: 'c', title: '', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-06T00:00:00.000Z' });

    it('sorts by last modified, newest, oldest and title', () => {
      expect(sortNotes([a, b, c], 'modified').map((n) => n.id)).toEqual(['c', 'a', 'b']);
      expect(sortNotes([a, b, c], 'newest').map((n) => n.id)).toEqual(['b', 'c', 'a']);
      expect(sortNotes([a, b, c], 'oldest').map((n) => n.id)).toEqual(['a', 'c', 'b']);
      // "Untitled Note" sorts by its display title.
      expect(sortNotes([a, b, c], 'title').map((n) => n.id)).toEqual(['b', 'a', 'c']);
    });

    it('breaks ties deterministically for equal timestamps and duplicate titles', () => {
      const ts = '2026-02-01T00:00:00.000Z';
      const x = makeNote({ id: 'x', title: 'Same', createdAt: ts, updatedAt: ts });
      const y = makeNote({ id: 'y', title: 'Same', createdAt: ts, updatedAt: ts });
      const z = makeNote({ id: 'z', title: 'Alpha', createdAt: ts, updatedAt: ts });
      const first = sortNotes([y, x, z], 'modified').map((n) => n.id);
      const second = sortNotes([x, z, y], 'modified').map((n) => n.id);
      expect(first).toEqual(['z', 'x', 'y']);
      expect(second).toEqual(first);
    });

    it('does not mutate the input array', () => {
      const input = [a, b, c];
      sortNotes(input, 'title');
      expect(input.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('sanitizeNotes', () => {
    it('accepts the versioned envelope and plain arrays', () => {
      const note = makeNote({ id: 'ok' });
      expect(sanitizeNotes({ version: 1, notes: [note] }, NOW).notes).toEqual([note]);
      expect(sanitizeNotes([note], NOW).notes).toEqual([note]);
    });

    it('rejects payloads that are not notes at all', () => {
      expect(sanitizeNotes('hello', NOW).valid).toBeFalse();
      expect(sanitizeNotes({ foo: 1 }, NOW).valid).toBeFalse();
      expect(sanitizeNotes(null, NOW).valid).toBeFalse();
    });

    it('repairs missing or invalid fields instead of discarding notes', () => {
      const result = sanitizeNotes(
        [{ id: 'x', title: 42, content: 'body', tags: [' a ', 7, 'A'], color: 'neon', isPinned: 'yes', createdAt: 'nope' }],
        NOW,
      );
      expect(result.valid).toBeTrue();
      expect(result.repaired).toBe(1);
      expect(result.notes[0]).toEqual({
        id: 'x',
        title: '',
        content: 'body',
        tags: ['a'],
        color: 'default',
        isPinned: false,
        isArchived: false,
        isDeleted: false,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        deletedAt: null,
      });
    });

    it('drops entries that are not notes', () => {
      const result = sanitizeNotes([1, 'two', null, [], { unrelated: true }, makeNote()], NOW);
      expect(result.dropped).toBe(5);
      expect(result.notes.length).toBe(1);
    });

    it('regenerates duplicate or missing ids', () => {
      const result = sanitizeNotes(
        [makeNote({ id: 'dup' }), makeNote({ id: 'dup' }), { title: 'no id', content: '' }],
        NOW,
        sequentialIds('fixed'),
      );
      const ids = result.notes.map((n) => n.id);
      expect(new Set(ids).size).toBe(3);
      expect(ids[0]).toBe('dup');
    });

    it('enforces pin/archive/trash consistency', () => {
      const result = sanitizeNotes([makeNote({ isPinned: true, isArchived: true })], NOW);
      expect(result.notes[0]?.isPinned).toBeFalse();
    });
  });

  describe('draftErrors', () => {
    it('requires a title or content', () => {
      expect(draftErrors({ title: ' ', content: '\n' })).toEqual(['empty']);
      expect(draftErrors({ title: 'Title only', content: '' })).toEqual([]);
      expect(draftErrors({ title: '', content: 'Content only' })).toEqual([]);
    });

    it('enforces length limits', () => {
      expect(draftErrors({ title: 'x'.repeat(NOTE_LIMITS.titleMaxLength + 1), content: '' })).toEqual([
        'title-too-long',
      ]);
      expect(draftErrors({ title: '', content: 'x'.repeat(NOTE_LIMITS.contentMaxLength + 1) })).toEqual([
        'content-too-long',
      ]);
    });
  });

  describe('formatNoteDate', () => {
    const now = new Date(2026, 9, 17, 20, 0);

    // ICU may use a narrow no-break space before AM/PM; normalise whitespace for comparison.
    const format = (date: Date): string =>
      formatNoteDate(date.toISOString(), now, 'en-US').replace(/\s/g, ' ');

    it('formats today, yesterday, this year and older dates', () => {
      expect(format(new Date(2026, 9, 17, 8, 41))).toBe('Today, 8:41 AM');
      expect(format(new Date(2026, 9, 16, 21, 5))).toBe('Yesterday, 9:05 PM');
      expect(format(new Date(2026, 2, 3))).toBe('Mar 3');
      expect(format(new Date(2024, 2, 3))).toBe('Mar 3, 2024');
    });

    it('returns an empty string for invalid dates', () => {
      expect(formatNoteDate('not a date', now)).toBe('');
    });
  });
});
