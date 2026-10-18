import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';

import { NotificationService } from '../../../core/services/notification.service';
import { StorageErrorKind, StorageService } from '../../../core/services/storage.service';
import { Note, NoteDraft, NoteTransitionResult } from '../models/note.model';
import {
  IdFactory,
  applyNoteUpdate,
  archiveNote,
  collectTags,
  createNote,
  isInView,
  pinNote,
  randomId,
  restoreNote,
  sanitizeNotes,
  trashNote,
  unarchiveNote,
  unpinNote,
} from '../utils/note.utils';

export const NOTES_STORAGE_KEY = 'quick-notes:notes';
export const NOTES_STORAGE_VERSION = 1;

/** Injectable clock and ID source so tests can control time and identifiers. */
export const NOTES_CLOCK = new InjectionToken<() => Date>('NOTES_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

export const NOTES_ID_FACTORY = new InjectionToken<IdFactory>('NOTES_ID_FACTORY', {
  providedIn: 'root',
  factory: () => randomId,
});

interface StoredNotes {
  readonly version: number;
  readonly notes: readonly Note[];
}

export type ImportResult =
  | { readonly ok: true; readonly imported: number; readonly skipped: number }
  | { readonly ok: false };

/**
 * Single source of truth for notes, built on signals.
 *
 * Every mutation is applied synchronously to the latest state (`signal.update`) and then
 * persisted, so rapid successive edits can never overwrite each other with stale data.
 * When persisting fails (quota exceeded, storage blocked) the in-memory state is kept, the
 * failure is exposed through `persistError`, and the next mutation or `retryPersist()` tries
 * again — the user's edits are never silently dropped.
 */
@Injectable({ providedIn: 'root' })
export class NotesStateService {
  private readonly storage = inject(StorageService);
  private readonly notifier = inject(NotificationService);
  private readonly clock = inject(NOTES_CLOCK);
  private readonly idFactory = inject(NOTES_ID_FACTORY);
  private readonly document = inject(DOCUMENT);

  private readonly _notes = signal<readonly Note[]>([]);
  private readonly _persistError = signal<StorageErrorKind | null>(null);

  readonly notes = this._notes.asReadonly();
  readonly persistError = this._persistError.asReadonly();
  readonly hasUnpersistedChanges = computed(() => this._persistError() !== null);
  readonly isPersistent = this.storage.isPersistent;

  readonly noteMap = computed(() => new Map(this._notes().map((note) => [note.id, note])));
  readonly tags = computed(() => collectTags(this._notes()));
  readonly counts = computed(() => {
    const notes = this._notes();
    return {
      all: notes.filter((note) => isInView(note, 'all')).length,
      pinned: notes.filter((note) => isInView(note, 'pinned')).length,
      archived: notes.filter((note) => isInView(note, 'archived')).length,
      trash: notes.filter((note) => isInView(note, 'trash')).length,
    };
  });

  constructor() {
    this.load();
    this.listenForOtherTabs();
  }

  getById(id: string): Note | undefined {
    return this.noteMap().get(id);
  }

  // -------------------------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------------------------

  create(draft: Partial<NoteDraft>): Note {
    const existingIds = new Set(this._notes().map((note) => note.id));
    const note = createNote(draft, existingIds, this.clock(), this.idFactory);
    this.commit((notes) => [note, ...notes]);
    return note;
  }

  update(id: string, patch: Partial<NoteDraft>): NoteTransitionResult {
    return this.transition(id, (note) => applyNoteUpdate(note, patch, this.clock()));
  }

  /** Puts back an exact previous version of a note (used by Undo). */
  revert(previous: Note): boolean {
    if (!this.getById(previous.id)) {
      return false;
    }
    this.commit((notes) => notes.map((note) => (note.id === previous.id ? previous : note)));
    return true;
  }

  /** Permanently removes a note. Only notes already in Trash can be deleted. */
  deletePermanently(id: string): boolean {
    const note = this.getById(id);
    if (!note || !note.isDeleted) {
      return false;
    }
    this.commit((notes) => notes.filter((candidate) => candidate.id !== id));
    return true;
  }

  emptyTrash(): number {
    const count = this.counts().trash;
    if (count > 0) {
      this.commit((notes) => notes.filter((note) => !note.isDeleted));
    }
    return count;
  }

  deleteAll(): void {
    this.commit(() => []);
  }

  // -------------------------------------------------------------------------------------------
  // Organisation
  // -------------------------------------------------------------------------------------------

  setPinned(id: string, pinned: boolean): NoteTransitionResult {
    return this.transition(id, pinned ? pinNote : unpinNote);
  }

  archive(id: string): NoteTransitionResult {
    return this.transition(id, archiveNote);
  }

  unarchive(id: string): NoteTransitionResult {
    return this.transition(id, unarchiveNote);
  }

  moveToTrash(id: string): NoteTransitionResult {
    return this.transition(id, (note) => trashNote(note, this.clock()));
  }

  restore(id: string): NoteTransitionResult {
    return this.transition(id, restoreNote);
  }

  // -------------------------------------------------------------------------------------------
  // Import / export / persistence
  // -------------------------------------------------------------------------------------------

  exportJson(): string {
    const payload: StoredNotes = { version: NOTES_STORAGE_VERSION, notes: this._notes() };
    return JSON.stringify(payload, null, 2);
  }

  /** Adds notes from untrusted JSON. Colliding IDs are regenerated, never overwritten. */
  importJson(json: string): ImportResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      return { ok: false };
    }
    const result = sanitizeNotes(parsed, this.clock(), this.idFactory);
    if (!result.valid) {
      return { ok: false };
    }
    const existingIds = new Set(this._notes().map((note) => note.id));
    const incoming = result.notes.map((note) => {
      if (!existingIds.has(note.id)) {
        existingIds.add(note.id);
        return note;
      }
      const copy = createNote({}, existingIds, this.clock(), this.idFactory);
      existingIds.add(copy.id);
      return { ...note, id: copy.id };
    });
    if (incoming.length > 0) {
      this.commit((notes) => [...incoming, ...notes]);
    }
    return { ok: true, imported: incoming.length, skipped: result.dropped };
  }

  /** Attempts to write the current state again after a storage failure. */
  retryPersist(): boolean {
    return this.persist(this._notes());
  }

  // -------------------------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------------------------

  private transition(id: string, apply: (note: Note) => NoteTransitionResult): NoteTransitionResult {
    const current = this.getById(id);
    if (!current) {
      return { ok: false, error: 'not-found' };
    }
    const result = apply(current);
    if (result.ok && result.note !== current) {
      const next = result.note;
      this.commit((notes) => notes.map((note) => (note.id === id ? next : note)));
    }
    return result;
  }

  private commit(updater: (notes: readonly Note[]) => readonly Note[]): void {
    this._notes.update(updater);
    this.persist(this._notes());
  }

  private persist(notes: readonly Note[]): boolean {
    const payload: StoredNotes = { version: NOTES_STORAGE_VERSION, notes };
    const result = this.storage.write(NOTES_STORAGE_KEY, JSON.stringify(payload));
    const previousError = this._persistError();

    if (result.ok) {
      if (previousError !== null) {
        this._persistError.set(null);
        this.notifier.success('All changes are saved again.');
      }
      return true;
    }

    this._persistError.set(result.error);
    if (previousError === null) {
      this.notifier.error(
        result.error === 'quota'
          ? 'Storage is full. Your changes are kept in this tab only — export your notes or free up space.'
          : 'Your changes could not be saved to this browser. They are kept in this tab only.',
        { durationMs: 0 },
      );
    }
    return false;
  }

  private load(): void {
    const stored = this.storage.readJson(NOTES_STORAGE_KEY);
    if (stored.status === 'missing') {
      this._notes.set([]);
      return;
    }

    const result =
      stored.status === 'ok'
        ? sanitizeNotes(stored.value, this.clock(), this.idFactory)
        : { valid: false, notes: [], repaired: 0, dropped: 0 };

    if (!result.valid) {
      const backupKey = `${NOTES_STORAGE_KEY}:backup:${this.clock().toISOString()}`;
      this.storage.write(backupKey, stored.raw);
      this._notes.set([]);
      this.notifier.warning(
        'Your saved notes could not be read. A backup copy was kept in browser storage and you are starting fresh.',
      );
      return;
    }

    this._notes.set(result.notes);
    if (result.repaired > 0 || result.dropped > 0) {
      this.notifier.info(
        `Some saved data needed repair (${result.repaired} fixed, ${result.dropped} unreadable entries skipped).`,
      );
      this.persist(result.notes);
    }
  }

  /** Keeps multiple open tabs in sync. Local unsaved state always wins over remote changes. */
  private listenForOtherTabs(): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    const listener = (event: StorageEvent): void => {
      if (event.key !== NOTES_STORAGE_KEY || this.hasUnpersistedChanges()) {
        return;
      }
      if (event.newValue === null) {
        this._notes.set([]);
        return;
      }
      try {
        const result = sanitizeNotes(JSON.parse(event.newValue) as unknown, this.clock(), this.idFactory);
        if (result.valid) {
          this._notes.set(result.notes);
        }
      } catch {
        // Ignore malformed writes from other tabs; our own state stays intact.
      }
    };
    view.addEventListener('storage', listener);
    inject(DestroyRef).onDestroy(() => view.removeEventListener('storage', listener));
  }
}
