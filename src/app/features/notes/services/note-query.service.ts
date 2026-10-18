import { Injectable, computed, signal } from '@angular/core';

/** Search text shared by the header search box and the note list pages. */
@Injectable({ providedIn: 'root' })
export class NoteQueryService {
  readonly search = signal('');
  readonly hasSearch = computed(() => this.search().trim().length > 0);

  setSearch(value: string): void {
    this.search.set(value);
  }

  clearSearch(): void {
    this.search.set('');
  }
}
