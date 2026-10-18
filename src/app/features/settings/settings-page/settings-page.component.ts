import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { NotificationService } from '../../../core/services/notification.service';
import {
  NoteLayout,
  SettingsService,
  ThemePreference,
} from '../../../core/services/settings.service';
import { IconComponent, IconName } from '../../../shared/components/icon/icon.component';
import { NOTE_SORTS, NOTE_SORT_LABELS, isNoteSort } from '../../notes/models/note.model';
import { NoteActionsService } from '../../notes/services/note-actions.service';
import { NotesStateService } from '../../notes/services/notes-state.service';

interface ThemeOption {
  readonly value: ThemePreference;
  readonly label: string;
  readonly icon: IconName;
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Preferences (theme, sorting, layout, autosave) and local data management. */
@Component({
  selector: 'qn-settings-page',
  imports: [IconComponent],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageComponent {
  protected readonly settings = inject(SettingsService);
  protected readonly state = inject(NotesStateService);
  private readonly actions = inject(NoteActionsService);
  private readonly notifier = inject(NotificationService);
  private readonly document = inject(DOCUMENT);

  protected readonly themeOptions: readonly ThemeOption[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'monitor' },
  ];
  protected readonly sorts = NOTE_SORTS;
  protected readonly sortLabels = NOTE_SORT_LABELS;

  protected readonly storageLabel = computed(() => {
    if (!this.state.isPersistent) {
      return 'Browser storage is unavailable. Notes last only until this tab is closed.';
    }
    if (this.state.persistError() === 'quota') {
      return 'Browser storage is full. Recent changes exist only in this tab.';
    }
    if (this.state.persistError()) {
      return 'The last save to browser storage failed. Recent changes exist only in this tab.';
    }
    return 'Notes are saved in this browser’s local storage. Nothing is sent to a server.';
  });

  protected setTheme(theme: ThemePreference): void {
    this.settings.update({ theme });
  }

  protected setLayout(layout: NoteLayout): void {
    this.settings.update({ layout });
  }

  protected onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (isNoteSort(value)) {
      this.settings.update({ sort: value });
    }
  }

  protected onAutosaveChange(event: Event): void {
    this.settings.update({ autosave: (event.target as HTMLInputElement).checked });
  }

  protected retrySave(): void {
    if (!this.state.retryPersist()) {
      this.notifier.error('Still unable to save. Export your notes to keep a copy.');
    }
  }

  /** Downloads all notes as JSON (a manual backup that can be imported later). */
  protected exportNotes(): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    const blob = new Blob([this.state.exportJson()], { type: 'application/json' });
    const url = view.URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `quick-notes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
    this.notifier.success('Notes exported');
  }

  protected async importNotes(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      this.notifier.error('That file is too large to import (maximum 5 MB).');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.notifier.error('The file could not be read.');
      return;
    }
    const result = this.state.importJson(text);
    if (!result.ok) {
      this.notifier.error('That file is not a valid Quick Notes export.');
      return;
    }
    const skipped = result.skipped > 0 ? ` (${result.skipped} invalid entries skipped)` : '';
    this.notifier.success(
      `Imported ${result.imported} ${result.imported === 1 ? 'note' : 'notes'}${skipped}`,
    );
  }

  protected deleteAll(): void {
    void this.actions.deleteAll();
  }
}
