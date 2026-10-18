import { TestBed } from '@angular/core/testing';

import { MemoryStorage } from '../../../testing/memory-storage';
import { BROWSER_STORAGE, StorageService, isQuotaExceededError } from './storage.service';

describe('StorageService', () => {
  function setup(backend: Storage | null): StorageService {
    TestBed.configureTestingModule({
      providers: [{ provide: BROWSER_STORAGE, useValue: backend }],
    });
    return TestBed.inject(StorageService);
  }

  it('reads and writes through to LocalStorage', () => {
    const backend = new MemoryStorage();
    const service = setup(backend);
    expect(service.isPersistent).toBeTrue();
    expect(service.write('k', 'v')).toEqual({ ok: true });
    expect(backend.getItem('k')).toBe('v');
    expect(service.read('k')).toBe('v');
    service.remove('k');
    expect(service.read('k')).toBeNull();
  });

  it('parses JSON safely', () => {
    const backend = new MemoryStorage();
    backend.setItem('good', '{"a":1}');
    backend.setItem('bad', '{not json');
    const service = setup(backend);
    expect(service.readJson('missing')).toEqual({ status: 'missing' });
    expect(service.readJson('good')).toEqual({ status: 'ok', value: { a: 1 }, raw: '{"a":1}' });
    expect(service.readJson('bad')).toEqual({ status: 'invalid', raw: '{not json' });
  });

  it('reports quota errors instead of throwing', () => {
    const backend = new MemoryStorage();
    const service = setup(backend);
    backend.failWrites = 'quota';
    expect(service.write('k', 'v')).toEqual({ ok: false, error: 'quota' });
  });

  it('reports other write failures as unknown', () => {
    const backend = new MemoryStorage();
    const service = setup(backend);
    backend.failWrites = 'blocked';
    expect(service.write('k', 'v')).toEqual({ ok: false, error: 'unknown' });
  });

  it('falls back to memory when storage is unavailable', () => {
    const backend = new MemoryStorage();
    backend.unavailable = true;
    const service = setup(backend);
    expect(service.isPersistent).toBeFalse();
    expect(service.write('k', 'v')).toEqual({ ok: true });
    expect(service.read('k')).toBe('v');
  });

  it('falls back to memory when there is no storage at all', () => {
    const service = setup(null);
    expect(service.isPersistent).toBeFalse();
    service.write('k', 'v');
    expect(service.read('k')).toBe('v');
  });

  it('treats a full-but-present storage as persistent', () => {
    const backend = new MemoryStorage();
    backend.failWrites = 'quota';
    const service = setup(backend);
    expect(service.isPersistent).toBeTrue();
  });

  it('recognises quota errors across browsers', () => {
    expect(isQuotaExceededError(new DOMException('x', 'QuotaExceededError'))).toBeTrue();
    expect(isQuotaExceededError(new DOMException('x', 'NS_ERROR_DOM_QUOTA_REACHED'))).toBeTrue();
    expect(isQuotaExceededError(new Error('x'))).toBeFalse();
  });
});
