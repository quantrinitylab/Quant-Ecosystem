// ============================================================================
// Quanty agent — contacts tools ("hands" for the address book)
// ============================================================================
//
// PURPOSE
//   Concrete, backend-backed tools the Quanty agent core invokes to act on
//   the user's contacts. These are the REAL implementations the planner used
//   to honestly decline ("those tools don't exist yet") — they reuse the
//   existing `ContactService`, no duplicated business logic.
//
//   Four tools:
//     Read-only : search_contacts, get_contact
//     Gated     : add_contact (needs confirm), update_contact (needs confirm)
//
//   There is deliberately no delete tool yet: `ContactService.deleteContact`
//   exists, but no contacts tool is wired to it, so add/update are marked
//   reversible: false (honest — no companion undo tool).
//
// SAFETY INVARIANTS
//   * USER SCOPING — userId comes ONLY from `AssistantContext.userId`
//     (never from tool args). Every service call is userId-scoped;
//     the service throws 403 on cross-user rows (404 first, so a 403 never
//     leaks that an id is real).
//   * AUDIT — every invocation is logged (tool, userId, sanitized args,
//     success/failure) through the injectable `audit` port.
//   * NO FABRICATION — on missing rows or bad input the tools return honest
//     errors, never invented contacts. `add_contact` refuses to duplicate:
//     an existing row with the same email is reported, not re-created.
//   * NO SILENT DROPS — the Contact schema has no notes column, so the tools
//     do not accept a `notes` parameter (accepting it and dropping it is the
//     exact bug the schema comments warn about).

import type { PrismaClient } from '@prisma/client';
import type { AITool, AIToolResult, AssistantContext } from '@quant/ai';
import { ContactService } from '../../contact.service';
import type { Contact, ContactWritableFields } from '../../contact.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An AITool plus the safety metadata the agent runtime needs. */
export interface QuantyContactsTool extends AITool {
  /** True when the tool changes user-visible state. */
  destructive: boolean;
  /** True when the change can be undone via a companion undo tool. */
  reversible: boolean;
  /** True when the runtime must ask the user before invoking. */
  requiresConfirmation: boolean;
}

/** One audit-trail entry per tool invocation. */
export interface ContactsAuditEntry {
  tool: string;
  userId: string;
  /** Args with long string values truncated (never full payloads in logs). */
  args: Record<string, unknown>;
  success: boolean;
  at: string;
  error?: string;
}

/** Dependencies injected by the caller (backend app wiring). */
export interface QuantyContactsToolsDeps {
  prisma: PrismaClient;
  contactService: ContactService;
  /** Optional — defaults to structured console logging. */
  audit?: (entry: ContactsAuditEntry) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const defaultAudit = (entry: ContactsAuditEntry): void => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ns: 'quanty-contacts-tools', ...entry }));
};

/** Truncate long / sensitive arg values before they hit the audit log. */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…[truncated]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function strArg(args: Record<string, unknown>, name: string, required = true): string {
  const v = args[name];
  if (typeof v !== 'string' || v.length === 0) {
    if (required) throw new Error(`Missing required parameter: ${name}`);
    return '';
  }
  return v;
}

function optStrArg(args: Record<string, unknown>, name: string): string | undefined {
  const v = args[name];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new Error(`Parameter "${name}" must be a string.`);
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function boolArg(args: Record<string, unknown>, name: string): boolean | undefined {
  const v = args[name];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw new Error(`Parameter "${name}" must be a boolean.`);
  return v;
}

function numArg(args: Record<string, unknown>, name: string, fallback: number): number {
  const v = args[name];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Project a Contact row to the fields the agent is allowed to see/return. */
function contactRow(c: Contact): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? null,
    company: c.company ?? null,
    tags: c.tags ?? [],
    isFavorite: c.isFavorite,
    frequency: c.frequency,
    lastContactedAt: c.lastContactedAt ? new Date(c.lastContactedAt).toISOString() : null,
    createdAt: new Date(c.createdAt).toISOString(),
  };
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: AssistantContext,
) => Promise<AIToolResult>;

/**
 * Wrap a handler with audit logging + uniform error mapping.
 * userId is taken from context ONLY — never from args.
 */
function wrapTool(
  deps: QuantyContactsToolsDeps,
  toolName: string,
  handler: (args: Record<string, unknown>, userId: string) => Promise<AIToolResult>,
): ToolHandler {
  const audit = deps.audit ?? defaultAudit;
  return async (args, context) => {
    const userId = context.userId;
    const at = new Date().toISOString();
    if (!userId) {
      const entry: ContactsAuditEntry = {
        tool: toolName,
        userId: '',
        args: sanitizeArgs(args),
        success: false,
        at,
        error: 'Missing userId in agent context',
      };
      await audit(entry);
      return { success: false, error: entry.error, displayMessage: 'Not authenticated.' };
    }
    try {
      const result = await handler(args, userId);
      await audit({ tool: toolName, userId, args: sanitizeArgs(args), success: true, at });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await audit({ tool: toolName, userId, args: sanitizeArgs(args), success: false, at, error: message });
      return { success: false, error: message, displayMessage: `Couldn't complete ${toolName}: ${message}` };
    }
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function buildQuantyContactsTools(deps: QuantyContactsToolsDeps): QuantyContactsTool[] {
  const { contactService } = deps;

  const searchContacts: QuantyContactsTool = {
    name: 'search_contacts',
    description: "Search the user's contacts by name, email, company or phone. Returns matching contacts.",
    parameters: {
      q: { type: 'string', description: 'Search query (name, email, company, phone)', required: true },
      limit: { type: 'number', description: 'Max contacts to return (default 10, max 50)', required: false },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'search_contacts', async (args, userId) => {
      const q = strArg(args, 'q').trim();
      if (q.length === 0) throw new Error('Missing required parameter: q');
      const limit = Math.min(Math.max(numArg(args, 'limit', 10), 1), 50);
      const page = await contactService.getContacts(userId, { q, pageSize: limit });
      const contacts = page.data.map(contactRow);
      return {
        success: true,
        data: { contacts, total: page.total },
        displayMessage:
          page.total === 0
            ? `No contacts found matching "${q}".`
            : `Found ${page.total} contact${page.total === 1 ? '' : 's'} matching "${q}".`,
      };
    }),
  };

  const getContact: QuantyContactsTool = {
    name: 'get_contact',
    description: "Get one contact's full details by contact ID.",
    parameters: {
      contactId: { type: 'string', description: 'Contact ID', required: true },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'get_contact', async (args, userId) => {
      const contactId = strArg(args, 'contactId');
      const contact = await contactService.getContact(contactId, userId);
      return {
        success: true,
        data: { contact: contactRow(contact) },
        displayMessage: `Contact: ${contact.name} <${contact.email}>.`,
      };
    }),
  };

  const addContact: QuantyContactsTool = {
    name: 'add_contact',
    description:
      'Add a new contact. Refuses to duplicate: when a contact with the same email already exists it reports it instead of creating one. Requires user confirmation before invoking.',
    parameters: {
      name: { type: 'string', description: 'Full name of the contact', required: true },
      email: { type: 'string', description: 'Email address (required by the address book)', required: true },
      phone: { type: 'string', description: 'Phone number', required: false },
      company: { type: 'string', description: 'Company / organization', required: false },
    },
    destructive: true,
    reversible: false,
    requiresConfirmation: true,
    handler: wrapTool(deps, 'add_contact', async (args, userId) => {
      const name = strArg(args, 'name').trim();
      if (name.length === 0) throw new Error('Contact name must not be empty.');
      const email = strArg(args, 'email').trim().toLowerCase();
      if (!validEmail(email)) throw new Error(`Invalid email address: "${email}".`);
      const phone = optStrArg(args, 'phone');
      const company = optStrArg(args, 'company');

      // No silent duplicates: the address book keys on email, so check first
      // and report the existing row honestly instead of re-creating it.
      const existing = await contactService.getContacts(userId, { q: email, pageSize: 5 });
      const duplicate = existing.data.find((c) => c.email.trim().toLowerCase() === email);
      if (duplicate) {
        return {
          success: false,
          error: `A contact with email "${email}" already exists.`,
          displayMessage: `${duplicate.name} is already in your contacts (${email}) — not added again.`,
          data: { contact: contactRow(duplicate) },
        };
      }

      try {
        const created = await contactService.addContact({ userId, name, email, phone, company });
        return {
          success: true,
          data: { contact: contactRow(created) },
          displayMessage: `Added ${name} <${email}> to your contacts.`,
        };
      } catch (err) {
        // Race fallback: the service rejects the same-email write with 409.
        const code = (err as { code?: string; statusCode?: number })?.code;
        const status = (err as { code?: string; statusCode?: number })?.statusCode;
        if (code === 'CONTACT_EXISTS' || status === 409) {
          return {
            success: false,
            error: `A contact with email "${email}" already exists.`,
            displayMessage: `A contact with ${email} already exists — not added again.`,
          };
        }
        throw err;
      }
    }),
  };

  const updateContact: QuantyContactsTool = {
    name: 'update_contact',
    description:
      'Update a contact (name, email, phone, company, favorite). At least one field must change. Requires user confirmation before invoking.',
    parameters: {
      contactId: { type: 'string', description: 'Contact ID to update', required: true },
      name: { type: 'string', description: 'New full name', required: false },
      email: { type: 'string', description: 'New email address', required: false },
      phone: { type: 'string', description: 'New phone number', required: false },
      company: { type: 'string', description: 'New company / organization', required: false },
      isFavorite: { type: 'boolean', description: 'Star/unstar the contact', required: false },
    },
    destructive: true,
    reversible: false,
    requiresConfirmation: true,
    handler: wrapTool(deps, 'update_contact', async (args, userId) => {
      const contactId = strArg(args, 'contactId');
      const patch: ContactWritableFields = {};
      const name = optStrArg(args, 'name');
      if (name !== undefined) patch.name = name;
      const email = optStrArg(args, 'email');
      if (email !== undefined) {
        const normalized = email.toLowerCase();
        if (!validEmail(normalized)) throw new Error(`Invalid email address: "${email}".`);
        patch.email = normalized;
      }
      const phone = optStrArg(args, 'phone');
      if (phone !== undefined) patch.phone = phone;
      const company = optStrArg(args, 'company');
      if (company !== undefined) patch.company = company;
      const isFavorite = boolArg(args, 'isFavorite');
      if (isFavorite !== undefined) patch.isFavorite = isFavorite;

      if (Object.keys(patch).length === 0) {
        throw new Error('Nothing to update — pass at least one of name, email, phone, company, isFavorite.');
      }

      const updated = await contactService.updateContact(contactId, userId, patch);
      return {
        success: true,
        data: { contact: contactRow(updated) },
        displayMessage: `Updated ${updated.name}'s contact.`,
      };
    }),
  };

  return [searchContacts, getContact, addContact, updateContact];
}
