import { CanDeactivateFn } from '@angular/router';

/** Implemented by routed components that can hold unsaved user input. */
export interface CanLeave {
  /** Resolve `true` to allow navigation, `false` to stay. May prompt the user. */
  canLeave(): boolean | Promise<boolean>;
}

/** Prevents accidental data loss when navigating away from a component with unsaved edits. */
export const unsavedChangesGuard: CanDeactivateFn<CanLeave> = (component) =>
  component ? component.canLeave() : true;
