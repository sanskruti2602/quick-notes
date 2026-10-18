import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';

import { ConfirmDialogService } from '../../../../core/services/confirm-dialog.service';
import { SettingsService } from '../../../../core/services/settings.service';
import { BROWSER_STORAGE } from '../../../../core/services/storage.service';
import { MemoryStorage } from '../../../../../testing/memory-storage';
import { NotesStateService } from '../../services/notes-state.service';
import { AUTOSAVE_DELAY_MS, NoteEditorPageComponent } from './note-editor-page.component';

describe('NoteEditorPageComponent', () => {
  let fixture: ComponentFixture<NoteEditorPageComponent>;
  let page: NoteEditorPageComponent;
  let state: NotesStateService;
  let settings: SettingsService;
  let confirm: jasmine.SpyObj<ConfirmDialogService>;
  let router: Router;
  let element: HTMLElement;

  beforeEach(() => {
    confirm = jasmine.createSpyObj<ConfirmDialogService>('ConfirmDialogService', ['confirm']);
    TestBed.configureTestingModule({
      imports: [NoteEditorPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: BROWSER_STORAGE, useValue: new MemoryStorage() },
        { provide: ConfirmDialogService, useValue: confirm },
      ],
    });
    state = TestBed.inject(NotesStateService);
    settings = TestBed.inject(SettingsService);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
  });

  async function render(id: string): Promise<void> {
    fixture = TestBed.createComponent(NoteEditorPageComponent);
    page = fixture.componentInstance;
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function type(selector: string, value: string): void {
    const field = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (!field) {
      throw new Error(`Missing ${selector}`);
    }
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function clickSave(): void {
    element.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    fixture.detectChanges();
  }

  describe('with autosave off', () => {
    beforeEach(() => settings.update({ autosave: false }));

    it('creates a note on explicit save and moves to its URL', async () => {
      await render('new');
      type('#note-title', 'Brand new');
      type('#note-content', 'Body');
      clickSave();
      const [note] = state.notes();
      expect(note?.title).toBe('Brand new');
      expect(router.navigate).toHaveBeenCalledWith(['/notes', note?.id], { replaceUrl: true });
      expect(await page.canLeave()).toBeTrue();
    });

    it('edits an existing note, keeping its id and creation date', async () => {
      const note = state.create({ title: 'Original' });
      await render(note.id);
      type('#note-title', 'Edited');
      clickSave();
      const updated = state.getById(note.id);
      expect(updated?.title).toBe('Edited');
      expect(updated?.createdAt).toBe(note.createdAt);
      expect(state.notes().length).toBe(1);
    });

    it('asks before discarding unsaved changes', async () => {
      const note = state.create({ title: 'Original' });
      await render(note.id);
      type('#note-title', 'Unsaved');

      confirm.confirm.and.resolveTo(false);
      expect(await page.canLeave()).toBeFalse();
      expect(state.getById(note.id)?.title).toBe('Original');

      confirm.confirm.and.resolveTo(true);
      expect(await page.canLeave()).toBeTrue();
    });

    it('lets the user leave freely when nothing changed', async () => {
      const note = state.create({ title: 'Original' });
      await render(note.id);
      expect(await page.canLeave()).toBeTrue();
      expect(confirm.confirm).not.toHaveBeenCalled();
    });
  });

  describe('with autosave on', () => {
    beforeEach(() => {
      settings.update({ autosave: true });
      jasmine.clock().install();
      // Advance Date together with timers so RxJS debounceTime sees time passing.
      jasmine.clock().mockDate(new Date('2026-06-01T12:00:00.000Z'));
    });

    afterEach(() => jasmine.clock().uninstall());

    it('saves automatically after the user pauses typing', async () => {
      const note = state.create({ title: 'Original' });
      await render(note.id);
      type('#note-title', 'Auto 1');
      type('#note-title', 'Auto 2');
      expect(state.getById(note.id)?.title).toBe('Original');
      jasmine.clock().tick(AUTOSAVE_DELAY_MS + 10);
      expect(state.getById(note.id)?.title).toBe('Auto 2');
    });

    it('saves pending edits instead of prompting when navigating away', async () => {
      const note = state.create({ title: 'Original' });
      await render(note.id);
      type('#note-content', 'Typed right before leaving');
      expect(await page.canLeave()).toBeTrue();
      expect(state.getById(note.id)?.content).toBe('Typed right before leaving');
      expect(confirm.confirm).not.toHaveBeenCalled();
    });

    it('saves a new note when leaving without redirecting to its URL', async () => {
      await render('new');
      type('#note-title', 'Written then left');
      expect(await page.canLeave()).toBeTrue();
      expect(state.notes()[0]?.title).toBe('Written then left');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('does not create empty notes', async () => {
      await render('new');
      type('#note-title', '   ');
      jasmine.clock().tick(AUTOSAVE_DELAY_MS + 10);
      expect(state.notes()).toEqual([]);
    });
  });

  it('shows notes in Trash as read-only with a restore action', async () => {
    const note = state.create({ title: 'Trashed' });
    state.moveToTrash(note.id);
    await render(note.id);
    expect(element.textContent).toContain('This note is in Trash');
    expect(element.querySelector<HTMLInputElement>('#note-title')?.disabled).toBeTrue();
    expect(await page.canLeave()).toBeTrue();
  });

  it('shows a not-found state for unknown ids', async () => {
    await render('does-not-exist');
    expect(element.textContent).toContain('Note not found');
  });
});
