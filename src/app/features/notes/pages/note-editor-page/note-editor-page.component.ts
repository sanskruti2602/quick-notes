import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';

import { CanLeave } from '../../../../core/guards/unsaved-changes.guard';
import { ConfirmDialogService } from '../../../../core/services/confirm-dialog.service';
import { NavigationHistoryService } from '../../../../core/services/navigation-history.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SettingsService } from '../../../../core/services/settings.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';
import { NoteDatePipe } from '../../../../shared/pipes/note-date.pipe';
import { NoteEditorComponent, SaveStatus } from '../../components/note-editor/note-editor.component';
import { NoteDraft, emptyDraft } from '../../models/note.model';
import { NoteActionsService, NoteCommand } from '../../services/note-actions.service';
import { NotesStateService } from '../../services/notes-state.service';
import {
  draftErrors,
  draftsEqual,
  isDraftEmpty,
  normalizeTags,
  noteToDraft,
} from '../../utils/note.utils';

export const AUTOSAVE_DELAY_MS = 700;
export const NEW_NOTE_ID = 'new';

/**
 * Routed page around `NoteEditorComponent` (`/notes/new` and `/notes/:id`).
 *
 * Owns persistence for the editor: explicit save, debounced autosave, unsaved-change guards
 * (in-app navigation and tab close), and note-level actions (archive, trash, restore).
 */
@Component({
  selector: 'qn-note-editor-page',
  imports: [RouterLink, IconComponent, EmptyStateComponent, NoteEditorComponent, TooltipDirective, NoteDatePipe],
  templateUrl: './note-editor-page.component.html',
  styleUrl: './note-editor-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class NoteEditorPageComponent implements CanLeave {
  /** Route parameter: a note id or `new`. */
  readonly id = input.required<string>();
  /** Optional `?tag=` query parameter used to pre-fill a new note's tags. */
  readonly tag = input<string | undefined>(undefined);

  protected readonly state = inject(NotesStateService);
  private readonly actions = inject(NoteActionsService);
  private readonly settings = inject(SettingsService);
  private readonly notifier = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly history = inject(NavigationHistoryService);
  private readonly router = inject(Router);

  protected readonly noteId = signal<string | null>(null);
  protected readonly notFound = signal(false);
  protected readonly initialDraft = signal<NoteDraft>(emptyDraft());
  protected readonly savedDraft = signal<NoteDraft>(emptyDraft());
  protected readonly latestDraft = signal<NoteDraft>(emptyDraft());
  protected readonly lastSavedAt = signal<string | null>(null);

  protected readonly note = computed(() => {
    const id = this.noteId();
    return id ? (this.state.getById(id) ?? null) : null;
  });
  protected readonly isNew = computed(() => this.noteId() === null);
  protected readonly readOnly = computed(() => this.note()?.isDeleted ?? false);
  protected readonly canPin = computed(() => !(this.note()?.isArchived ?? false));
  protected readonly dirty = computed(() => !draftsEqual(this.latestDraft(), this.savedDraft()));
  protected readonly pageTitle = computed(() => {
    if (this.isNew()) {
      return 'New note';
    }
    return this.readOnly() ? 'Note in Trash' : 'Edit note';
  });
  protected readonly tagSuggestions = computed(() => this.state.tags().map((tag) => tag.name));

  protected readonly saveStatus = computed<SaveStatus>(() => {
    if (!this.isNew() && this.state.hasUnpersistedChanges()) {
      return 'error';
    }
    if (this.dirty()) {
      const canAutosave = this.settings.autosave() && draftErrors(this.latestDraft()).length === 0;
      return canAutosave ? 'saving' : 'unsaved';
    }
    return this.lastSavedAt() ? 'saved' : 'idle';
  });

  private readonly autosave$ = new Subject<void>();

  constructor() {
    effect(() => {
      const id = this.id();
      const tag = this.tag();
      untracked(() => this.load(id, tag));
    });

    this.autosave$
      .pipe(debounceTime(AUTOSAVE_DELAY_MS), takeUntilDestroyed())
      .subscribe(() => this.autosaveNow());
  }

  /** Where Back / Cancel return to (the last list page visited). */
  protected get backUrl(): string {
    return this.history.returnUrl;
  }

  // ---------------------------------------------------------------------------------------------
  // Editor events
  // ---------------------------------------------------------------------------------------------

  protected onDraftChange(draft: NoteDraft): void {
    if (draftsEqual(draft, this.latestDraft())) {
      return;
    }
    this.latestDraft.set(draft);
    if (this.settings.autosave() && !this.readOnly()) {
      this.autosave$.next();
    }
  }

  protected onSave(draft: NoteDraft): void {
    this.latestDraft.set(draft);
    this.persist(draft, true);
  }

  protected onCancel(): void {
    void this.router.navigateByUrl(this.history.returnUrl);
  }

  // ---------------------------------------------------------------------------------------------
  // Note actions
  // ---------------------------------------------------------------------------------------------

  protected async runCommand(command: NoteCommand): Promise<void> {
    // Never lose in-progress edits: save them before archiving or trashing.
    if (this.dirty() && !this.readOnly() && !this.flushPendingEdits()) {
      this.notifier.warning('Fix the highlighted problems before continuing, or discard your changes.');
      return;
    }
    const note = this.note();
    if (!note) {
      return;
    }
    const changed = await this.actions.run(command, note);
    if (!changed) {
      return;
    }
    if (command === 'trash' || command === 'delete-forever') {
      void this.router.navigateByUrl(command === 'trash' ? this.history.returnUrl : '/trash');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Leaving the page
  // ---------------------------------------------------------------------------------------------

  canLeave(): boolean | Promise<boolean> {
    if (this.readOnly() || !this.dirty()) {
      return true;
    }
    // Leaving anyway, so don't redirect a newly created note to its own URL.
    if (this.settings.autosave() && this.flushPendingEdits(false)) {
      return true;
    }
    return this.confirmDialog.confirm({
      title: 'Discard unsaved changes?',
      message: this.settings.autosave()
        ? 'This note can’t be saved as it is. Leave anyway and lose your changes?'
        : 'You have changes that haven’t been saved. Leave anyway and lose them?',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      tone: 'danger',
    });
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() && this.settings.autosave()) {
      this.flushPendingEdits(false);
    }
    if ((this.dirty() && !this.readOnly()) || this.state.hasUnpersistedChanges()) {
      event.preventDefault();
      // Legacy browsers need returnValue set to show the "Leave site?" prompt.
      event.returnValue = '';
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------------

  private load(id: string, tag: string | undefined): void {
    // Our own replaceUrl navigation after creating a note re-binds the id: keep the editor as is.
    if (id === this.noteId()) {
      return;
    }
    this.lastSavedAt.set(null);
    this.notFound.set(false);

    if (id === NEW_NOTE_ID) {
      const draft = emptyDraft({ tags: tag ? normalizeTags([tag]) : [] });
      this.noteId.set(null);
      this.setDrafts(draft);
      return;
    }

    const note = this.state.getById(id);
    if (!note) {
      this.noteId.set(null);
      this.notFound.set(true);
      return;
    }
    this.noteId.set(note.id);
    this.setDrafts(noteToDraft(note));
  }

  private setDrafts(draft: NoteDraft): void {
    this.initialDraft.set(draft);
    this.savedDraft.set(draft);
    this.latestDraft.set(draft);
  }

  private autosaveNow(): void {
    if (this.dirty() && !this.readOnly() && this.settings.autosave()) {
      this.persist(this.latestDraft(), false);
    }
  }

  /** Saves the latest draft immediately if it is valid. Returns true when nothing is pending. */
  private flushPendingEdits(updateUrl = true): boolean {
    if (!this.dirty()) {
      return true;
    }
    return this.persist(this.latestDraft(), false, updateUrl);
  }

  /**
   * Writes a draft to the store. The draft the user saw is recorded as the saved baseline, so
   * any keystrokes made after this point still count as unsaved.
   */
  private persist(draft: NoteDraft, manual: boolean, updateUrl = true): boolean {
    if (this.readOnly() || draftErrors(draft).length > 0) {
      return false;
    }
    const id = this.noteId();

    if (id === null) {
      if (isDraftEmpty(draft)) {
        return false;
      }
      const created = this.state.create(draft);
      this.noteId.set(created.id);
      this.savedDraft.set(draft);
      this.lastSavedAt.set(created.updatedAt);
      // Swap /notes/new for the real URL. Skipped while leaving the page, because a new
      // navigation here would cancel the one the user started.
      if (updateUrl) {
        void this.router.navigate(['/notes', created.id], { replaceUrl: true });
      }
      if (manual && !this.state.hasUnpersistedChanges()) {
        this.notifier.success('Note created');
      }
      return true;
    }

    const result = this.state.update(id, draft);
    if (!result.ok) {
      this.notifier.warning(
        result.error === 'not-found'
          ? 'This note no longer exists. Copy your text before leaving.'
          : 'This note can’t be edited right now.',
      );
      return false;
    }
    this.savedDraft.set(draft);
    this.lastSavedAt.set(result.note.updatedAt);
    if (manual && !this.state.hasUnpersistedChanges()) {
      this.notifier.success('Note saved');
    }
    return true;
  }
}
