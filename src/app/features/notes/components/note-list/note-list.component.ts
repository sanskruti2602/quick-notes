import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { NoteLayout } from '../../../../core/services/settings.service';
import { Note } from '../../models/note.model';
import { NoteCardComponent, NoteCommandEvent } from '../note-card/note-card.component';

export interface NoteSection {
  readonly id: string;
  /** Visible heading, or `null` when the list has a single unlabelled section. */
  readonly heading: string | null;
  readonly notes: readonly Note[];
}

/** Renders one or more sections (e.g. Pinned / Others) of note cards as a grid or a list. */
@Component({
  selector: 'qn-note-list',
  imports: [NoteCardComponent],
  templateUrl: './note-list.component.html',
  styleUrl: './note-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.note-list--list]': "layout() === 'list'",
    '[class.note-list--grid]': "layout() === 'grid'",
  },
})
export class NoteListComponent {
  readonly sections = input.required<readonly NoteSection[]>();
  readonly layout = input<NoteLayout>('grid');
  readonly command = output<NoteCommandEvent>();
}
