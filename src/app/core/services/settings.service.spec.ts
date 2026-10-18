import { TestBed } from '@angular/core/testing';

import { MemoryStorage } from '../../../testing/memory-storage';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SettingsService,
  sanitizeSettings,
} from './settings.service';
import { BROWSER_STORAGE } from './storage.service';

describe('SettingsService', () => {
  let backend: MemoryStorage;

  function create(): SettingsService {
    TestBed.configureTestingModule({ providers: [{ provide: BROWSER_STORAGE, useValue: backend }] });
    return TestBed.inject(SettingsService);
  }

  beforeEach(() => {
    backend = new MemoryStorage();
  });

  it('starts with defaults', () => {
    expect(create().settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists and restores preferences', () => {
    create().update({ theme: 'dark', sort: 'title', layout: 'list', autosave: false });
    expect(JSON.parse(backend.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toEqual({
      theme: 'dark',
      sort: 'title',
      layout: 'list',
      autosave: false,
    });
    // A brand-new instance reading the same storage simulates a page refresh.
    expect(TestBed.runInInjectionContext(() => new SettingsService()).theme()).toBe('dark');
  });

  it('ignores malformed stored settings field by field', () => {
    backend.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'neon', sort: 'title', autosave: 'yes' }));
    expect(create().settings()).toEqual({ ...DEFAULT_SETTINGS, sort: 'title' });
  });

  it('survives unparseable settings', () => {
    backend.setItem(SETTINGS_STORAGE_KEY, '{{{');
    expect(create().settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the new value in memory when storage is full', () => {
    const service = create();
    backend.failWrites = 'quota';
    expect(service.update({ theme: 'light' })).toBeFalse();
    expect(service.theme()).toBe('light');
  });

  it('sanitizes arbitrary input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });
});
