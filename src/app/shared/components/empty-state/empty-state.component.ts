import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent, IconName } from '../icon/icon.component';

/** Friendly placeholder for empty lists and "no results". Project actions as content. */
@Component({
  selector: 'qn-empty-state',
  imports: [IconComponent],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('inbox');
  readonly heading = input.required<string>();
  readonly message = input('');
}
