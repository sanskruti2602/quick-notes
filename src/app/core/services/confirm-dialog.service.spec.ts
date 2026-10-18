import { TestBed } from '@angular/core/testing';

import { ConfirmDialogService } from './confirm-dialog.service';

describe('ConfirmDialogService', () => {
  let service: ConfirmDialogService;

  beforeEach(() => {
    service = TestBed.inject(ConfirmDialogService);
  });

  it('resolves with the user answer and clears the request', async () => {
    const answer = service.confirm({ title: 'Delete?', message: 'Sure?' });
    expect(service.request()?.options).toEqual({
      title: 'Delete?',
      message: 'Sure?',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      tone: 'default',
    });
    service.settle(true);
    expect(await answer).toBeTrue();
    expect(service.request()).toBeNull();
  });

  it('cancels a pending request when a new one arrives', async () => {
    const first = service.confirm({ title: 'One', message: '' });
    const second = service.confirm({ title: 'Two', message: '' });
    expect(await first).toBeFalse();
    service.settle(true);
    expect(await second).toBeTrue();
  });
});
