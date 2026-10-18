import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { NotesStateService } from '../../services/notes-state.service';

/** Index of every tag used by active notes, with counts. */
@Component({
  selector: 'qn-tags-page',
  imports: [RouterLink, IconComponent, EmptyStateComponent],
  templateUrl: './tags-page.component.html',
  styleUrl: './tags-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagsPageComponent {
  protected readonly state = inject(NotesStateService);
}
