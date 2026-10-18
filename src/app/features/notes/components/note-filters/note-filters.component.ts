import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

import { NoteLayout } from '../../../../core/services/settings.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { NOTE_SORTS, NOTE_SORT_LABELS, NoteSort, TagSummary, isNoteSort } from '../../models/note.model';

/** Sort, tag filter, "pinned only" filter and layout toggle shown above note lists. */
@Component({
  selector: 'qn-note-filters',
  imports: [IconComponent],
  templateUrl: './note-filters.component.html',
  styleUrl: './note-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoteFiltersComponent {
  readonly tags = input<readonly TagSummary[]>([]);
  readonly showTagFilter = input(true);
  readonly showPinnedFilter = input(false);
  readonly hasActiveFilters = input(false);

  readonly selectedTag = model<string | null>(null);
  readonly pinnedOnly = model(false);
  readonly sort = model<NoteSort>('modified');
  readonly layout = model<NoteLayout>('grid');

  readonly clearFilters = output<void>();

  protected readonly sorts = NOTE_SORTS;
  protected readonly sortLabels = NOTE_SORT_LABELS;

  protected onTagChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedTag.set(value === '' ? null : value);
  }

  protected onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (isNoteSort(value)) {
      this.sort.set(value);
    }
  }

  protected onPinnedChange(event: Event): void {
    this.pinnedOnly.set((event.target as HTMLInputElement).checked);
  }
}
