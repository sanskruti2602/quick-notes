import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ActionMenuComponent, MenuItem } from '../../../../shared/components/action-menu/action-menu.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';
import { NoteDatePipe } from '../../../../shared/pipes/note-date.pipe';
import { NOTE_COLOR_LABELS, Note } from '../../models/note.model';
import { NoteCommand } from '../../services/note-actions.service';
import { displayTitle, hasCustomTitle, previewText } from '../../utils/note.utils';

export interface NoteCommandEvent {
  readonly command: NoteCommand;
  readonly note: Note;
}

const MAX_VISIBLE_TAGS = 3;
const OPEN_ITEM = 'open';

/** Presentational card for a single note. Emits commands; the page decides what they do. */
@Component({
  selector: 'qn-note-card',
  imports: [RouterLink, IconComponent, ActionMenuComponent, TooltipDirective, NoteDatePipe],
  templateUrl: './note-card.component.html',
  styleUrl: './note-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoteCardComponent {
  readonly note = input.required<Note>();
  readonly command = output<NoteCommandEvent>();

  private readonly router = inject(Router);

  protected readonly title = computed(() => displayTitle(this.note()));
  protected readonly isUntitled = computed(() => !hasCustomTitle(this.note()));
  protected readonly preview = computed(() => previewText(this.note().content));
  protected readonly titleId = computed(() => `note-title-${this.note().id}`);
  protected readonly colorLabel = computed(() =>
    this.note().color === 'default' ? null : NOTE_COLOR_LABELS[this.note().color],
  );
  protected readonly visibleTags = computed(() => this.note().tags.slice(0, MAX_VISIBLE_TAGS));
  protected readonly hiddenTagCount = computed(() =>
    Math.max(0, this.note().tags.length - MAX_VISIBLE_TAGS),
  );
  protected readonly canPin = computed(() => !this.note().isArchived && !this.note().isDeleted);

  protected readonly menuItems = computed<readonly MenuItem[]>(() => {
    const note = this.note();
    if (note.isDeleted) {
      return [
        { id: OPEN_ITEM, label: 'View note', icon: 'note' },
        { id: 'restore', label: 'Restore', icon: 'restore' },
        { id: 'delete-forever', label: 'Delete forever', icon: 'trash', danger: true },
      ];
    }
    if (note.isArchived) {
      return [
        { id: OPEN_ITEM, label: 'Edit note', icon: 'note' },
        { id: 'unarchive', label: 'Unarchive', icon: 'archive-restore' },
        { id: 'trash', label: 'Move to Trash', icon: 'trash', danger: true },
      ];
    }
    return [
      { id: OPEN_ITEM, label: 'Edit note', icon: 'note' },
      note.isPinned
        ? { id: 'unpin', label: 'Unpin', icon: 'pin-off' }
        : { id: 'pin', label: 'Pin', icon: 'pin' },
      { id: 'archive', label: 'Archive', icon: 'archive' },
      { id: 'trash', label: 'Move to Trash', icon: 'trash', danger: true },
    ];
  });

  protected togglePin(): void {
    this.emit(this.note().isPinned ? 'unpin' : 'pin');
  }

  protected onMenuSelect(id: string): void {
    if (id === OPEN_ITEM) {
      void this.router.navigate(['/notes', this.note().id]);
      return;
    }
    if (isNoteCommand(id)) {
      this.emit(id);
    }
  }

  private emit(command: NoteCommand): void {
    this.command.emit({ command, note: this.note() });
  }
}

const COMMANDS: readonly NoteCommand[] = [
  'pin',
  'unpin',
  'archive',
  'unarchive',
  'trash',
  'restore',
  'delete-forever',
];

function isNoteCommand(value: string): value is NoteCommand {
  return (COMMANDS as readonly string[]).includes(value);
}
