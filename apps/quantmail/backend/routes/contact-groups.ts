import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ContactGroupService } from '../services/contact-group.service';

/**
 * A group name is a chip label. It has to fit on a phone and it has to be
 * something a reader can tell apart from the next chip, so no leading/trailing
 * space and no newlines.
 */
const groupNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[^\r\n]+$/, 'A group name cannot contain a line break');

/**
 * Capped at 200 members. Not an arbitrary number: this list becomes a `To:`
 * header, and a send that fans out to more addresses than any provider will
 * accept in one envelope is a group that cannot be used for the one thing groups
 * are for.
 */
const groupEmailsSchema = z.array(z.string().trim().email().max(320)).max(200);

/**
 * `#rrggbb` only. The chip renders this straight into a style, so anything that
 * is not a literal hex colour is either a broken chip or an injection attempt.
 */
const groupColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a #rrggbb hex value');

/**
 * `.strict()` on both bodies, for the reason spelled out in `contacts.ts`: an
 * all-optional non-strict schema turns a body the server does not understand into
 * `{}`, which Prisma runs as an empty update and the UI reports as success.
 */
const createGroupSchema = z
  .object({
    name: groupNameSchema,
    // Optional, and an empty array is allowed: naming a group before filling it
    // is a real thing a person does, and the 400 would be the editor's job to
    // explain, not the API's.
    emails: groupEmailsSchema.optional(),
    color: groupColorSchema.nullable().optional(),
  })
  .strict();
const updateGroupSchema = z
  .object({
    name: groupNameSchema.optional(),
    emails: groupEmailsSchema.optional(),
    color: groupColorSchema.nullable().optional(),
  })
  .strict()
  // Strict plus all-optional still admits `{}`.
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Supply at least one field to update',
  });

/** Promote endpoint body: the member address to hand the admin role to. */
const memberRoleSchema = z
  .object({
    email: z.string().trim().email().max(320),
  })
  .strict();

/** Join endpoint body: the bearer token from a group's invite link. */
const joinGroupSchema = z
  .object({
    token: z.string().trim().min(1).max(128),
  })
  .strict();

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function contactGroupsRoutes(fastify: FastifyInstance) {
  const serviceFor = () =>
    new ContactGroupService((fastify as unknown as { prisma: unknown }).prisma as never);

  // GET /contact-groups
  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    const groups = await serviceFor().listGroups(userId);

    return reply.send({ success: true, data: groups });
  });

  // POST /contact-groups
  fastify.post('/', async (request, reply) => {
    const parseResult = createGroupSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = requireUserId(request);
    const group = await serviceFor().createGroup({ userId, ...parseResult.data });

    return reply.status(201).send({ success: true, data: group });
  });

  // GET /contact-groups/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const group = await serviceFor().getGroup(request.params.id, userId);

    return reply.send({ success: true, data: group });
  });

  // POST /contact-groups/:id/admins — promote a member to admin.
  // Owner-gated (the service's requireOwnedGroup 404s-then-403s); the address
  // must already be a member.
  fastify.post<{ Params: { id: string } }>('/:id/admins', async (request, reply) => {
    const parseResult = memberRoleSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = requireUserId(request);
    const group = await serviceFor().setMemberRole(
      request.params.id,
      userId,
      parseResult.data.email,
      'admin',
    );

    return reply.send({ success: true, data: group });
  });

  // DELETE /contact-groups/:id/admins/:email — demote an admin to member.
  fastify.delete<{ Params: { id: string; email: string } }>(
    '/:id/admins/:email',
    async (request, reply) => {
      const userId = requireUserId(request);
      const group = await serviceFor().setMemberRole(
        request.params.id,
        userId,
        request.params.email,
        'member',
      );

      return reply.send({ success: true, data: group });
    },
  );

  // DELETE /contact-groups/:id/members/:email — remove one member (and their
  // admin role, if they had one). Owner-gated.
  fastify.delete<{ Params: { id: string; email: string } }>(
    '/:id/members/:email',
    async (request, reply) => {
      const userId = requireUserId(request);
      const group = await serviceFor().removeMember(
        request.params.id,
        userId,
        request.params.email,
      );

      return reply.send({ success: true, data: group });
    },
  );

  // POST /contact-groups/:id/invite-link — create or regenerate the join link.
  fastify.post<{ Params: { id: string } }>('/:id/invite-link', async (request, reply) => {
    const userId = requireUserId(request);
    const link = await serviceFor().createInviteLink(request.params.id, userId);

    return reply.status(201).send({ success: true, data: link });
  });

  // GET /contact-groups/:id/invite-link — the active join link, if any.
  fastify.get<{ Params: { id: string } }>('/:id/invite-link', async (request, reply) => {
    const userId = requireUserId(request);
    const link = await serviceFor().getInviteLink(request.params.id, userId);

    return reply.send({ success: true, data: link });
  });

  // DELETE /contact-groups/:id/invite-link — revoke the join link.
  fastify.delete<{ Params: { id: string } }>('/:id/invite-link', async (request, reply) => {
    const userId = requireUserId(request);
    const group = await serviceFor().revokeInviteLink(request.params.id, userId);

    return reply.send({ success: true, data: group });
  });

  // GET /contact-groups/invite/:token — public preview of a join link. No
  // auth: the join page shows this before the visitor signs in. Registered
  // before `/:id`; Fastify prefers the static `invite` segment over the
  // `:id` parameter at the same position either way.
  fastify.get<{ Params: { token: string } }>('/invite/:token', async (request, reply) => {
    const preview = await serviceFor().previewInvite(request.params.token);

    return reply.send({ success: true, data: preview });
  });

  // POST /contact-groups/join — join a group via its invite link. Auth
  // required: the joiner's own address is what gets added.
  fastify.post('/join', async (request, reply) => {
    const parseResult = joinGroupSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = requireUserId(request);
    const group = await serviceFor().joinByInvite(parseResult.data.token, userId);

    return reply.send({ success: true, data: group });
  });

  // PUT /contact-groups/:id
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateGroupSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = requireUserId(request);
    const group = await serviceFor().updateGroup(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: group });
  });

  // DELETE /contact-groups/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const group = await serviceFor().deleteGroup(request.params.id, userId);

    return reply.send({ success: true, data: group });
  });
}
