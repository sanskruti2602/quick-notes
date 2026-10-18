import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { NoteQueryService } from '../../services/note-query.service';

const LIST_URL = /^\/(notes|pinned|archived|trash|tags\/[^/?#]+)(\?|#|$)/;

/**
 * Header search box. Results update as the user types (case- and accent-insensitive).
 * Press "/" anywhere to focus it and Escape to clear it.
 */
@Component({
  selector: 'qn-note-search',
  imports: [IconComponent],
  templateUrl: './note-search.component.html',
  styleUrl: './note-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onGlobalKeydown($event)',
  },
})
export class NoteSearchComponent {
  protected readonly query = inject(NoteQueryService);
  private readonly router = inject(Router);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  protected onInput(event: Event): void {
    this.query.setSearch((event.target as HTMLInputElement).value);
    // Searching from the editor, tags index or settings jumps to the note list.
    if (!LIST_URL.test(this.router.url)) {
      void this.router.navigate(['/notes']);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.query.hasSearch()) {
      event.preventDefault();
      this.clear();
    }
  }

  protected clear(): void {
    this.query.clearSearch();
    this.input().nativeElement.focus();
  }

  protected onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target;
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (!typing) {
      event.preventDefault();
      this.input().nativeElement.focus();
    }
  }
}
