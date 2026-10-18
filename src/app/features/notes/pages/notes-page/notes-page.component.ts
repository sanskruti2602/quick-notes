import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { NoteLayout, SettingsService } from '../../../../core/services/settings.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { NoteCommandEvent } from '../../components/note-card/note-card.component';
import { NoteFiltersComponent } from '../../components/note-filters/note-filters.component';
import { NoteListComponent, NoteSection } from '../../components/note-list/note-list.component';
import { NoteSort, NoteView } from '../../models/note.model';
import { NoteActionsService } from '../../services/note-actions.service';
import { NoteQueryService } from '../../services/note-query.service';
import { NotesStateService } from '../../services/notes-state.service';
import { isInView, noteHasTag, partitionPinned, queryNotes } from '../../utils/note.utils';

interface ViewCopy {
  readonly title: string;
  readonly description: string;
  readonly emptyIcon: IconName;
  readonly emptyHeading: string;
  readonly emptyMessage: string;
}

const VIEW_COPY: Readonly<Record<NoteView, ViewCopy>> = {
  all: {
    title: 'All Notes',
    description: 'Everything that is not archived or in Trash.',
    emptyIcon: 'note',
    emptyHeading: 'No notes yet',
    emptyMessage: 'Capture your first idea — it will be saved in this browser automatically.',
  },
  pinned: {
    title: 'Pinned',
    description: 'Notes you pinned to the top.',
    emptyIcon: 'pin',
    emptyHeading: 'Nothing pinned',
    emptyMessage: 'Pin important notes from their card or the editor to keep them here.',
  },
  archived: {
    title: 'Archived',
    description: 'Out of the way, but kept safe. Archived notes can’t be pinned.',
    emptyIcon: 'archive',
    emptyHeading: 'No archived notes',
    emptyMessage: 'Archive notes you want to keep but don’t need every day.',
  },
  trash: {
    title: 'Trash',
    description: 'Notes stay here until you restore them or delete them forever.',
    emptyIcon: 'trash',
    emptyHeading: 'Trash is empty',
    emptyMessage: 'Notes you move to Trash appear here and can be restored.',
  },
  tag: {
    title: 'Tag',
    description: 'Active notes with this tag.',
    emptyIcon: 'tag',
    emptyHeading: 'No notes with this tag',
    emptyMessage: 'Add this tag to a note in the editor and it will show up here.',
  },
};

/**
 * One configurable page for every list view (All, Pinned, Archived, Trash, a tag). The view is
 * provided through route data and the tag through the `:tag` route parameter.
 */
@Component({
  selector: 'qn-notes-page',
  imports: [RouterLink, IconComponent, EmptyStateComponent, NoteFiltersComponent, NoteListComponent],
  templateUrl: './notes-page.component.html',
  styleUrl: './notes-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesPageComponent {
  /** Bound from route data. */
  readonly view = input<NoteView>('all');
  /** Bound from the `:tag` route parameter (URL-decoded by the router). */
  readonly tag = input<string | undefined>(undefined);

  protected readonly state = inject(NotesStateService);
  protected readonly query = inject(NoteQueryService);
  private readonly settings = inject(SettingsService);
  private readonly actions = inject(NoteActionsService);

  /** Local filters reset whenever the view (or tag) changes. */
  protected readonly selectedTag = linkedSignal<{ view: NoteView; tag: string | undefined }, string | null>({
    source: () => ({ view: this.view(), tag: this.tag() }),
    computation: () => null,
  });
  protected readonly pinnedOnly = linkedSignal<NoteView, boolean>({
    source: this.view,
    computation: () => false,
  });

  protected readonly sort = this.settings.sort;
  protected readonly layout = this.settings.layout;

  protected readonly copy = computed(() => VIEW_COPY[this.view()]);
  protected readonly heading = computed(() =>
    this.view() === 'tag' ? `#${this.tag() ?? ''}` : this.copy().title,
  );
  protected readonly isTrash = computed(() => this.view() === 'trash');
  protected readonly showPinnedFilter = computed(() => this.view() === 'all' || this.view() === 'tag');
  protected readonly showTagFilter = computed(() => this.view() !== 'tag');

  private readonly effectiveTag = computed(() =>
    this.view() === 'tag' ? (this.tag() ?? '') : this.selectedTag(),
  );

  /** All notes belonging to this view before search/filters (used for empty states). */
  protected readonly viewTotal = computed(() => {
    const view = this.view();
    const tag = this.tag() ?? '';
    return this.state
      .notes()
      .filter((note) => isInView(note, view) && (view !== 'tag' || noteHasTag(note, tag))).length;
  });

  protected readonly results = computed(() =>
    queryNotes(this.state.notes(), {
      view: this.view(),
      search: this.query.search(),
      tag: this.effectiveTag(),
      pinnedOnly: this.pinnedOnly(),
      sort: this.sort(),
    }),
  );

  protected readonly sections = computed<readonly NoteSection[]>(() => {
    const results = this.results();
    const splitPinned = this.showPinnedFilter() && !this.pinnedOnly();
    if (!splitPinned) {
      return [{ id: this.view(), heading: null, notes: results }];
    }
    const { pinned, others } = partitionPinned(results);
    if (pinned.length === 0) {
      return [{ id: 'others', heading: null, notes: others }];
    }
    return [
      { id: 'pinned', heading: 'Pinned', notes: pinned },
      { id: 'others', heading: 'Other notes', notes: others },
    ];
  });

  protected readonly hasActiveFilters = computed(
    () =>
      this.query.hasSearch() ||
      (this.view() !== 'tag' && this.selectedTag() !== null) ||
      this.pinnedOnly(),
  );

  protected readonly resultSummary = computed(() => {
    const count = this.results().length;
    const noun = count === 1 ? 'note' : 'notes';
    return this.hasActiveFilters() ? `${count} matching ${noun}` : `${count} ${noun}`;
  });

  protected readonly noResultsMessage = computed(() => {
    const search = this.query.search().trim();
    return search.length > 0
      ? `Nothing matches “${search}” with the current filters.`
      : 'No notes match the current filters.';
  });

  protected readonly createLinkQuery = computed(() =>
    this.view() === 'tag' && this.tag() ? { tag: this.tag() } : null,
  );

  protected onSortChange(sort: NoteSort): void {
    this.settings.update({ sort });
  }

  protected onLayoutChange(layout: NoteLayout): void {
    this.settings.update({ layout });
  }

  protected clearFilters(): void {
    this.query.clearSearch();
    this.selectedTag.set(null);
    this.pinnedOnly.set(false);
  }

  protected onCommand(event: NoteCommandEvent): void {
    void this.actions.run(event.command, event.note);
  }

  protected emptyTrash(): void {
    void this.actions.emptyTrash();
  }
}
