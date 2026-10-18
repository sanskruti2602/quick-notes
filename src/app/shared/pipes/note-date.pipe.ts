import { Pipe, PipeTransform } from '@angular/core';

import { formatFullDate, formatNoteDate } from '../../features/notes/utils/note.utils';

/**
 * Friendly date for note metadata: "Today, 8:41 PM", "Yesterday, 9:02 AM", "Oct 3", "Oct 3, 2025".
 * Use `| noteDate: 'full'` for an unambiguous date and time (e.g. tooltips, editor footer).
 */
@Pipe({ name: 'noteDate' })
export class NoteDatePipe implements PipeTransform {
  transform(iso: string | null | undefined, format: 'friendly' | 'full' = 'friendly'): string {
    if (!iso) {
      return '';
    }
    return format === 'full' ? formatFullDate(iso) : formatNoteDate(iso, new Date());
  }
}
