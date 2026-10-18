/**
 * Core note domain types.
 *
 * Business rules (enforced in `note.utils.ts` and `NotesStateService`):
 *  - A note is "active" when it is neither archived nor in Trash. Only active notes appear in
 *    All Notes, Pinned, tag views and the default search scope.
 *  - Only active notes can be pinned. Archiving or trashing a note unpins it.
 *  - Moving a note to Trash keeps its `isArchived` flag, so restoring it returns the note to the
 *    section it came from (Archive or All Notes).
 *  - Notes in Trash are read-only. They must be restored before they can be edited.
 *  - Permanent deletion is only possible for notes that are already in Trash.
 *  - Organisation actions (pin, archive, trash, restore) do not change `updatedAt`; only edits to
 *    the note itself (title, content, tags, colour) count as modifications.
 *  - Titles are stored as typed (trimmed). An empty title is displayed as "Untitled Note".
 *  - Duplicate titles are allowed; notes are always identified by their unique `id`.
 */

export const NOTE_COLORS = [
  'default',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const;

export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_COLOR_LABELS: Readonly<Record<NoteColor, string>> = {
  default: 'No colour',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
};

export interface Note {
  /** Stable, unique identifier (UUID). */
  readonly id: string;
  title: string;
  content: string;
  /** Normalised tags: trimmed, single-spaced, unique (case-insensitive). */
  tags: string[];
  color: NoteColor;
  isPinned: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  /** ISO-8601 timestamp. Never changes after creation. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of the last content edit. Strictly increases on every edit. */
  updatedAt: string;
  /** ISO-8601 timestamp of when the note was moved to Trash, otherwise `null`. */
  deletedAt: string | null;
}

/** The editable part of a note, as produced by the editor form. */
export interface NoteDraft {
  title: string;
  content: string;
  tags: string[];
  color: NoteColor;
  isPinned: boolean;
}

export type NoteView = 'all' | 'pinned' | 'archived' | 'trash' | 'tag';

export const NOTE_SORTS = ['modified', 'newest', 'oldest', 'title'] as const;
export type NoteSort = (typeof NOTE_SORTS)[number];

export const NOTE_SORT_LABELS: Readonly<Record<NoteSort, string>> = {
  modified: 'Last modified',
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'Title (A–Z)',
};

export interface NoteQuery {
  view: NoteView;
  search: string;
  /** Tag to filter by (case-insensitive), or `null` for no tag filter. */
  tag: string | null;
  pinnedOnly: boolean;
  sort: NoteSort;
}

export interface TagSummary {
  name: string;
  count: number;
}

export const NOTE_LIMITS = {
  titleMaxLength: 200,
  contentMaxLength: 20_000,
  tagMaxLength: 30,
  maxTags: 20,
} as const;

export const DEFAULT_NOTE_TITLE = 'Untitled Note';

export type NoteActionError = 'not-found' | 'archived-cannot-pin' | 'in-trash' | 'not-in-trash';

export type NoteTransitionResult =
  | { readonly ok: true; readonly note: Note }
  | { readonly ok: false; readonly error: NoteActionError };

export function emptyDraft(overrides: Partial<NoteDraft> = {}): NoteDraft {
  return { title: '', content: '', tags: [], color: 'default', isPinned: false, ...overrides };
}

export function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === 'string' && (NOTE_COLORS as readonly string[]).includes(value);
}

export function isNoteSort(value: unknown): value is NoteSort {
  return typeof value === 'string' && (NOTE_SORTS as readonly string[]).includes(value);
}
