import { Injectable, computed, inject, signal } from '@angular/core';

import { NoteSort, isNoteSort } from '../../features/notes/models/note.model';
import { StorageService } from './storage.service';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const NOTE_LAYOUTS = ['grid', 'list'] as const;
export type NoteLayout = (typeof NOTE_LAYOUTS)[number];

export interface AppSettings {
  readonly theme: ThemePreference;
  readonly sort: NoteSort;
  readonly layout: NoteLayout;
  readonly autosave: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  sort: 'modified',
  layout: 'grid',
  autosave: true,
};

export const SETTINGS_STORAGE_KEY = 'quick-notes:settings';

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

/** Accepts anything and returns valid settings, falling back to defaults field by field. */
export function sanitizeSettings(value: unknown): AppSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DEFAULT_SETTINGS;
  }
  const record = value as Record<string, unknown>;
  return {
    theme: isOneOf(THEME_PREFERENCES, record['theme']) ? record['theme'] : DEFAULT_SETTINGS.theme,
    sort: isNoteSort(record['sort']) ? record['sort'] : DEFAULT_SETTINGS.sort,
    layout: isOneOf(NOTE_LAYOUTS, record['layout']) ? record['layout'] : DEFAULT_SETTINGS.layout,
    autosave:
      typeof record['autosave'] === 'boolean' ? record['autosave'] : DEFAULT_SETTINGS.autosave,
  };
}

/** User preferences persisted to LocalStorage. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly storage = inject(StorageService);
  private readonly _settings = signal<AppSettings>(this.load());

  readonly settings = this._settings.asReadonly();
  readonly theme = computed(() => this._settings().theme);
  readonly sort = computed(() => this._settings().sort);
  readonly layout = computed(() => this._settings().layout);
  readonly autosave = computed(() => this._settings().autosave);

  /** Updates settings in memory immediately; returns false if they could not be persisted. */
  update(patch: Partial<AppSettings>): boolean {
    const next = sanitizeSettings({ ...this._settings(), ...patch });
    this._settings.set(next);
    return this.storage.write(SETTINGS_STORAGE_KEY, JSON.stringify(next)).ok;
  }

  reset(): boolean {
    this._settings.set(DEFAULT_SETTINGS);
    return this.storage.write(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS)).ok;
  }

  private load(): AppSettings {
    const result = this.storage.readJson(SETTINGS_STORAGE_KEY);
    return result.status === 'ok' ? sanitizeSettings(result.value) : DEFAULT_SETTINGS;
  }
}
