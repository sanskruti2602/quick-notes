import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { map } from 'rxjs';

import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';
import { NoteDatePipe } from '../../../../shared/pipes/note-date.pipe';
import {
  NOTE_COLORS,
  NOTE_COLOR_LABELS,
  NOTE_LIMITS,
  NoteColor,
  NoteDraft,
} from '../../models/note.model';
import {
  draftErrors,
  draftsEqual,
  normalizeTags,
  parseTagInput,
  tagsEqual,
} from '../../utils/note.utils';

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

/** Group-level validator mirroring `draftErrors()` so the form and save logic always agree. */
export const noteDraftValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const title: unknown = group.get('title')?.value;
  const content: unknown = group.get('content')?.value;
  const errors = draftErrors({
    title: typeof title === 'string' ? title : '',
    content: typeof content === 'string' ? content : '',
  });
  if (errors.length === 0) {
    return null;
  }
  return Object.fromEntries(errors.map((error) => [error, true]));
};

/**
 * Reusable note form: title, content, tags, colour and pin state, with character counts,
 * validation, dirty tracking against `savedDraft`, and Ctrl/Cmd+S to save.
 *
 * It does not persist anything itself — it emits `save` and `draftChange`, and the host page
 * decides when and how to store the draft (explicit save, autosave, navigation guards).
 */
@Component({
  selector: 'qn-note-editor',
  imports: [ReactiveFormsModule, IconComponent, TooltipDirective, NoteDatePipe],
  templateUrl: './note-editor.component.html',
  styleUrl: './note-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class NoteEditorComponent {
  /** Values to load into the form. Changing this resets the form. */
  readonly initialDraft = input.required<NoteDraft>();
  /** Last persisted values; the form is dirty when it differs from these. */
  readonly savedDraft = input.required<NoteDraft>();
  readonly readOnly = input(false);
  readonly canPin = input(true);
  readonly saveStatus = input<SaveStatus>('idle');
  readonly lastSavedAt = input<string | null>(null);
  readonly tagSuggestions = input<readonly string[]>([]);
  readonly autofocusTitle = input(false);

  readonly save = output<NoteDraft>();
  readonly cancel = output<void>();
  readonly draftChange = output<NoteDraft>();

  protected readonly limits = NOTE_LIMITS;
  protected readonly colors = NOTE_COLORS;
  protected readonly colorLabels = NOTE_COLOR_LABELS;

  protected readonly form = new FormGroup(
    {
      title: new FormControl('', { nonNullable: true }),
      content: new FormControl('', { nonNullable: true }),
      tags: new FormControl<string[]>([], { nonNullable: true }),
      color: new FormControl<NoteColor>('default', { nonNullable: true }),
      isPinned: new FormControl(false, { nonNullable: true }),
    },
    { validators: noteDraftValidator },
  );
  protected readonly tagInput = new FormControl('', { nonNullable: true });
  protected readonly submitted = signal(false);
  protected readonly tagMessage = signal<string | null>(null);

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly contentInput = viewChild<ElementRef<HTMLTextAreaElement>>('contentInput');

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  /** Current form contents as a draft. */
  readonly draft = computed<NoteDraft>(() => {
    const value = this.formValue();
    return { ...value, tags: [...value.tags] };
  });
  readonly dirty = computed(() => !draftsEqual(this.draft(), this.savedDraft()));
  readonly valid = computed(() => this.formStatus() !== 'INVALID');

  protected readonly titleLength = computed(() => this.draft().title.length);
  protected readonly contentLength = computed(() => this.draft().content.length);
  protected readonly contentNearLimit = computed(
    () => this.contentLength() > NOTE_LIMITS.contentMaxLength * 0.9,
  );
  protected readonly errors = computed(() => draftErrors(this.draft()));
  protected readonly showEmptyError = computed(
    () => this.submitted() && this.errors().includes('empty'),
  );
  protected readonly showTitleError = computed(() => this.errors().includes('title-too-long'));
  protected readonly showContentError = computed(() => this.errors().includes('content-too-long'));
  protected readonly atTagLimit = computed(() => this.draft().tags.length >= NOTE_LIMITS.maxTags);
  protected readonly availableSuggestions = computed(() => {
    const used = new Set(this.draft().tags.map((tag) => tag.toLocaleLowerCase()));
    return this.tagSuggestions().filter((tag) => !used.has(tag.toLocaleLowerCase()));
  });

  constructor() {
    effect(() => {
      const draft = this.initialDraft();
      untracked(() => this.resetTo(draft));
    });

    effect(() => {
      const readOnly = this.readOnly();
      const canPin = this.canPin();
      untracked(() => {
        if (readOnly) {
          this.form.disable({ emitEvent: false });
          this.tagInput.disable({ emitEvent: false });
          return;
        }
        this.form.enable({ emitEvent: false });
        this.tagInput.enable({ emitEvent: false });
        if (!canPin) {
          this.form.controls.isPinned.disable({ emitEvent: false });
        }
      });
    });

    effect(() => {
      if (this.autofocusTitle()) {
        this.titleInput()?.nativeElement.focus();
      }
    });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.draftChange.emit(this.draft());
    });
  }

  /** Validates and emits `save`. Returns false when the form is invalid or read-only. */
  requestSave(): boolean {
    if (this.readOnly()) {
      return false;
    }
    this.commitPendingTags();
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (!this.valid()) {
      this.focusFirstInvalid();
      return false;
    }
    this.save.emit(this.draft());
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------------------------

  protected onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commitPendingTags();
    } else if (event.key === 'Backspace' && this.tagInput.value === '') {
      const tags = this.form.controls.tags.value;
      if (tags.length > 0) {
        this.removeTag(tags[tags.length - 1] ?? '');
      }
    }
  }

  protected commitPendingTags(): void {
    const pending = parseTagInput(this.tagInput.value);
    if (pending.length === 0) {
      this.tagInput.setValue('');
      return;
    }
    const current = this.form.controls.tags.value;
    const combined = normalizeTags([...current, ...pending]);
    const rejected = pending.filter((tag) => !combined.some((kept) => tagsEqual(kept, tag)));
    this.tagMessage.set(
      rejected.length > 0 ? `You can add up to ${NOTE_LIMITS.maxTags} tags.` : null,
    );
    if (combined.length !== current.length) {
      this.form.controls.tags.setValue(combined);
      this.form.controls.tags.markAsDirty();
    }
    this.tagInput.setValue('');
  }

  protected removeTag(tag: string): void {
    const next = this.form.controls.tags.value.filter((candidate) => candidate !== tag);
    this.form.controls.tags.setValue(next);
    this.form.controls.tags.markAsDirty();
    this.tagMessage.set(null);
  }

  // ---------------------------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------------------------

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
      // Always block the browser's "Save page" dialog while the editor is open.
      event.preventDefault();
      this.requestSave();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------------

  private resetTo(draft: NoteDraft): void {
    this.form.reset({ ...draft, tags: [...draft.tags] });
    this.tagInput.reset('');
    this.submitted.set(false);
    this.tagMessage.set(null);
  }

  private focusFirstInvalid(): void {
    const errors = this.errors();
    if (errors.includes('content-too-long') && !errors.includes('title-too-long')) {
      this.contentInput()?.nativeElement.focus();
    } else {
      this.titleInput()?.nativeElement.focus();
    }
  }
}
