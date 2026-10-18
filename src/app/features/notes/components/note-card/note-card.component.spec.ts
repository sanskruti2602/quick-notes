import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { makeNote } from '../../../../../testing/note-factory';
import { Note } from '../../models/note.model';
import { NoteCardComponent, NoteCommandEvent } from './note-card.component';

describe('NoteCardComponent', () => {
  let fixture: ComponentFixture<NoteCardComponent>;
  let element: HTMLElement;
  let events: NoteCommandEvent[];

  async function render(note: Note): Promise<void> {
    TestBed.configureTestingModule({
      imports: [NoteCardComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    fixture = TestBed.createComponent(NoteCardComponent);
    fixture.componentRef.setInput('note', note);
    events = [];
    fixture.componentInstance.command.subscribe((event) => events.push(event));
    fixture.detectChanges();
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  async function openMenu(): Promise<string[]> {
    element.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    return [...element.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim() ?? '');
  }

  it('shows title, preview with line breaks, tags and date', async () => {
    await render(makeNote({ title: 'Groceries', content: 'Milk\nEggs', tags: ['home', 'weekly'] }));
    expect(element.querySelector('h3')?.textContent).toContain('Groceries');
    expect(element.querySelector('.note-card__preview')?.textContent).toBe('Milk\nEggs');
    expect(element.textContent).toContain('#home');
    expect(element.querySelector('time')?.getAttribute('datetime')).toBeTruthy();
  });

  it('shows "Untitled Note" and an empty-content hint', async () => {
    await render(makeNote({ title: '  ', content: '' }));
    expect(element.querySelector('h3')?.textContent).toContain('Untitled Note');
    expect(element.textContent).toContain('No content');
  });

  it('emits pin and unpin from the pin button, which has an accessible name', async () => {
    await render(makeNote({ title: 'A' }));
    const pin = element.querySelector<HTMLButtonElement>('.note-card__pin');
    expect(pin?.getAttribute('aria-label')).toBe('Pin note');
    pin?.click();
    expect(events[0]?.command).toBe('pin');
  });

  it('offers archive and trash actions for active notes', async () => {
    await render(makeNote({ title: 'A' }));
    expect(await openMenu()).toEqual(['Edit note', 'Pin', 'Archive', 'Move to Trash']);
    element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[2]?.click();
    expect(events[0]?.command).toBe('archive');
  });

  it('hides pinning for archived notes', async () => {
    await render(makeNote({ isArchived: true }));
    expect(element.querySelector('.note-card__pin')).toBeNull();
    expect(await openMenu()).toEqual(['Edit note', 'Unarchive', 'Move to Trash']);
  });

  it('offers restore and permanent delete in Trash', async () => {
    await render(makeNote({ isDeleted: true, deletedAt: '2026-01-02T00:00:00.000Z' }));
    expect(await openMenu()).toEqual(['View note', 'Restore', 'Delete forever']);
    expect(element.textContent).toContain('Deleted');
  });

  it('closes the menu with Escape and returns focus to the trigger', async () => {
    await render(makeNote({ title: 'A' }));
    await openMenu();
    const menu = element.querySelector('[role="menu"]');
    menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(element.querySelector('[aria-haspopup="menu"]'));
  });
});
