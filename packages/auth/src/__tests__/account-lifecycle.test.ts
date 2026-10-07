import { describe, it, expect, beforeEach } from 'vitest';
import { AccountLifecycleService } from '../services/account-lifecycle-service';

describe('AccountLifecycleService', () => {
  let service: AccountLifecycleService;

  beforeEach(() => {
    service = new AccountLifecycleService();
  });

  describe('requestDeletion', () => {
    it('should create a deletion request with 14-day grace period', () => {
      const request = service.requestDeletion('user-1');

      expect(request.userId).toBe('user-1');
      expect(request.status).toBe('pending');
      expect(request.requestedAt).toBeInstanceOf(Date);
      expect(request.scheduledPurgeAt).toBeInstanceOf(Date);

      const gracePeriodMs = request.scheduledPurgeAt.getTime() - request.requestedAt.getTime();
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
      expect(gracePeriodMs).toBe(fourteenDaysMs);
    });

    it('should overwrite previous deletion request', () => {
      service.requestDeletion('user-1');
      const request = service.requestDeletion('user-1');
      expect(request.status).toBe('pending');
    });
  });

  describe('cancelDeletion', () => {
    it('should cancel a pending deletion request', () => {
      service.requestDeletion('user-1');
      const result = service.cancelDeletion('user-1');
      expect(result).toBe(true);

      const status = service.getAccountDeletionStatus('user-1');
      expect(status!.status).toBe('cancelled');
    });

    it('should return false if no deletion request exists', () => {
      const result = service.cancelDeletion('user-none');
      expect(result).toBe(false);
    });

    it('should not cancel a purged request', () => {
      service.requestDeletion('user-1');
      service.purgeAccount('user-1');

      const result = service.cancelDeletion('user-1');
      expect(result).toBe(false);
    });
  });

  describe('getAccountDeletionStatus', () => {
    it('should return null for user with no deletion request', () => {
      expect(service.getAccountDeletionStatus('user-none')).toBeNull();
    });

    it('should return the current deletion request', () => {
      service.requestDeletion('user-1');
      const status = service.getAccountDeletionStatus('user-1');
      expect(status).not.toBeNull();
      expect(status!.userId).toBe('user-1');
    });
  });

  describe('exportAccountData', () => {
    it('should return structured export data', () => {
      const data = service.exportAccountData('user-1');

      expect(data.userId).toBe('user-1');
      expect(data.exportedAt).toBeInstanceOf(Date);
      expect(data.profile).toBeDefined();
      expect(data.sessions).toBeInstanceOf(Array);
      expect(data.preferences).toBeDefined();
      expect(data.activityLog).toBeInstanceOf(Array);
    });

    it('should include userId in profile data', () => {
      const data = service.exportAccountData('user-1');
      expect(data.profile.userId).toBe('user-1');
    });

    it('should include export format version', () => {
      const data = service.exportAccountData('user-1');
      expect(data.profile.exportFormat).toBe('quant-gdpr-v1');
    });
  });

  describe('purgeAccount', () => {
    it('should purge an account', () => {
      service.requestDeletion('user-1');
      const result = service.purgeAccount('user-1');
      expect(result).toBe(true);

      const status = service.getAccountDeletionStatus('user-1');
      expect(status!.status).toBe('purged');
    });

    it('should mark account as purged', () => {
      service.purgeAccount('user-1');
      expect(service.isAccountPurged('user-1')).toBe(true);
    });

    it('should clear vacation responder on purge', () => {
      service.setVacationResponder('user-1', {
        enabled: true,
        subject: 'Out of office',
        message: 'I am away',
        startDate: new Date(),
      });

      service.purgeAccount('user-1');
      expect(service.getVacationResponder('user-1')).toBeNull();
    });
  });

  describe('vacation responder', () => {
    it('should set and get a vacation responder', () => {
      const startDate = new Date();
      service.setVacationResponder('user-1', {
        enabled: true,
        subject: 'Out of office',
        message: 'I will be back soon',
        startDate,
      });

      const responder = service.getVacationResponder('user-1');
      expect(responder).not.toBeNull();
      expect(responder!.enabled).toBe(true);
      expect(responder!.subject).toBe('Out of office');
      expect(responder!.message).toBe('I will be back soon');
    });

    it('should return null for user without vacation responder', () => {
      expect(service.getVacationResponder('user-none')).toBeNull();
    });

    it('should clear vacation responder', () => {
      service.setVacationResponder('user-1', {
        enabled: true,
        subject: 'Away',
        message: 'Gone',
        startDate: new Date(),
      });

      const result = service.clearVacationResponder('user-1');
      expect(result).toBe(true);
      expect(service.getVacationResponder('user-1')).toBeNull();
    });

    it('should return false when clearing non-existent responder', () => {
      const result = service.clearVacationResponder('user-none');
      expect(result).toBe(false);
    });
  });
});
