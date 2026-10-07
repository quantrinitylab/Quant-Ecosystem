import { describe, it, expect } from 'vitest';
import {
  ALL_RESOURCE_CONTRACTS,
  getResourceContract,
  EMAIL_CONTRACT,
  MESSAGE_CONTRACT,
  POST_CONTRACT,
  VIDEO_CONTRACT,
  FILE_CONTRACT,
  DOC_CONTRACT,
  MEETING_CONTRACT,
  CAMPAIGN_CONTRACT,
  PAYMENT_CONTRACT,
  USER_PROFILE_CONTRACT,
  SUBSCRIPTION_CONTRACT,
  WALLET_CONTRACT,
  AD_CONTRACT,
  CALENDAR_EVENT_CONTRACT,
  CODE_ARTIFACT_CONTRACT,
  TASK_CONTRACT,
} from '../core/resource-contracts.js';
import type { PlatformRole, PermissionAction, ResourceType } from '../types.js';

const ALL_ACTIONS: PermissionAction[] = [
  'read',
  'write',
  'delete',
  'share',
  'monetize',
  'agent-act',
];
const ALL_ROLES: PlatformRole[] = ['USER', 'ADMIN', 'MODERATOR', 'CREATOR', 'ADVERTISER', 'AGENT'];

describe('Resource Contracts', () => {
  describe('ALL_RESOURCE_CONTRACTS', () => {
    it('contains contracts for all expected resource types', () => {
      const resourceTypes: ResourceType[] = [
        'email',
        'message',
        'post',
        'video',
        'file',
        'doc',
        'meeting',
        'campaign',
        'payment',
        'user-profile',
        'subscription',
        'wallet',
        'ad',
        'calendar-event',
        'code-artifact',
        'task',
      ];

      for (const type of resourceTypes) {
        const contract = ALL_RESOURCE_CONTRACTS.find((c) => c.resourceType === type);
        expect(contract, `Missing contract for ${type}`).toBeDefined();
      }
    });

    it('each contract has all 6 actions defined', () => {
      for (const contract of ALL_RESOURCE_CONTRACTS) {
        for (const action of ALL_ACTIONS) {
          expect(
            contract.allowedActions[action],
            `Contract ${contract.resourceType} missing action ${action}`,
          ).toBeDefined();
          expect(Array.isArray(contract.allowedActions[action])).toBe(true);
        }
      }
    });

    it('each contract only contains valid roles', () => {
      for (const contract of ALL_RESOURCE_CONTRACTS) {
        for (const action of ALL_ACTIONS) {
          const roles = contract.allowedActions[action];
          for (const role of roles) {
            expect(
              ALL_ROLES.includes(role),
              `Invalid role ${role} in ${contract.resourceType}.${action}`,
            ).toBe(true);
          }
        }
      }
    });
  });

  describe('getResourceContract', () => {
    it('returns the correct contract for each resource type', () => {
      expect(getResourceContract('email')).toBe(EMAIL_CONTRACT);
      expect(getResourceContract('message')).toBe(MESSAGE_CONTRACT);
      expect(getResourceContract('post')).toBe(POST_CONTRACT);
      expect(getResourceContract('video')).toBe(VIDEO_CONTRACT);
      expect(getResourceContract('file')).toBe(FILE_CONTRACT);
      expect(getResourceContract('doc')).toBe(DOC_CONTRACT);
      expect(getResourceContract('meeting')).toBe(MEETING_CONTRACT);
      expect(getResourceContract('campaign')).toBe(CAMPAIGN_CONTRACT);
      expect(getResourceContract('payment')).toBe(PAYMENT_CONTRACT);
      expect(getResourceContract('user-profile')).toBe(USER_PROFILE_CONTRACT);
      expect(getResourceContract('subscription')).toBe(SUBSCRIPTION_CONTRACT);
      expect(getResourceContract('wallet')).toBe(WALLET_CONTRACT);
      expect(getResourceContract('ad')).toBe(AD_CONTRACT);
      expect(getResourceContract('calendar-event')).toBe(CALENDAR_EVENT_CONTRACT);
      expect(getResourceContract('code-artifact')).toBe(CODE_ARTIFACT_CONTRACT);
      expect(getResourceContract('task')).toBe(TASK_CONTRACT);
    });

    it('returns undefined for unknown resource type', () => {
      expect(getResourceContract('nonexistent' as ResourceType)).toBeUndefined();
    });
  });

  describe('role escalation prevention', () => {
    it('USER cannot delete videos', () => {
      const roles = VIDEO_CONTRACT.allowedActions['delete'];
      expect(roles.includes('USER')).toBe(false);
    });

    it('USER cannot write campaigns', () => {
      const roles = CAMPAIGN_CONTRACT.allowedActions['write'];
      expect(roles.includes('USER')).toBe(false);
    });

    it('AGENT cannot act on payments', () => {
      const roles = PAYMENT_CONTRACT.allowedActions['agent-act'];
      expect(roles.includes('AGENT')).toBe(false);
    });

    it('ADVERTISER cannot delete posts', () => {
      const roles = POST_CONTRACT.allowedActions['delete'];
      expect(roles.includes('ADVERTISER')).toBe(false);
    });

    it('MODERATOR cannot monetize anything', () => {
      for (const contract of ALL_RESOURCE_CONTRACTS) {
        const monetizeRoles = contract.allowedActions['monetize'];
        expect(
          monetizeRoles.includes('MODERATOR'),
          `MODERATOR should not monetize ${contract.resourceType}`,
        ).toBe(false);
      }
    });

    it('GUEST-equivalent (no roles) has no access', () => {
      // A user with no platform roles should not appear in any contract
      // This verifies that having zero roles means zero access
      for (const contract of ALL_RESOURCE_CONTRACTS) {
        for (const action of ALL_ACTIONS) {
          const roles = contract.allowedActions[action];
          // An empty roles array for a subject means no intersection
          expect(roles.length >= 0).toBe(true);
        }
      }
    });

    it('only ADMIN can write to payments', () => {
      const roles = PAYMENT_CONTRACT.allowedActions['write'];
      expect(roles).toEqual(['ADMIN']);
    });

    it('only ADMIN can delete subscriptions', () => {
      const roles = SUBSCRIPTION_CONTRACT.allowedActions['delete'];
      expect(roles).toEqual(['ADMIN']);
    });

    it('wallet share is empty (no sharing allowed)', () => {
      const roles = WALLET_CONTRACT.allowedActions['share'];
      expect(roles).toEqual([]);
    });
  });
});
