import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { BROWSER_STORAGE } from '../../../../core/services/storage.service';
import { MemoryStorage } from '../../../../../testing/memory-storage';
import { NoteView } from '../../models/note.model';
import { NoteQueryService } from '../../services/note-query.service';
import { NotesStateService } from '../../services/notes-state.service';
import { NotesPageComponent } from './notes-page.component';

describe('NotesPageComponent', () => {
  let fixture: ComponentFixture<NotesPageComponent>;
  let state: NotesStateService;
  let query: NoteQueryService;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotesPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: BROWSER_STORAGE, useValue: new MemoryStorage() },
      ],
    });
    state = TestBed.inject(NotesStateService);
    query = TestBed.inject(NoteQueryService);
  });

  async function render(view: NoteView, tag?: string): Promise<void> {
    fixture = TestBed.createComponent(NotesPageComponent);
    fixture.componentRef.setInput('view', view);
    fixture.componentRef.setInput('tag', tag);
    fixture.detectChanges();
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function cardTitles(): string[] {
    return [...element.querySelectorAll('qn-note-card h3')].map((h) => h.textContent?.trim() ?? '');
  }

  async function refresh(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('shows an empty state with a create action when there are no notes', async () => {
    await render('all');
    expect(element.textContent).toContain('No notes yet');
    expect(element.querySelector('a[href="/notes/new"]')).not.toBeNull();
  });

  it('shows view-specific empty states', async () => {
    for (const [view, text] of [
      ['pinned', 'Nothing pinned'],
      ['archived', 'No archived notes'],
      ['trash', 'Trash is empty'],
    ] as const) {
      await render(view);
      expect(element.textContent).withContext(view).toContain(text);
    }
  });

  it('lists pinned notes in their own section above other notes', async () => {
    state.create({ title: 'Regular' });
    const pinned = state.create({ title: 'Important' });
    state.setPinned(pinned.id, true);
    await render('all');
    const headings = [...element.querySelectorAll('.note-list__heading')].map((h) => h.textContent ?? '');
    expect(headings[0]).toContain('Pinned');
    expect(headings[1]).toContain('Other notes');
    expect(cardTitles()).toEqual(['Important', 'Regular']);
  });

  it('never shows archived or trashed notes in All Notes', async () => {
    state.create({ title: 'Visible' });
    const archived = state.create({ title: 'Archived one' });
    const trashed = state.create({ title: 'Trashed one' });
    state.archive(archived.id);
    state.moveToTrash(trashed.id);
    await render('all');
    expect(cardTitles()).toEqual(['Visible']);
  });

  it('filters as the user types and shows a no-results message', async () => {
    state.create({ title: 'Shopping', content: 'milk' });
    state.create({ title: 'Work', content: 'report' });
    await render('all');

    query.setSearch('MILK');
    await refresh();
    expect(cardTitles()).toEqual(['Shopping']);

    query.setSearch('nothing-matches');
    await refresh();
    expect(element.textContent).toContain('No matching notes');

    element.querySelector<HTMLButtonElement>('qn-empty-state button')?.click();
    await refresh();
    expect(query.search()).toBe('');
    expect(cardTitles().length).toBe(2);
  });

  it('shows only notes with the route tag in tag view', async () => {
    state.create({ title: 'Tagged', tags: ['Work'] });
    state.create({ title: 'Untagged' });
    await render('tag', 'work');
    expect(element.querySelector('h1')?.textContent).toContain('#work');
    expect(cardTitles()).toEqual(['Tagged']);
  });

  it('offers Empty Trash in the Trash view', async () => {
    const note = state.create({ title: 'Gone' });
    state.moveToTrash(note.id);
    await render('trash');
    expect(cardTitles()).toEqual(['Gone']);
    const button = [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Empty Trash'));
    expect(button?.disabled).toBeFalse();
  });
});
