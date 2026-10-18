import { Injectable, inject } from '@angular/core';

import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Note, NoteActionError, NoteTransitionResult } from '../models/note.model';
import { displayTitle } from '../utils/note.utils';
import { NotesStateService } from './notes-state.service';

export type NoteCommand =
  | 'pin'
  | 'unpin'
  | 'archive'
  | 'unarchive'
  | 'trash'
  | 'restore'
  | 'delete-forever';

const ERROR_MESSAGES: Readonly<Record<NoteActionError, string>> = {
  'not-found': 'That note no longer exists.',
  'archived-cannot-pin': 'Archived notes can’t be pinned. Unarchive the note first.',
  'in-trash': 'Notes in Trash can’t be changed. Restore the note first.',
  'not-in-trash': 'That note is not in Trash.',
};

/**
 * User-facing note operations: wraps state changes with confirmation dialogs, toasts and Undo.
 * Components call this; `NotesStateService` stays free of UI concerns.
 */
@Injectable({ providedIn: 'root' })
export class NoteActionsService {
  private readonly state = inject(NotesStateService);
  private readonly notifier = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  /** Runs a command; resolves `true` when the note was changed. */
  async run(command: NoteCommand, note: Note): Promise<boolean> {
    switch (command) {
      case 'pin':
        return this.report(this.state.setPinned(note.id, true), 'Note pinned');
      case 'unpin':
        return this.report(this.state.setPinned(note.id, false), 'Note unpinned');
      case 'archive':
        return this.report(this.state.archive(note.id), 'Note archived', note);
      case 'unarchive':
        return this.report(this.state.unarchive(note.id), 'Note moved back to your notes', note);
      case 'trash':
        return this.report(this.state.moveToTrash(note.id), 'Note moved to Trash', note);
      case 'restore':
        return this.report(this.state.restore(note.id), 'Note restored', note);
      case 'delete-forever':
        return this.deleteForever(note);
    }
  }

  async deleteForever(note: Note): Promise<boolean> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete forever?',
      message: `“${displayTitle(note)}” will be permanently deleted. This can’t be undone.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
    });
    if (!confirmed) {
      return false;
    }
    if (!this.state.deletePermanently(note.id)) {
      this.notifier.error(ERROR_MESSAGES[note.isDeleted ? 'not-found' : 'not-in-trash']);
      return false;
    }
    this.notifier.success('Note permanently deleted');
    return true;
  }

  async emptyTrash(): Promise<number> {
    const count = this.state.counts().trash;
    if (count === 0) {
      return 0;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'Empty Trash?',
      message: `${count} ${count === 1 ? 'note' : 'notes'} will be permanently deleted. This can’t be undone.`,
      confirmLabel: 'Empty Trash',
      tone: 'danger',
    });
    if (!confirmed) {
      return 0;
    }
    const removed = this.state.emptyTrash();
    this.notifier.success(`Trash emptied (${removed} ${removed === 1 ? 'note' : 'notes'} deleted)`);
    return removed;
  }

  async deleteAll(): Promise<boolean> {
    const total = this.state.notes().length;
    if (total === 0) {
      this.notifier.info('There are no notes to delete.');
      return false;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete all notes?',
      message: `All ${total} notes, including archived notes and Trash, will be permanently deleted. Consider exporting a backup first.`,
      confirmLabel: 'Delete everything',
      tone: 'danger',
    });
    if (!confirmed) {
      return false;
    }
    this.state.deleteAll();
    this.notifier.success('All notes deleted');
    return true;
  }

  private report(result: NoteTransitionResult, successMessage: string, undoFrom?: Note): boolean {
    if (!result.ok) {
      this.notifier.warning(ERROR_MESSAGES[result.error]);
      return false;
    }
    const previous = undoFrom;
    this.notifier.success(
      successMessage,
      previous
        ? {
            action: {
              label: 'Undo',
              run: () => {
                if (this.state.revert(previous)) {
                  this.notifier.info('Action undone');
                }
              },
            },
          }
        : undefined,
    );
    return true;
  }
}
