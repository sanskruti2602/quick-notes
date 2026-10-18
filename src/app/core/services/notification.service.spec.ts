import { TestBed } from '@angular/core/testing';

import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jasmine.clock().install();
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    service.clear();
    jasmine.clock().uninstall();
  });

  it('shows and auto-dismisses toasts', () => {
    service.success('Saved');
    expect(service.toasts().map((t) => t.message)).toEqual(['Saved']);
    jasmine.clock().tick(4001);
    expect(service.toasts()).toEqual([]);
  });

  it('keeps sticky toasts until dismissed', () => {
    const id = service.error('Storage full', { durationMs: 0 });
    jasmine.clock().tick(60_000);
    expect(service.toasts().length).toBe(1);
    service.dismiss(id);
    expect(service.toasts()).toEqual([]);
  });

  it('runs a toast action once and dismisses it', () => {
    const run = jasmine.createSpy('undo');
    const id = service.info('Moved to Trash', { action: { label: 'Undo', run } });
    service.runAction(id);
    service.runAction(id);
    expect(run).toHaveBeenCalledTimes(1);
    expect(service.toasts()).toEqual([]);
  });

  it('limits the number of visible toasts', () => {
    for (let i = 0; i < 6; i++) {
      service.info(`Toast ${i}`);
    }
    expect(service.toasts().map((t) => t.message)).toEqual(['Toast 2', 'Toast 3', 'Toast 4', 'Toast 5']);
  });
});
