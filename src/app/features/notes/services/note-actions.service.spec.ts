import { TestBed } from '@angular/core/testing';

import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { NotificationService, ToastOptions } from '../../../core/services/notification.service';
import { BROWSER_STORAGE } from '../../../core/services/storage.service';
import { MemoryStorage } from '../../../../testing/memory-storage';
import { NoteActionsService } from './note-actions.service';
import { NotesStateService } from './notes-state.service';

describe('NoteActionsService', () => {
  let actions: NoteActionsService;
  let state: NotesStateService;
  let confirm: jasmine.SpyObj<ConfirmDialogService>;
  let notifier: jasmine.SpyObj<NotificationService>;

  beforeEach(() => {
    confirm = jasmine.createSpyObj<ConfirmDialogService>('ConfirmDialogService', ['confirm']);
    notifier = jasmine.createSpyObj<NotificationService>('NotificationService', [
      'success',
      'info',
      'warning',
      'error',
    ]);
    TestBed.configureTestingModule({
      providers: [
        { provide: BROWSER_STORAGE, useValue: new MemoryStorage() },
        { provide: ConfirmDialogService, useValue: confirm },
        { provide: NotificationService, useValue: notifier },
      ],
    });
    actions = TestBed.inject(NoteActionsService);
    state = TestBed.inject(NotesStateService);
  });

  it('moves a note to Trash and offers Undo', async () => {
    const note = state.create({ title: 'A', isPinned: true });
    expect(await actions.run('trash', note)).toBeTrue();
    expect(state.getById(note.id)?.isDeleted).toBeTrue();

    const options = notifier.success.calls.mostRecent().args[1] as ToastOptions;
    expect(options.action?.label).toBe('Undo');
    options.action?.run();
    expect(state.getById(note.id)).toEqual(note);
  });

  it('warns instead of pinning an archived note', async () => {
    const note = state.create({ title: 'A' });
    state.archive(note.id);
    const archived = state.getById(note.id);
    expect(archived && (await actions.run('pin', archived))).toBeFalse();
    expect(notifier.warning).toHaveBeenCalled();
  });

  it('asks for confirmation before deleting forever', async () => {
    const note = state.create({ title: 'A' });
    state.moveToTrash(note.id);
    const trashed = state.getById(note.id);

    confirm.confirm.and.resolveTo(false);
    expect(trashed && (await actions.run('delete-forever', trashed))).toBeFalse();
    expect(state.getById(note.id)).toBeDefined();

    confirm.confirm.and.resolveTo(true);
    expect(trashed && (await actions.run('delete-forever', trashed))).toBeTrue();
    expect(state.getById(note.id)).toBeUndefined();
    expect(confirm.confirm.calls.mostRecent().args[0].tone).toBe('danger');
  });

  it('empties Trash only after confirmation', async () => {
    const note = state.create({ title: 'A' });
    state.moveToTrash(note.id);

    confirm.confirm.and.resolveTo(false);
    expect(await actions.emptyTrash()).toBe(0);
    expect(state.counts().trash).toBe(1);

    confirm.confirm.and.resolveTo(true);
    expect(await actions.emptyTrash()).toBe(1);
    expect(state.counts().trash).toBe(0);
  });

  it('does not open a dialog when Trash is already empty', async () => {
    expect(await actions.emptyTrash()).toBe(0);
    expect(confirm.confirm).not.toHaveBeenCalled();
  });
});
