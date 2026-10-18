import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { NOTE_LIMITS, NoteDraft, emptyDraft } from '../../models/note.model';
import { NoteEditorComponent } from './note-editor.component';

describe('NoteEditorComponent', () => {
  let fixture: ComponentFixture<NoteEditorComponent>;
  let component: NoteEditorComponent;
  let element: HTMLElement;
  let saved: NoteDraft[];

  async function setup(initial: NoteDraft = emptyDraft(), options: { readOnly?: boolean; canPin?: boolean } = {}): Promise<void> {
    TestBed.configureTestingModule({
      imports: [NoteEditorComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(NoteEditorComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('initialDraft', initial);
    fixture.componentRef.setInput('savedDraft', initial);
    fixture.componentRef.setInput('readOnly', options.readOnly ?? false);
    fixture.componentRef.setInput('canPin', options.canPin ?? true);
    saved = [];
    component.save.subscribe((draft) => saved.push(draft));
    fixture.detectChanges();
    await fixture.whenStable();
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

  function query<T extends Element>(selector: string): T | null {
    return element.querySelector<T>(selector);
  }

  it('loads the initial draft into the form', async () => {
    await setup(emptyDraft({ title: 'Hello', content: 'World', tags: ['a'] }));
    expect(query<HTMLInputElement>('#note-title')?.value).toBe('Hello');
    expect(query<HTMLTextAreaElement>('#note-content')?.value).toBe('World');
    expect(element.textContent).toContain('#a');
    expect(component.dirty()).toBeFalse();
  });

  it('tracks dirty state against the saved draft', async () => {
    await setup(emptyDraft({ title: 'Hello' }));
    type('#note-title', 'Hello!');
    expect(component.dirty()).toBeTrue();
    type('#note-title', 'Hello');
    expect(component.dirty()).toBeFalse();
  });

  it('shows the character count', async () => {
    await setup();
    type('#note-content', 'abcde');
    expect(query('#note-content-count')?.textContent).toContain('5 / 20,000');
  });

  it('blocks saving an empty note with a helpful message', async () => {
    await setup();
    expect(component.requestSave()).toBeFalse();
    fixture.detectChanges();
    expect(saved).toEqual([]);
    expect(query('#note-empty-error')?.textContent).toContain('Add a title or some content');
  });

  it('saves a note with only a title (empty content)', async () => {
    await setup();
    type('#note-title', 'Title only');
    expect(component.requestSave()).toBeTrue();
    expect(saved[0]).toEqual(jasmine.objectContaining({ title: 'Title only', content: '' }));
  });

  it('saves a note with content but no title', async () => {
    await setup();
    type('#note-content', 'Line 1\nLine 2');
    component.requestSave();
    expect(saved[0]?.content).toBe('Line 1\nLine 2');
    expect(saved[0]?.title).toBe('');
  });

  it('rejects content over the limit', async () => {
    await setup();
    type('#note-content', 'x'.repeat(NOTE_LIMITS.contentMaxLength + 1));
    expect(component.requestSave()).toBeFalse();
    fixture.detectChanges();
    expect(query('#note-content-error')).not.toBeNull();
    expect(query('#note-content')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('saves with Ctrl+S and Cmd+S and prevents the browser dialog', async () => {
    await setup();
    type('#note-title', 'Shortcut');
    const ctrl = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    document.dispatchEvent(ctrl);
    const cmd = new KeyboardEvent('keydown', { key: 'S', metaKey: true, cancelable: true });
    document.dispatchEvent(cmd);
    expect(ctrl.defaultPrevented).toBeTrue();
    expect(saved.length).toBe(2);
  });

  it('adds trimmed, de-duplicated tags with Enter and removes them', async () => {
    await setup();
    type('#note-tag-input', '  Work  ');
    query<HTMLInputElement>('#note-tag-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    type('#note-tag-input', 'work, ideas');
    query<HTMLInputElement>('#note-tag-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(component.draft().tags).toEqual(['Work', 'ideas']);

    query<HTMLButtonElement>('[aria-label="Remove tag Work"]')?.click();
    fixture.detectChanges();
    expect(component.draft().tags).toEqual(['ideas']);
  });

  it('emits draft changes for autosave', async () => {
    await setup();
    const drafts: NoteDraft[] = [];
    component.draftChange.subscribe((draft) => drafts.push(draft));
    type('#note-title', 'A');
    expect(drafts.at(-1)?.title).toBe('A');
  });

  it('is read-only for notes in Trash', async () => {
    await setup(emptyDraft({ title: 'Trashed' }), { readOnly: true });
    fixture.detectChanges();
    expect(query<HTMLInputElement>('#note-title')?.disabled).toBeTrue();
    expect(query('button[type="submit"]')).toBeNull();
    expect(component.requestSave()).toBeFalse();
  });

  it('disables pinning when not allowed', async () => {
    await setup(emptyDraft({ title: 'Archived' }), { canPin: false });
    fixture.detectChanges();
    expect(query<HTMLInputElement>('input[formControlName="isPinned"]')?.disabled).toBeTrue();
    expect(element.textContent).toContain('Archived notes can’t be pinned');
  });

  it('labels every form control', async () => {
    await setup();
    for (const id of ['note-title', 'note-content', 'note-tag-input']) {
      expect(query(`label[for="${id}"]`)).withContext(id).not.toBeNull();
    }
  });
});
