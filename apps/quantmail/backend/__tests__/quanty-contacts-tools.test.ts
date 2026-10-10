// ============================================================================
// Quanty contacts tools — unit tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AssistantContext } from '@quant/ai';
import {
  buildQuantyContactsTools,
  type QuantyContactsTool,
  type QuantyContactsToolsDeps,
  type ContactsAuditEntry,
} from '../services/quanty-agent/tools/contacts-tools';

const USER_ID = 'user-1';
const OTHER_USER = 'user-2';

function makeContext(userId = USER_ID): AssistantContext {
  return {
    userId,
    currentApp: 'quantmail',
    conversationHistory: [],
    crossAppState: {},
  };
}

function makeDeps(overrides: Partial<QuantyContactsToolsDeps> = {}): QuantyContactsToolsDeps & {
  prisma: any;
  contactService: any;
  auditLog: ContactsAuditEntry[];
} {
  const auditLog: ContactsAuditEntry[] = [];
  return {
    prisma: {},
    contactService: {
      getContacts: vi.fn(),
      getContact: vi.fn(),
      addContact: vi.fn(),
      updateContact: vi.fn(),
    },
    audit: (entry: ContactsAuditEntry) => {
      auditLog.push(entry);
    },
    auditLog,
    ...overrides,
  } as any;
}

function mockContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    userId: USER_ID,
    name: 'Priya Sharma',
    email: 'priya@example.com',
    avatar: null,
    phone: '+911234567890',
    company: 'Acme',
    tags: [],
    isFavorite: false,
    frequency: 3,
    lastContactedAt: new Date('2026-10-01T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('quanty contacts tools', () => {
  let deps: ReturnType<typeof makeDeps>;
  let tools: QuantyContactsTool[];
  let byName: Map<string, QuantyContactsTool>;

  beforeEach(() => {
    deps = makeDeps();
    tools = buildQuantyContactsTools(deps);
    byName = new Map(tools.map((t) => [t.name, t]));
  });

  it('exposes exactly the 4 contacts tools', () => {
    expect(tools).toHaveLength(4);
    for (const name of ['search_contacts', 'get_contact', 'add_contact', 'update_contact']) {
      expect(byName.has(name), `missing tool ${name}`).toBe(true);
    }
  });

  it('marks safety flags correctly', () => {
    expect(byName.get('search_contacts')).toMatchObject({ destructive: false, requiresConfirmation: false });
    expect(byName.get('get_contact')).toMatchObject({ destructive: false, requiresConfirmation: false });
    expect(byName.get('add_contact')).toMatchObject({ destructive: true, requiresConfirmation: true });
    expect(byName.get('update_contact')).toMatchObject({ destructive: true, requiresConfirmation: true });
  });

  it('search_contacts returns contacts and scopes by userId', async () => {
    const contact = mockContact();
    deps.contactService.getContacts.mockResolvedValue({
      data: [contact],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
    const res = await byName.get('search_contacts')!.handler({ q: 'priya' }, makeContext());
    expect(res.success).toBe(true);
    expect(deps.contactService.getContacts).toHaveBeenCalledWith(USER_ID, { q: 'priya', pageSize: 10 });
    const contacts = (res.data as any).contacts;
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ id: 'contact-1', name: 'Priya Sharma', email: 'priya@example.com' });
    expect(contacts[0]).not.toHaveProperty('userId');
    expect((res.data as any).total).toBe(1);
  });

  it('search_contacts clamps the limit and requires q', async () => {
    deps.contactService.getContacts.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
    const res = await byName.get('search_contacts')!.handler({ q: 'x', limit: 500 }, makeContext());
    expect(res.success).toBe(true);
    expect(deps.contactService.getContacts).toHaveBeenCalledWith(USER_ID, { q: 'x', pageSize: 50 });
    expect(res.displayMessage).toContain('No contacts found');

    const missing = await byName.get('search_contacts')!.handler({}, makeContext());
    expect(missing.success).toBe(false);
    expect(missing.error).toContain('q');
  });

  it('get_contact returns the full contact details', async () => {
    deps.contactService.getContact.mockResolvedValue(mockContact());
    const res = await byName.get('get_contact')!.handler({ contactId: 'contact-1' }, makeContext());
    expect(res.success).toBe(true);
    expect(deps.contactService.getContact).toHaveBeenCalledWith('contact-1', USER_ID);
    expect((res.data as any).contact).toMatchObject({ id: 'contact-1', name: 'Priya Sharma', phone: '+911234567890', company: 'Acme' });
  });

  it('get_contact surfaces service errors honestly (404/403)', async () => {
    deps.contactService.getContact.mockRejectedValue(new Error('Contact not found'));
    const res = await byName.get('get_contact')!.handler({ contactId: 'nope' }, makeContext());
    expect(res.success).toBe(false);
    expect(res.error).toBe('Contact not found');
  });

  it('add_contact creates via ContactService with the context userId', async () => {
    deps.contactService.getContacts.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 5,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
    deps.contactService.addContact.mockResolvedValue(mockContact());
    const res = await byName.get('add_contact')!.handler(
      { name: 'Priya Sharma', email: 'priya@example.com', phone: '+911234567890', company: 'Acme' },
      makeContext(),
    );
    expect(res.success).toBe(true);
    expect(deps.contactService.addContact).toHaveBeenCalledWith({
      userId: USER_ID,
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+911234567890',
      company: 'Acme',
    });
    expect((res.data as any).contact).toMatchObject({ name: 'Priya Sharma', email: 'priya@example.com' });
  });

  it('add_contact refuses to duplicate an existing email honestly', async () => {
    const existing = mockContact();
    deps.contactService.getContacts.mockResolvedValue({
      data: [existing],
      total: 1,
      page: 1,
      pageSize: 5,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
    const res = await byName.get('add_contact')!.handler(
      { name: 'Priya S', email: 'PRIYA@example.com' },
      makeContext(),
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain('already exists');
    expect(res.displayMessage).toContain('Priya Sharma');
    expect(deps.contactService.addContact).not.toHaveBeenCalled();
  });

  it('add_contact maps the service 409 race into the honest already-exists result', async () => {
    deps.contactService.getContacts.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 5,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
    const err = new Error('Contact with this email already exists') as Error & { code: string; statusCode: number };
    err.code = 'CONTACT_EXISTS';
    err.statusCode = 409;
    deps.contactService.addContact.mockRejectedValue(err);
    const res = await byName.get('add_contact')!.handler(
      { name: 'Priya Sharma', email: 'priya@example.com' },
      makeContext(),
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain('already exists');
  });

  it('add_contact validates email format and requires a name', async () => {
    const badEmail = await byName.get('add_contact')!.handler(
      { name: 'Priya Sharma', email: 'not-an-email' },
      makeContext(),
    );
    expect(badEmail.success).toBe(false);
    expect(badEmail.error).toContain('Invalid email');

    const noName = await byName.get('add_contact')!.handler({ email: 'priya@example.com' }, makeContext());
    expect(noName.success).toBe(false);
    expect(noName.error).toContain('name');

    const noEmail = await byName.get('add_contact')!.handler({ name: 'Priya Sharma' }, makeContext());
    expect(noEmail.success).toBe(false);
    expect(noEmail.error).toContain('email');
  });

  it('update_contact applies the patch userId-scoped', async () => {
    const updated = mockContact({ phone: '+919999999999', isFavorite: true });
    deps.contactService.updateContact.mockResolvedValue(updated);
    const res = await byName.get('update_contact')!.handler(
      { contactId: 'contact-1', phone: '+919999999999', isFavorite: true },
      makeContext(),
    );
    expect(res.success).toBe(true);
    expect(deps.contactService.updateContact).toHaveBeenCalledWith(
      'contact-1',
      USER_ID,
      { phone: '+919999999999', isFavorite: true },
    );
    expect((res.data as any).contact.phone).toBe('+919999999999');
  });

  it('update_contact normalizes and validates email, requires at least one field', async () => {
    deps.contactService.updateContact.mockResolvedValue(mockContact({ email: 'new@example.com' }));
    const res = await byName.get('update_contact')!.handler(
      { contactId: 'contact-1', email: 'NEW@example.com' },
      makeContext(),
    );
    expect(res.success).toBe(true);
    expect(deps.contactService.updateContact).toHaveBeenCalledWith(
      'contact-1',
      USER_ID,
      { email: 'new@example.com' },
    );

    const badEmail = await byName.get('update_contact')!.handler(
      { contactId: 'contact-1', email: 'nope' },
      makeContext(),
    );
    expect(badEmail.success).toBe(false);
    expect(badEmail.error).toContain('Invalid email');

    const empty = await byName.get('update_contact')!.handler({ contactId: 'contact-1' }, makeContext());
    expect(empty.success).toBe(false);
    expect(empty.error).toContain('Nothing to update');
    expect(deps.contactService.updateContact).not.toHaveBeenCalledWith(
      'contact-1',
      USER_ID,
      {},
    );
  });

  it('update_contact requires a contactId', async () => {
    const res = await byName.get('update_contact')!.handler({ name: 'x' }, makeContext());
    expect(res.success).toBe(false);
    expect(res.error).toContain('contactId');
  });

  it('rejects when the agent context has no userId', async () => {
    const res = await byName.get('search_contacts')!.handler({ q: 'x' }, makeContext(''));
    expect(res.success).toBe(false);
    expect(res.error).toContain('userId');
    expect(deps.contactService.getContacts).not.toHaveBeenCalled();
  });

  it('never passes another user\'s id to the service', async () => {
    deps.contactService.getContact.mockResolvedValue(mockContact({ userId: OTHER_USER }));
    await byName.get('get_contact')!.handler({ contactId: 'contact-1' }, makeContext(OTHER_USER));
    expect(deps.contactService.getContact).toHaveBeenCalledWith('contact-1', OTHER_USER);
  });

  it('returns failure (not throw) when the service throws, and audits it', async () => {
    deps.contactService.getContact.mockRejectedValue(new Error('DB down'));
    const res = await byName.get('get_contact')!.handler({ contactId: 'contact-1' }, makeContext());
    expect(res.success).toBe(false);
    expect(res.error).toBe('DB down');
    const last = deps.auditLog[deps.auditLog.length - 1];
    expect(last).toMatchObject({ tool: 'get_contact', userId: USER_ID, success: false, error: 'DB down' });
  });

  it('audits successful invocations', async () => {
    deps.contactService.getContacts.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
    await byName.get('search_contacts')!.handler({ q: 'priya' }, makeContext());
    const last = deps.auditLog[deps.auditLog.length - 1];
    expect(last).toMatchObject({ tool: 'search_contacts', userId: USER_ID, success: true });
    expect(last.args).toMatchObject({ q: 'priya' });
  });

  it('truncates long arg values in the audit log', async () => {
    deps.contactService.getContacts.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
    const longQuery = 'x'.repeat(500);
    await byName.get('search_contacts')!.handler({ q: longQuery }, makeContext());
    const last = deps.auditLog[deps.auditLog.length - 1];
    expect(String(last.args['q'])).toContain('[truncated]');
    expect(String(last.args['q']).length).toBeLessThan(longQuery.length);
  });
});
