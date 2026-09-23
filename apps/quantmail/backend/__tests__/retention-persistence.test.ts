import { describe, it, expect, beforeEach, vi } from 'vitest';
import fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import { RetentionService, type LegalHold } from '../services/retention.service';
import retentionRoutes from '../routes/retention';
import emailsRoutes from '../routes/emails';

describe('Task W33-03: PostgreSQL Persistence Migration for Legal Holds', () => {
  // In-memory backing array simulating database table for mock Prisma Client
  let simulatedDbTable: any[] = [];

  const createMockPrisma = () => {
    return {
      legalHold: {
        create: vi.fn(async ({ data }: { data: any }) => {
          const row = {
            id: data.id || `hold-${Date.now()}`,
            custodianEmail: data.custodianEmail,
            matterName: data.matterName,
            reason: data.reason,
            placedBy: data.placedBy,
            active: data.active ?? true,
            createdAt: data.createdAt || new Date(),
            releasedAt: data.releasedAt || null,
            releaseReason: data.releaseReason || null,
          };
          simulatedDbTable.push(row);
          return row;
        }),
        findMany: vi.fn(async ({ where }: { where?: any } = {}) => {
          let rows = [...simulatedDbTable];
          if (where?.active !== undefined) {
            rows = rows.filter((r) => r.active === where.active);
          }
          return rows;
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          return simulatedDbTable.find((r) => r.id === where.id) || null;
        }),
        findFirst: vi.fn(
          async ({ where }: { where: { custodianEmail: string; active?: boolean } }) => {
            return (
              simulatedDbTable.find((r) => {
                if (r.custodianEmail !== where.custodianEmail) return false;
                if (where.active !== undefined && r.active !== where.active) return false;
                return true;
              }) || null
            );
          },
        ),
        count: vi.fn(async ({ where }: { where?: any } = {}) => {
          let rows = [...simulatedDbTable];
          if (where?.custodianEmail) {
            rows = rows.filter((r) => r.custodianEmail === where.custodianEmail);
          }
          if (where?.active !== undefined) {
            rows = rows.filter((r) => r.active === where.active);
          }
          return rows.length;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
          const idx = simulatedDbTable.findIndex((r) => r.id === where.id);
          if (idx === -1) throw new Error('Not found');
          simulatedDbTable[idx] = { ...simulatedDbTable[idx], ...data };
          return simulatedDbTable[idx];
        }),
      },
      email: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      emailFolder: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };
  };

  beforeEach(() => {
    simulatedDbTable = [];
  });

  describe('Prisma-Backed CRUD Operations in RetentionService', () => {
    it('places a legal hold and persists to Prisma', async () => {
      const mockPrisma = createMockPrisma();
      const service = new RetentionService(mockPrisma);

      const hold = await service.placeLegalHold({
        custodianEmail: 'cfo@quantmail.in',
        matterName: 'SEC Inquiry 2026',
        reason: 'Regulatory compliance investigation',
        placedBy: 'admin-legal-01',
      });

      expect(hold.id).toBeDefined();
      expect(hold.custodianEmail).toBe('cfo@quantmail.in');
      expect(hold.matterName).toBe('SEC Inquiry 2026');
      expect(hold.active).toBe(true);

      expect(mockPrisma.legalHold.create).toHaveBeenCalledTimes(1);
      expect(simulatedDbTable.length).toBe(1);
      expect(simulatedDbTable[0].custodianEmail).toBe('cfo@quantmail.in');
    });

    it('queries active and all legal holds through Prisma findMany', async () => {
      const mockPrisma = createMockPrisma();
      const service = new RetentionService(mockPrisma);

      const hold1 = await service.placeLegalHold({
        custodianEmail: 'user1@quantmail.in',
        matterName: 'Matter 1',
        reason: 'Reason 1',
        placedBy: 'admin-1',
      });
      const hold2 = await service.placeLegalHold({
        custodianEmail: 'user2@quantmail.in',
        matterName: 'Matter 2',
        reason: 'Reason 2',
        placedBy: 'admin-1',
      });

      await service.releaseLegalHold(hold1.id, 'Investigation closed', 'admin-1');

      const allHolds = await service.getLegalHolds(false);
      expect(allHolds.length).toBe(2);

      const activeHolds = await service.getLegalHolds(true);
      expect(activeHolds.length).toBe(1);
      expect(activeHolds[0].custodianEmail).toBe('user2@quantmail.in');
    });

    it('releases a legal hold through Prisma update with audit reason and timestamp', async () => {
      const mockPrisma = createMockPrisma();
      const service = new RetentionService(mockPrisma);

      const hold = await service.placeLegalHold({
        custodianEmail: 'target@quantmail.in',
        matterName: 'Internal Audit',
        reason: 'Internal compliance',
        placedBy: 'auditor-1',
      });

      const released = await service.releaseLegalHold(
        hold.id,
        'Matter resolved by settlement',
        'auditor-1',
      );

      expect(released.active).toBe(false);
      expect(released.releaseReason).toBe('Matter resolved by settlement');
      expect(released.releasedAt).toBeDefined();
      expect(mockPrisma.legalHold.update).toHaveBeenCalledTimes(1);
    });

    it('checks if a custodian is under active legal hold via Prisma', async () => {
      const mockPrisma = createMockPrisma();
      const service = new RetentionService(mockPrisma);

      await service.placeLegalHold({
        custodianEmail: 'custodian@quantmail.in',
        matterName: 'Tax Audit',
        reason: 'Annual tax review',
        placedBy: 'admin-1',
      });

      const isHeld = await service.isUnderLegalHold('custodian@quantmail.in');
      expect(isHeld).toBe(true);

      const isOtherHeld = await service.isUnderLegalHold('innocent@quantmail.in');
      expect(isOtherHeld).toBe(false);
    });

    it('rejects duplicate release attempts with 400 ALREADY_RELEASED', async () => {
      const mockPrisma = createMockPrisma();
      const service = new RetentionService(mockPrisma);

      const hold = await service.placeLegalHold({
        custodianEmail: 'custodian@quantmail.in',
        matterName: 'Matter A',
        reason: 'Reason A',
        placedBy: 'admin-1',
      });

      await service.releaseLegalHold(hold.id, 'Done', 'admin-1');

      await expect(
        service.releaseLegalHold(hold.id, 'Done again', 'admin-1'),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'ALREADY_RELEASED',
      });
    });
  });

  describe('Route-Level Email Deletion Guard (HTTP 423 LOCKED_LEGAL_HOLD)', () => {
    async function buildEmailApp(mockPrisma: any, userId = 'user-owner') {
      const app = fastify();
      await app.register(errorHandlerPlugin);
      app.decorate('prisma', mockPrisma);
      app.addHook('preHandler', async (req) => {
        (req as unknown as { auth?: { userId: string } }).auth = { userId };
      });
      await app.register(emailsRoutes, { prefix: '/emails' });
      await app.ready();
      return app;
    }

    it('blocks DELETE /emails/:id with HTTP 423 LOCKED_LEGAL_HOLD when sender is under legal hold', async () => {
      const mockPrisma = createMockPrisma();
      const retention = new RetentionService(mockPrisma);

      // Place legal hold on custodian
      await retention.placeLegalHold({
        custodianEmail: 'ceo@quantmail.in',
        matterName: 'Antitrust Review',
        reason: 'DOJ document hold',
        placedBy: 'admin-compliance',
      });

      // Target email with sender as custodian
      mockPrisma.email.findUnique.mockResolvedValue({
        id: 'email-under-hold-1',
        userId: 'user-owner',
        fromAddress: 'ceo@quantmail.in',
        toAddresses: ['board@quantmail.in'],
        isTrash: false,
      });

      const app = await buildEmailApp(mockPrisma, 'user-owner');

      const res = await app.inject({
        method: 'DELETE',
        url: '/emails/email-under-hold-1',
      });

      expect(res.statusCode).toBe(423);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('LOCKED_LEGAL_HOLD');
      expect(body.error.message).toContain('active legal hold');
      await app.close();
    });

    it('blocks DELETE /emails/:id with HTTP 423 LOCKED_LEGAL_HOLD when recipient is under legal hold', async () => {
      const mockPrisma = createMockPrisma();
      const retention = new RetentionService(mockPrisma);

      await retention.placeLegalHold({
        custodianEmail: 'whistleblower@quantmail.in',
        matterName: 'Ethics Committee',
        reason: 'Protected disclosure retention',
        placedBy: 'admin-compliance',
      });

      mockPrisma.email.findUnique.mockResolvedValue({
        id: 'email-under-hold-2',
        userId: 'user-owner',
        fromAddress: 'coworker@quantmail.in',
        toAddresses: ['whistleblower@quantmail.in', 'other@quantmail.in'],
        isTrash: false,
      });

      const app = await buildEmailApp(mockPrisma, 'user-owner');

      const res = await app.inject({
        method: 'DELETE',
        url: '/emails/email-under-hold-2',
      });

      expect(res.statusCode).toBe(423);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('LOCKED_LEGAL_HOLD');
      await app.close();
    });

    it('allows DELETE /emails/:id when no participants are under legal hold', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.email.findUnique.mockResolvedValue({
        id: 'regular-email',
        userId: 'user-owner',
        fromAddress: 'sender@quantmail.in',
        toAddresses: ['receiver@quantmail.in'],
        isTrash: false,
      });
      mockPrisma.emailFolder.findFirst.mockResolvedValue({ id: 'trash-folder-id' });
      mockPrisma.email.update.mockResolvedValue({
        id: 'regular-email',
        userId: 'user-owner',
        fromAddress: 'sender@quantmail.in',
        toAddresses: ['receiver@quantmail.in'],
        folderId: 'trash-folder-id',
        isTrash: true,
      });

      const app = await buildEmailApp(mockPrisma, 'user-owner');

      const res = await app.inject({
        method: 'DELETE',
        url: '/emails/regular-email',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      await app.close();
    });
  });
});
