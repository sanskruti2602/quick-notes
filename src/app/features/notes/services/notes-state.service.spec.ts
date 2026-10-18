import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/services/notification.service';
import { BROWSER_STORAGE } from '../../../core/services/storage.service';
import { MemoryStorage } from '../../../../testing/memory-storage';
import { makeNote, sequentialIds } from '../../../../testing/note-factory';
import { Note } from '../models/note.model';
import {
  NOTES_CLOCK,
  NOTES_ID_FACTORY,
  NOTES_STORAGE_KEY,
  NotesStateService,
} from './notes-state.service';

describe('NotesStateService', () => {
  let backend: MemoryStorage;
  let now: Date;
  let notifier: jasmine.SpyObj<NotificationService>;

  function create(): NotesStateService {
    TestBed.configureTestingModule({
      providers: [
        { provide: BROWSER_STORAGE, useValue: backend },
        { provide: NOTES_CLOCK, useValue: () => now },
        { provide: NOTES_ID_FACTORY, useValue: sequentialIds('note') },
        { provide: NotificationService, useValue: notifier },
      ],
    });
    return TestBed.inject(NotesStateService);
  }

  function stored(): Note[] {
    const raw = backend.getItem(NOTES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { notes: Note[] }).notes : [];
  }

  beforeEach(() => {
    backend = new MemoryStorage();
    now = new Date('2026-05-01T09:00:00.000Z');
    notifier = jasmine.createSpyObj<NotificationService>('NotificationService', [
      'success',
      'info',
      'warning',
      'error',
    ]);
  });

  describe('CRUD', () => {
    it('creates notes and persists them immediately', () => {
      const service = create();
      const note = service.create({ title: 'Hello', content: 'World' });
      expect(service.notes()).toEqual([note]);
      expect(stored()).toEqual([note]);
    });

    it('creates notes with content but no title, or a title but empty content', () => {
      const service = create();
      const untitled = service.create({ content: 'Only content' });
      const titleOnly = service.create({ title: 'Only title' });
      expect(untitled.title).toBe('');
      expect(titleOnly.content).toBe('');
      expect(service.counts().all).toBe(2);
    });

    it('assigns unique ids even for duplicate titles', () => {
      const service = create();
      const a = service.create({ title: 'Same' });
      const b = service.create({ title: 'Same' });
      expect(a.id).not.toBe(b.id);
    });

    it('updates a note while preserving its id and creation date', () => {
      const service = create();
      const note = service.create({ title: 'Draft' });
      now = new Date('2026-05-01T10:00:00.000Z');
      const result = service.update(note.id, { title: 'Final', tags: [' work ', 'Work'] });
      expect(result.ok).toBeTrue();
      const updated = service.getById(note.id);
      expect(updated?.id).toBe(note.id);
      expect(updated?.createdAt).toBe(note.createdAt);
      expect(updated?.title).toBe('Final');
      expect(updated?.tags).toEqual(['work']);
      expect(updated?.updatedAt).toBe('2026-05-01T10:00:00.000Z');
      expect(stored()[0]?.title).toBe('Final');
    });

    it('applies rapid successive edits in order without losing any', () => {
      const service = create();
      const note = service.create({ content: '' });
      for (let i = 1; i <= 20; i++) {
        service.update(note.id, { content: 'x'.repeat(i) });
      }
      expect(service.getById(note.id)?.content).toBe('x'.repeat(20));
      expect(stored()[0]?.content).toBe('x'.repeat(20));
      // Same-millisecond edits still produce strictly increasing timestamps.
      expect(Date.parse(service.getById(note.id)?.updatedAt ?? '')).toBeGreaterThan(Date.parse(note.updatedAt));
    });

    it('reports updates to unknown notes', () => {
      expect(create().update('missing', { title: 'x' })).toEqual({ ok: false, error: 'not-found' });
    });
  });

  describe('organisation', () => {
    it('pins and unpins', () => {
      const service = create();
      const note = service.create({ title: 'A' });
      service.setPinned(note.id, true);
      expect(service.getById(note.id)?.isPinned).toBeTrue();
      expect(service.counts().pinned).toBe(1);
      service.setPinned(note.id, false);
      expect(service.getById(note.id)?.isPinned).toBeFalse();
    });

    it('archives (unpinning) and restores, keeping archived notes out of All Notes', () => {
      const service = create();
      const note = service.create({ title: 'A', isPinned: true });
      service.archive(note.id);
      expect(service.counts()).toEqual({ all: 0, pinned: 0, archived: 1, trash: 0 });
      expect(service.getById(note.id)?.isPinned).toBeFalse();
      expect(service.setPinned(note.id, true)).toEqual({ ok: false, error: 'archived-cannot-pin' });
      service.unarchive(note.id);
      expect(service.counts().all).toBe(1);
    });

    it('moves notes to Trash, restores them, and blocks edits while trashed', () => {
      const service = create();
      const note = service.create({ title: 'A' });
      service.moveToTrash(note.id);
      expect(service.counts()).toEqual({ all: 0, pinned: 0, archived: 0, trash: 1 });
      expect(service.update(note.id, { title: 'B' })).toEqual({ ok: false, error: 'in-trash' });
      service.restore(note.id);
      expect(service.counts().all).toBe(1);
      expect(service.getById(note.id)?.deletedAt).toBeNull();
    });

    it('deletes permanently only from Trash', () => {
      const service = create();
      const note = service.create({ title: 'A' });
      expect(service.deletePermanently(note.id)).toBeFalse();
      service.moveToTrash(note.id);
      expect(service.deletePermanently(note.id)).toBeTrue();
      expect(service.notes()).toEqual([]);
      expect(stored()).toEqual([]);
    });

    it('empties Trash without touching other notes', () => {
      const service = create();
      const keep = service.create({ title: 'Keep' });
      const a = service.create({ title: 'A' });
      const b = service.create({ title: 'B' });
      service.moveToTrash(a.id);
      service.moveToTrash(b.id);
      expect(service.emptyTrash()).toBe(2);
      expect(service.notes().map((n) => n.id)).toEqual([keep.id]);
    });

    it('reverts a note to an earlier version (Undo)', () => {
      const service = create();
      const note = service.create({ title: 'A', isPinned: true });
      const before = service.getById(note.id);
      service.moveToTrash(note.id);
      expect(before && service.revert(before)).toBeTrue();
      expect(service.getById(note.id)).toEqual(before);
    });
  });

  describe('persistence', () => {
    it('restores saved notes after a refresh', () => {
      const first = create();
      const note = first.create({ title: 'Persisted', tags: ['a'] });
      // A brand-new instance reading the same storage simulates a page refresh.
      const second = TestBed.runInInjectionContext(() => new NotesStateService());
      expect(second.notes()).toEqual([note]);
    });

    it('starts empty and keeps a backup when stored data is malformed', () => {
      backend.setItem(NOTES_STORAGE_KEY, '{definitely not json');
      const service = create();
      expect(service.notes()).toEqual([]);
      expect(notifier.warning).toHaveBeenCalled();
      const backupKey = backend.keys().find((key) => key.startsWith(`${NOTES_STORAGE_KEY}:backup:`));
      expect(backupKey).toBeDefined();
      expect(backend.getItem(backupKey ?? '')).toBe('{definitely not json');
    });

    it('treats a non-notes JSON value as malformed', () => {
      backend.setItem(NOTES_STORAGE_KEY, '"just a string"');
      expect(create().notes()).toEqual([]);
      expect(notifier.warning).toHaveBeenCalled();
    });

    it('repairs partially invalid data and reports it', () => {
      backend.setItem(
        NOTES_STORAGE_KEY,
        JSON.stringify({ version: 1, notes: [makeNote({ id: 'ok' }), { id: 'bad', title: 5 }, 42] }),
      );
      const service = create();
      expect(service.notes().map((n) => n.id)).toEqual(['ok', 'bad']);
      expect(notifier.info).toHaveBeenCalled();
    });

    it('keeps edits in memory and flags the error when storage is full', () => {
      const service = create();
      const note = service.create({ title: 'Before' });
      backend.failWrites = 'quota';
      service.update(note.id, { title: 'After' });
      expect(service.getById(note.id)?.title).toBe('After');
      expect(service.persistError()).toBe('quota');
      expect(service.hasUnpersistedChanges()).toBeTrue();
      expect(notifier.error).toHaveBeenCalledTimes(1);

      // Further failures do not spam the user.
      service.update(note.id, { title: 'After 2' });
      expect(notifier.error).toHaveBeenCalledTimes(1);

      // Once space is available, the next save writes everything.
      backend.failWrites = null;
      expect(service.retryPersist()).toBeTrue();
      expect(service.persistError()).toBeNull();
      expect(stored()[0]?.title).toBe('After 2');
    });

    it('works in memory when LocalStorage is unavailable', () => {
      backend.unavailable = true;
      const service = create();
      expect(service.isPersistent).toBeFalse();
      service.create({ title: 'Temp' });
      expect(service.notes().length).toBe(1);
      expect(service.persistError()).toBeNull();
    });

    it('exports and imports notes, regenerating colliding ids', () => {
      const service = create();
      const note = service.create({ title: 'Original' });
      const json = service.exportJson();
      const result = service.importJson(json);
      expect(result).toEqual({ ok: true, imported: 1, skipped: 0 });
      expect(service.notes().length).toBe(2);
      const ids = service.notes().map((n) => n.id);
      expect(new Set(ids).size).toBe(2);
      expect(ids).toContain(note.id);
    });

    it('rejects invalid import files', () => {
      const service = create();
      expect(service.importJson('nope')).toEqual({ ok: false });
      expect(service.importJson('{"foo":1}')).toEqual({ ok: false });
    });
  });

  describe('derived state', () => {
    it('lists tags from active notes', () => {
      const service = create();
      service.create({ title: 'A', tags: ['work', 'ideas'] });
      const archived = service.create({ title: 'B', tags: ['old'] });
      service.archive(archived.id);
      expect(service.tags().map((t) => t.name)).toEqual(['ideas', 'work']);
    });
  });
});
