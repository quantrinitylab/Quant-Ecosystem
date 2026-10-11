import { describe, it, expect, beforeEach, vi } from 'vitest';
import fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import retentionRoutes, { retentionService } from '../routes/retention';
import { resetRetentionStores } from '../services/retention.service';
import emailsRoutes from '../routes/emails';

async function buildRetentionTestApp(userId?: string, role?: string) {
  const app = fastify();
  await app.register(errorHandlerPlugin);
  app.addHook('preHandler', async (req) => {
    if (userId) {
      (req as unknown as { auth?: { userId?: string; role?: string } }).auth = {
        userId,
        role,
      };
    }
  });
  await app.register(retentionRoutes, { prefix: '/retention' });
  await app.ready();
  return app;
}

describe('Sovereign Retention Policies & Legal Hold Engine (Task X07)', () => {
  beforeEach(() => {
    resetRetentionStores();
  });

  it('POST /retention/policies creates a retention policy', async () => {
    const app = await buildRetentionTestApp('compliance-officer-1', 'ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/retention/policies',
      payload: {
        name: 'Financial Records 7-Year Retention',
        durationDays: 2555,
        targetFolders: ['INBOX', 'SENT'],
        action: 'ARCHIVE',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Financial Records 7-Year Retention');
    expect(body.data.durationDays).toBe(2555);
    expect(body.data.action).toBe('ARCHIVE');
    expect(body.data.enabled).toBe(true);
  });

  it('GET /retention/policies lists all active retention policies', async () => {
    const app = await buildRetentionTestApp('compliance-officer-1', 'ADMIN');
    await app.inject({
      method: 'POST',
      url: '/retention/policies',
      payload: { name: 'Policy 1', durationDays: 365 },
    });
    await app.inject({
      method: 'POST',
      url: '/retention/policies',
      payload: { name: 'Policy 2', durationDays: 730 },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/retention/policies',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('POST /retention/legal-holds places a legal hold on a custodian email', async () => {
    const app = await buildRetentionTestApp('legal-counsel-1', 'ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/retention/legal-holds',
      payload: {
        custodianEmail: 'ceo@quantmail.in',
        matterName: 'SEC Inquiry 2026',
        reason: 'Preserve all communications regarding Q3 disclosures',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.custodianEmail).toBe('ceo@quantmail.in');
    expect(body.data.matterName).toBe('SEC Inquiry 2026');
    expect(body.data.active).toBe(true);
  });

  it('GET /retention/legal-holds/check verifies legal hold status', async () => {
    const app = await buildRetentionTestApp('legal-counsel-1', 'ADMIN');
    await app.inject({
      method: 'POST',
      url: '/retention/legal-holds',
      payload: {
        custodianEmail: 'cfo@quantmail.in',
        matterName: 'Audit 2026',
        reason: 'Financial investigation',
      },
    });

    const heldRes = await app.inject({
      method: 'GET',
      url: '/retention/legal-holds/check?email=cfo@quantmail.in',
    });
    expect(heldRes.statusCode).toBe(200);
    expect(heldRes.json().data.isHeld).toBe(true);

    const clearRes = await app.inject({
      method: 'GET',
      url: '/retention/legal-holds/check?email=engineer@quantmail.in',
    });
    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json().data.isHeld).toBe(false);
  });

  it('DELETE /retention/legal-holds/:id releases a legal hold', async () => {
    const app = await buildRetentionTestApp('legal-counsel-1', 'ADMIN');
    const placeRes = await app.inject({
      method: 'POST',
      url: '/retention/legal-holds',
      payload: {
        custodianEmail: 'witness@quantmail.in',
        matterName: 'Case Closed',
        reason: 'Temporary hold',
      },
    });
    const holdId = placeRes.json().data.id;

    const releaseRes = await app.inject({
      method: 'DELETE',
      url: `/retention/legal-holds/${holdId}`,
      payload: { releaseReason: 'Matter settled out of court' },
    });

    expect(releaseRes.statusCode).toBe(200);
    expect(releaseRes.json().data.active).toBe(false);

    // Verify check returns false after release
    const checkRes = await app.inject({
      method: 'GET',
      url: '/retention/legal-holds/check?email=witness@quantmail.in',
    });
    expect(checkRes.json().data.isHeld).toBe(false);
  });

  it('blocks DELETE /emails/:id with 423 LEGAL_HOLD_ACTIVE when custodian is under hold', async () => {
    // Place legal hold on custodian
    await retentionService.placeLegalHold({
      custodianEmail: 'custodian@quantmail.in',
      matterName: 'Anti-Corruption Inquiry',
      reason: 'Hold all communications',
      placedBy: 'counsel',
    });

    const app = fastify();
    await app.register(errorHandlerPlugin);

    const fakeEmail = {
      id: 'email-under-hold-1',
      userId: 'user-held-1',
      fromAddress: 'custodian@quantmail.in',
      toAddresses: ['recipient@quantmail.in'],
      subject: 'Critical Evidence',
      isTrash: false,
      deletedAt: null,
    };

    const prismaMock = {
      email: {
        findUnique: vi.fn().mockResolvedValue(fakeEmail),
        update: vi.fn(),
      },
    };

    app.decorate('prisma', prismaMock as never);
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth?: { userId?: string } }).auth = { userId: 'user-held-1' };
    });
    await app.register(emailsRoutes, { prefix: '/emails' });
    await app.ready();

    const delRes = await app.inject({
      method: 'DELETE',
      url: '/emails/email-under-hold-1',
    });

    expect(delRes.statusCode).toBe(423);
    expect(['LOCKED_LEGAL_HOLD', 'LEGAL_HOLD_ACTIVE']).toContain(delRes.json().error.code);
    expect(delRes.json().error.message).toContain('active legal hold');
    expect(prismaMock.email.update).not.toHaveBeenCalled();

    await app.close();
  });

  describe('authorization — retention & legal holds are staff-only (QM-SCREEN-017 P0)', () => {
    const policyPayload = {
      name: 'Deleter Policy',
      durationDays: 30,
      action: 'PERMANENT_DELETE',
    };
    const holdPayload = {
      custodianEmail: 'target@quantmail.in',
      matterName: 'Matter',
      reason: 'Because',
    };

    const MUTATION_CASES: Array<['POST' | 'DELETE', string, Record<string, unknown>]> = [
      ['POST', '/retention/policies', policyPayload],
      ['POST', '/retention/legal-holds', holdPayload],
      ['DELETE', '/retention/legal-holds/hold-1', { releaseReason: 'Done' }],
    ];
    const READ_CASES: Array<['GET', string]> = [
      ['GET', '/retention/policies'],
      ['GET', '/retention/legal-holds'],
      ['GET', '/retention/legal-holds/check?email=a@quantmail.in'],
    ];

    it.each(MUTATION_CASES)(
      'returns 401 for an unauthenticated request (%s %s)',
      async (method, url, payload) => {
        const app = await buildRetentionTestApp();
        const res = await app.inject({ method, url, payload });
        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('UNAUTHORIZED');
      },
    );

    it.each(MUTATION_CASES)(
      'returns 403 for a signed-in non-staff (USER) request (%s %s)',
      async (method, url, payload) => {
        const app = await buildRetentionTestApp('regular-user-1', 'USER');
        const res = await app.inject({ method, url, payload });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
      },
    );

    it.each(READ_CASES)(
      'returns 403 for a signed-in non-staff (USER) request (%s %s)',
      async (method, url) => {
        const app = await buildRetentionTestApp('regular-user-1', 'USER');
        const res = await app.inject({ method, url });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
      },
    );

    it('admits MODERATOR as staff (case-insensitive role)', async () => {
      const app = await buildRetentionTestApp('mod-1', 'moderator');
      const res = await app.inject({
        method: 'POST',
        url: '/retention/policies',
        payload: { name: 'Mod Policy', durationDays: 90 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('staff ADMIN can place and release a legal hold end-to-end', async () => {
      const app = await buildRetentionTestApp('admin-1', 'ADMIN');
      const placeRes = await app.inject({
        method: 'POST',
        url: '/retention/legal-holds',
        payload: holdPayload,
      });
      expect(placeRes.statusCode).toBe(201);
      const holdId = placeRes.json().data.id;

      const releaseRes = await app.inject({
        method: 'DELETE',
        url: `/retention/legal-holds/${holdId}`,
        payload: { releaseReason: 'Staff release' },
      });
      expect(releaseRes.statusCode).toBe(200);
      expect(releaseRes.json().data.active).toBe(false);
    });
  });
});
