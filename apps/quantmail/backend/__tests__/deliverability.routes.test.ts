import { describe, it, expect, beforeEach } from 'vitest';
import fastify from 'fastify';
import deliverabilityRoutes from '../routes/deliverability';
import { resetDeliverabilityStores } from '../services/deliverability.service';

const SAMPLE_DMARC_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>9876543210</report_id>
    <date_range>
      <begin>1690000000</begin>
      <end>1690086400</end>
    </date_range>
  </report_metadata>
  <policy_published>
    <domain>quantmail.in</domain>
    <adkim>r</adkim>
    <aspf>r</aspf>
    <p>reject</p>
    <sp>reject</sp>
    <pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>198.51.100.1</source_ip>
      <count>150</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>quantmail.in</header_from>
    </identifiers>
    <auth_results>
      <dkim>
        <domain>quantmail.in</domain>
        <result>pass</result>
        <selector>sig1</selector>
      </dkim>
      <spf>
        <domain>quantmail.in</domain>
        <scope>mfrom</scope>
        <result>pass</result>
      </spf>
    </auth_results>
  </record>
  <record>
    <row>
      <source_ip>203.0.113.5</source_ip>
      <count>2</count>
      <policy_evaluated>
        <disposition>reject</disposition>
        <dkim>fail</dkim>
        <spf>fail</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>quantmail.in</header_from>
    </identifiers>
    <auth_results>
      <spf>
        <domain>quantmail.in</domain>
        <scope>mfrom</scope>
        <result>fail</result>
      </spf>
    </auth_results>
  </record>
</feedback>`;

async function buildTestApp(userId?: string) {
  const app = fastify();
  app.addHook('preHandler', async (req) => {
    if (userId) {
      (req as unknown as { auth?: { userId?: string } }).auth = { userId };
    }
  });
  await app.register(deliverabilityRoutes, { prefix: '/deliverability' });
  await app.ready();
  return app;
}

describe('QuantMail Deliverability, DMARC & Suppression Routes (Tasks X08, X09, X10)', () => {
  beforeEach(() => {
    resetDeliverabilityStores();
  });

  it('POST /deliverability/dmarc-reports ingests RFC 7489 XML feedback report and returns status 201', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/deliverability/dmarc-reports',
      payload: { xmlData: SAMPLE_DMARC_XML },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.orgName).toBe('google.com');
    expect(body.data.domain).toBe('quantmail.in');
    expect(body.data.summary.totalMessages).toBe(152);
    expect(body.data.summary.dmarcPassCount).toBe(150);
    expect(body.data.summary.dmarcFailCount).toBe(2);
    expect(body.data.summary.passRate).toBeGreaterThan(98);
  });

  it('GET /deliverability/stats computes health metrics and domain reputation', async () => {
    const app = await buildTestApp();
    // Ingest sample report first
    await app.inject({
      method: 'POST',
      url: '/deliverability/dmarc-reports',
      payload: { xmlData: SAMPLE_DMARC_XML },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/deliverability/stats?domain=quantmail.in',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.domain).toBe('quantmail.in');
    expect(body.data.reputationScore).toBeGreaterThanOrEqual(90);
    expect(body.data.status).toBe('EXCELLENT');
    expect(body.data.dmarcPassRate).toBeGreaterThan(98);
  });

  it('POST /deliverability/suppression adds an address to feedback loop suppression list', async () => {
    const app = await buildTestApp('admin-user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/deliverability/suppression',
      payload: {
        email: 'bounced-user@example.com',
        reason: 'HARD_BOUNCE',
        source: 'ses-bounce-notification',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('bounced-user@example.com');
    expect(body.data.reason).toBe('HARD_BOUNCE');
  });

  it('GET /deliverability/suppression/check returns true for suppressed address and false for normal', async () => {
    const app = await buildTestApp('admin-user-1');
    await app.inject({
      method: 'POST',
      url: '/deliverability/suppression',
      payload: {
        email: 'spammer-complaint@example.com',
        reason: 'COMPLAINT',
      },
    });

    const check1 = await app.inject({
      method: 'GET',
      url: '/deliverability/suppression/check?email=spammer-complaint@example.com',
    });
    expect(check1.statusCode).toBe(200);
    expect(check1.json().data.suppressed).toBe(true);

    const check2 = await app.inject({
      method: 'GET',
      url: '/deliverability/suppression/check?email=clean-recipient@example.com',
    });
    expect(check2.statusCode).toBe(200);
    expect(check2.json().data.suppressed).toBe(false);
  });

  it('DELETE /deliverability/suppression/:email unsuppresses an address', async () => {
    const app = await buildTestApp('admin-user-1');
    await app.inject({
      method: 'POST',
      url: '/deliverability/suppression',
      payload: {
        email: 'temp-block@example.com',
        reason: 'UNSUBSCRIBE',
      },
    });

    const delRes = await app.inject({
      method: 'DELETE',
      url: '/deliverability/suppression/temp-block@example.com',
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().data.removed).toBe(true);

    const check = await app.inject({
      method: 'GET',
      url: '/deliverability/suppression/check?email=temp-block@example.com',
    });
    expect(check.json().data.suppressed).toBe(false);
  });

  it('rejects unauthenticated requests to suppression endpoints with 401', async () => {
    const app = await buildTestApp(); // No userId
    const res = await app.inject({
      method: 'GET',
      url: '/deliverability/suppression',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid email addresses with 400 on suppression creation', async () => {
    const app = await buildTestApp('admin-user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/deliverability/suppression',
      payload: {
        email: 'not-an-email',
        reason: 'HARD_BOUNCE',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
