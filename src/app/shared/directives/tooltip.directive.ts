import { Directive, input } from '@angular/core';

/**
 * Lightweight, CSS-driven tooltip (styles in `src/styles/_controls.scss`).
 * The text is also exposed as `aria-label` unless the host already provides one via
 * `tooltipLabel`, so icon-only controls always have an accessible name.
 */
@Directive({
  selector: '[qnTooltip]',
  host: {
    '[attr.data-tooltip]': 'disabled() ? null : qnTooltip()',
    '[attr.data-tooltip-position]': 'position()',
    '[attr.aria-label]': "ariaLabel() === '' ? null : (ariaLabel() ?? qnTooltip())",
  },
})
export class TooltipDirective {
  readonly qnTooltip = input.required<string>();
  readonly position = input<'top' | 'right' | 'bottom'>('top', { alias: 'tooltipPosition' });
  /**
   * Optional accessible name that differs from the tooltip text. Pass an empty string when the
   * host already has a visible text label, so no `aria-label` is added.
   */
  readonly ariaLabel = input<string | null>(null, { alias: 'tooltipLabel' });
  /** Hide the bubble (e.g. when a visible label is already shown) but keep the accessible name. */
  readonly disabled = input(false, { alias: 'tooltipDisabled' });
}
