import {
  DEFAULT_NOTE_TITLE,
  Note,
  NOTE_LIMITS,
  NoteDraft,
  NoteQuery,
  NoteSort,
  NoteTransitionResult,
  NoteView,
  TagSummary,
  isNoteColor,
} from '../models/note.model';

/*
 * Pure, framework-free business logic for notes.
 * Everything here is deterministic given its inputs (time and randomness are injectable), which
 * keeps the rules easy to unit test and reuse.
 */

// ---------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------

/** Lower-cases and strips diacritics so "Café" matches "cafe". */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
}

export function displayTitle(note: Pick<Note, 'title'>): string {
  const title = note.title.trim();
  return title.length > 0 ? title : DEFAULT_NOTE_TITLE;
}

export function hasCustomTitle(note: Pick<Note, 'title'>): boolean {
  return note.title.trim().length > 0;
}

/** A single-paragraph-friendly preview that still keeps line breaks for `white-space: pre-line`. */
export function previewText(content: string, maxLength = 240): string {
  const normalised = content.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (normalised.length <= maxLength) {
    return normalised;
  }
  return `${normalised.slice(0, maxLength).trimEnd()}…`;
}

// ---------------------------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------------------------

/** Trims, collapses inner whitespace, removes a leading "#" and enforces the max length. */
export function normalizeTag(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^#+/, '')
    .trim()
    .slice(0, NOTE_LIMITS.tagMaxLength)
    .trim();
}

/** Normalises a list of tags, dropping empties and case-insensitive duplicates (first wins). */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of raw) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const tag = normalizeTag(candidate);
    const key = foldText(tag);
    if (tag.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(tag);
    if (result.length >= NOTE_LIMITS.maxTags) {
      break;
    }
  }
  return result;
}

/** Splits free text such as "work, ideas ,  later" into individual tags. */
export function parseTagInput(input: string): string[] {
  return normalizeTags(input.split(','));
}

export function tagsEqual(a: string, b: string): boolean {
  return foldText(a.trim()) === foldText(b.trim());
}

export function noteHasTag(note: Pick<Note, 'tags'>, tag: string): boolean {
  return note.tags.some((candidate) => tagsEqual(candidate, tag));
}

// ---------------------------------------------------------------------------------------------
// IDs and time
// ---------------------------------------------------------------------------------------------

export type IdFactory = () => string;

export const randomId: IdFactory = () => {
  const cryptoApi: Crypto | undefined = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `note-${Date.now().toString(36)}-${randomPart}`;
};

/** Returns an ID that is guaranteed not to be in `existing`. */
export function generateUniqueId(existing: ReadonlySet<string>, factory: IdFactory = randomId): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = factory();
    if (id.length > 0 && !existing.has(id)) {
      return id;
    }
  }
  // Extremely unlikely fallback: derive from a counter so we never loop forever.
  let counter = existing.size + 1;
  while (existing.has(`note-${counter}`)) {
    counter++;
  }
  return `note-${counter}`;
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Returns an ISO timestamp for `now` that is strictly later than `previousIso`.
 * Guarantees ordering for rapid successive edits made within the same millisecond.
 */
export function nextTimestamp(previousIso: string | null, now: Date): string {
  const nowMs = now.getTime();
  if (previousIso && isValidIsoDate(previousIso)) {
    const previousMs = Date.parse(previousIso);
    if (nowMs <= previousMs) {
      return new Date(previousMs + 1).toISOString();
    }
  }
  return new Date(nowMs).toISOString();
}

// ---------------------------------------------------------------------------------------------
// Creation and updates
// ---------------------------------------------------------------------------------------------

function cleanDraft(draft: Partial<NoteDraft>): Partial<NoteDraft> {
  const cleaned: Partial<NoteDraft> = {};
  if (draft.title !== undefined) {
    cleaned.title = draft.title.trim();
  }
  if (draft.content !== undefined) {
    cleaned.content = draft.content.replace(/\r\n?/g, '\n');
  }
  if (draft.tags !== undefined) {
    cleaned.tags = normalizeTags(draft.tags);
  }
  if (draft.color !== undefined) {
    cleaned.color = isNoteColor(draft.color) ? draft.color : 'default';
  }
  if (draft.isPinned !== undefined) {
    cleaned.isPinned = draft.isPinned;
  }
  return cleaned;
}

export function createNote(
  draft: Partial<NoteDraft>,
  existingIds: ReadonlySet<string>,
  now: Date,
  idFactory: IdFactory = randomId,
): Note {
  const cleaned = cleanDraft(draft);
  const timestamp = now.toISOString();
  return {
    id: generateUniqueId(existingIds, idFactory),
    title: cleaned.title ?? '',
    content: cleaned.content ?? '',
    tags: cleaned.tags ?? [],
    color: cleaned.color ?? 'default',
    isPinned: cleaned.isPinned ?? false,
    isArchived: false,
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

/** True when applying `patch` would change something on `note`. */
export function draftChangesNote(note: Note, patch: Partial<NoteDraft>): boolean {
  const cleaned = cleanDraft(patch);
  return (
    (cleaned.title !== undefined && cleaned.title !== note.title) ||
    (cleaned.content !== undefined && cleaned.content !== note.content) ||
    (cleaned.color !== undefined && cleaned.color !== note.color) ||
    (cleaned.isPinned !== undefined && cleaned.isPinned !== note.isPinned) ||
    (cleaned.tags !== undefined &&
      (cleaned.tags.length !== note.tags.length ||
        cleaned.tags.some((tag, index) => tag !== note.tags[index])))
  );
}

/**
 * Applies an edit. The `id` and `createdAt` are always preserved. Notes in Trash cannot be
 * edited and archived notes cannot become pinned.
 */
export function applyNoteUpdate(note: Note, patch: Partial<NoteDraft>, now: Date): NoteTransitionResult {
  if (note.isDeleted) {
    return { ok: false, error: 'in-trash' };
  }
  const cleaned = cleanDraft(patch);
  if (cleaned.isPinned === true && note.isArchived) {
    return { ok: false, error: 'archived-cannot-pin' };
  }
  if (!draftChangesNote(note, cleaned)) {
    return { ok: true, note };
  }
  const contentChanged =
    (cleaned.title !== undefined && cleaned.title !== note.title) ||
    (cleaned.content !== undefined && cleaned.content !== note.content) ||
    (cleaned.color !== undefined && cleaned.color !== note.color) ||
    (cleaned.tags !== undefined && draftChangesNote(note, { tags: cleaned.tags }));
  return {
    ok: true,
    note: {
      ...note,
      ...cleaned,
      id: note.id,
      createdAt: note.createdAt,
      updatedAt: contentChanged ? nextTimestamp(note.updatedAt, now) : note.updatedAt,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Organisation transitions
// ---------------------------------------------------------------------------------------------

export function pinNote(note: Note): NoteTransitionResult {
  if (note.isDeleted) {
    return { ok: false, error: 'in-trash' };
  }
  if (note.isArchived) {
    return { ok: false, error: 'archived-cannot-pin' };
  }
  return { ok: true, note: note.isPinned ? note : { ...note, isPinned: true } };
}

export function unpinNote(note: Note): NoteTransitionResult {
  if (note.isDeleted) {
    return { ok: false, error: 'in-trash' };
  }
  return { ok: true, note: note.isPinned ? { ...note, isPinned: false } : note };
}

export function archiveNote(note: Note): NoteTransitionResult {
  if (note.isDeleted) {
    return { ok: false, error: 'in-trash' };
  }
  return { ok: true, note: { ...note, isArchived: true, isPinned: false } };
}

export function unarchiveNote(note: Note): NoteTransitionResult {
  if (note.isDeleted) {
    return { ok: false, error: 'in-trash' };
  }
  return { ok: true, note: { ...note, isArchived: false } };
}

export function trashNote(note: Note, now: Date): NoteTransitionResult {
  if (note.isDeleted) {
    return { ok: true, note };
  }
  return { ok: true, note: { ...note, isDeleted: true, isPinned: false, deletedAt: now.toISOString() } };
}

export function restoreNote(note: Note): NoteTransitionResult {
  if (!note.isDeleted) {
    return { ok: false, error: 'not-in-trash' };
  }
  return { ok: true, note: { ...note, isDeleted: false, deletedAt: null } };
}

// ---------------------------------------------------------------------------------------------
// Querying
// ---------------------------------------------------------------------------------------------

export function isActive(note: Note): boolean {
  return !note.isDeleted && !note.isArchived;
}

export function isInView(note: Note, view: NoteView): boolean {
  switch (view) {
    case 'all':
    case 'tag':
      return isActive(note);
    case 'pinned':
      return isActive(note) && note.isPinned;
    case 'archived':
      return note.isArchived && !note.isDeleted;
    case 'trash':
      return note.isDeleted;
  }
}

/** Case- and accent-insensitive search; every whitespace-separated term must match. */
export function matchesSearch(note: Note, search: string): boolean {
  const terms = foldText(search).split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) {
    return true;
  }
  const haystack = foldText(`${note.title}\n${note.content}\n${note.tags.join(' ')}`);
  return terms.every((term) => haystack.includes(term));
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function compareIso(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

/**
 * Returns a new, sorted array. Ties are broken deterministically (last modified, title, then
 * id) so notes with equal timestamps never jump around between renders.
 */
export function sortNotes(notes: readonly Note[], sort: NoteSort): Note[] {
  const tieBreak = (a: Note, b: Note): number =>
    compareIso(b.updatedAt, a.updatedAt) ||
    compareStrings(displayTitle(a), displayTitle(b)) ||
    compareStrings(a.id, b.id);

  const primary: (a: Note, b: Note) => number = (() => {
    switch (sort) {
      case 'modified':
        return (a: Note, b: Note) => compareIso(b.updatedAt, a.updatedAt);
      case 'newest':
        return (a: Note, b: Note) => compareIso(b.createdAt, a.createdAt);
      case 'oldest':
        return (a: Note, b: Note) => compareIso(a.createdAt, b.createdAt);
      case 'title':
        return (a: Note, b: Note) => compareStrings(displayTitle(a), displayTitle(b));
    }
  })();

  return [...notes].sort((a, b) => primary(a, b) || tieBreak(a, b));
}

export function queryNotes(notes: readonly Note[], query: NoteQuery): Note[] {
  const tag = query.tag?.trim() ?? '';
  const filtered = notes.filter(
    (note) =>
      isInView(note, query.view) &&
      (tag.length === 0 || noteHasTag(note, tag)) &&
      (!query.pinnedOnly || note.isPinned) &&
      matchesSearch(note, query.search),
  );
  return sortNotes(filtered, query.sort);
}

export function partitionPinned(notes: readonly Note[]): { pinned: Note[]; others: Note[] } {
  const pinned: Note[] = [];
  const others: Note[] = [];
  for (const note of notes) {
    (note.isPinned ? pinned : others).push(note);
  }
  return { pinned, others };
}

/** Tags used by active notes, with counts, sorted alphabetically. */
export function collectTags(notes: readonly Note[]): TagSummary[] {
  const counts = new Map<string, TagSummary>();
  for (const note of notes) {
    if (!isActive(note)) {
      continue;
    }
    for (const tag of note.tags) {
      const key = foldText(tag);
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { name: tag, count: 1 });
      }
    }
  }
  return [...counts.values()].sort((a, b) => compareStrings(a.name, b.name));
}

// ---------------------------------------------------------------------------------------------
// Persistence validation
// ---------------------------------------------------------------------------------------------

export interface SanitizeResult {
  /** False when the root value was not a recognisable notes payload at all. */
  readonly valid: boolean;
  readonly notes: Note[];
  /** Notes that were kept but needed at least one field fixed. */
  readonly repaired: number;
  /** Entries that were discarded because they were not notes. */
  readonly dropped: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractList(input: unknown): unknown[] | null {
  if (Array.isArray(input)) {
    return input;
  }
  if (isRecord(input) && Array.isArray(input['notes'])) {
    return input['notes'];
  }
  return null;
}

/**
 * Validates untrusted data (from LocalStorage or an import file) and turns it into well-formed
 * notes. Recoverable problems are repaired rather than throwing data away.
 */
export function sanitizeNotes(
  input: unknown,
  now: Date,
  idFactory: IdFactory = randomId,
): SanitizeResult {
  const list = extractList(input);
  if (list === null) {
    return { valid: false, notes: [], repaired: 0, dropped: 0 };
  }

  const usedIds = new Set<string>();
  const notes: Note[] = [];
  let repaired = 0;
  let dropped = 0;
  const fallbackDate = now.toISOString();

  for (const entry of list) {
    if (
      !isRecord(entry) ||
      (typeof entry['id'] !== 'string' &&
        typeof entry['title'] !== 'string' &&
        typeof entry['content'] !== 'string')
    ) {
      dropped++;
      continue;
    }

    let fixed = false;
    const rawId = entry['id'];
    let id: string;
    if (typeof rawId === 'string' && rawId.trim().length > 0 && !usedIds.has(rawId)) {
      id = rawId;
    } else {
      id = generateUniqueId(usedIds, idFactory);
      fixed = true;
    }
    usedIds.add(id);

    const title = typeof entry['title'] === 'string' ? entry['title'] : '';
    const content = typeof entry['content'] === 'string' ? entry['content'] : '';
    if (typeof entry['title'] !== 'string' || typeof entry['content'] !== 'string') {
      fixed = true;
    }

    const rawTags = entry['tags'];
    const tags = Array.isArray(rawTags)
      ? normalizeTags(rawTags.filter((tag): tag is string => typeof tag === 'string'))
      : [];
    if (!Array.isArray(rawTags) || tags.length !== rawTags.length) {
      fixed = true;
    }

    const color = isNoteColor(entry['color']) ? entry['color'] : 'default';
    if (color !== entry['color']) {
      fixed = true;
    }

    const isDeleted = entry['isDeleted'] === true;
    const isArchived = entry['isArchived'] === true;
    let isPinned = entry['isPinned'] === true;
    if (isPinned && (isDeleted || isArchived)) {
      isPinned = false;
      fixed = true;
    }

    const updatedAt = isValidIsoDate(entry['updatedAt'])
      ? entry['updatedAt']
      : isValidIsoDate(entry['createdAt'])
        ? entry['createdAt']
        : fallbackDate;
    const createdAt = isValidIsoDate(entry['createdAt']) ? entry['createdAt'] : updatedAt;
    if (!isValidIsoDate(entry['updatedAt']) || !isValidIsoDate(entry['createdAt'])) {
      fixed = true;
    }

    let deletedAt: string | null = null;
    if (isDeleted) {
      deletedAt = isValidIsoDate(entry['deletedAt']) ? entry['deletedAt'] : updatedAt;
    }

    if (fixed) {
      repaired++;
    }
    notes.push({
      id,
      title,
      content,
      tags,
      color,
      isPinned,
      isArchived,
      isDeleted,
      createdAt,
      updatedAt,
      deletedAt,
    });
  }

  return { valid: true, notes, repaired, dropped };
}

// ---------------------------------------------------------------------------------------------
// Drafts and dates
// ---------------------------------------------------------------------------------------------

export function noteToDraft(note: Note): NoteDraft {
  return {
    title: note.title,
    content: note.content,
    tags: [...note.tags],
    color: note.color,
    isPinned: note.isPinned,
  };
}

export function draftsEqual(a: NoteDraft, b: NoteDraft): boolean {
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.color === b.color &&
    a.isPinned === b.isPinned &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index])
  );
}

export function isDraftEmpty(draft: Pick<NoteDraft, 'title' | 'content'>): boolean {
  return draft.title.trim().length === 0 && draft.content.trim().length === 0;
}

export type DraftError = 'empty' | 'title-too-long' | 'content-too-long';

/** Validation shared by the editor form and the save logic. */
export function draftErrors(draft: Pick<NoteDraft, 'title' | 'content'>): DraftError[] {
  const errors: DraftError[] = [];
  if (isDraftEmpty(draft)) {
    errors.push('empty');
  }
  if (draft.title.trim().length > NOTE_LIMITS.titleMaxLength) {
    errors.push('title-too-long');
  }
  if (draft.content.length > NOTE_LIMITS.contentMaxLength) {
    errors.push('content-too-long');
  }
  return errors;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today, 8:41 PM", "Yesterday, 9:02 AM", "Oct 3" or "Oct 3, 2025". */
export function formatNoteDate(iso: string, now: Date, locale?: string): string {
  if (!isValidIsoDate(iso)) {
    return '';
  }
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (dayDiff === 0) {
    return `Today, ${time}`;
  }
  if (dayDiff === 1) {
    return `Yesterday, ${time}`;
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

export function formatFullDate(iso: string, locale?: string): string {
  if (!isValidIsoDate(iso)) {
    return '';
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}
