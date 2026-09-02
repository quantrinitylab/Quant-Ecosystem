import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ContactService } from '../services/contact.service';

/**
 * A tag is a chip in the list and a filter in the query, so it may not contain
 * the comma the create form splits on, and it has to be short enough to render.
 */
const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^,]+$/, 'A tag cannot contain a comma');

const contactFieldsSchema = {
  name: z.string().trim().min(1).max(200),
  email: z.string().email().max(320),
  avatar: z.string().url().max(2048),
  phone: z.string().trim().min(1).max(40),
  company: z.string().trim().min(1).max(200),
  tags: z.array(tagSchema).max(20),
  isFavorite: z.boolean(),
};

/**
 * `.strict()` on both bodies is the fix for this route's oldest bug, not a
 * stylistic preference. Every schema here used to be a bare `z.object` of
 * optional fields, so a body the server did not understand parsed to `{}` and
 * was answered with a 200: `PUT {"isFavorite":true}` ran an empty update and
 * the UI toasted "Added to favorites" over a no-op. Unknown keys now 400.
 */
const addContactSchema = z
  .object({
    name: contactFieldsSchema.name,
    email: contactFieldsSchema.email,
    avatar: contactFieldsSchema.avatar.optional(),
    phone: contactFieldsSchema.phone.optional(),
    company: contactFieldsSchema.company.optional(),
    tags: contactFieldsSchema.tags.optional(),
    isFavorite: contactFieldsSchema.isFavorite.optional(),
  })
  .strict();

const updateContactSchema = z
  .object({
    name: contactFieldsSchema.name.optional(),
    email: contactFieldsSchema.email.optional(),
    avatar: contactFieldsSchema.avatar.optional(),
    phone: contactFieldsSchema.phone.optional(),
    company: contactFieldsSchema.company.optional(),
    tags: contactFieldsSchema.tags.optional(),
    isFavorite: contactFieldsSchema.isFavorite.optional(),
  })
  .strict()
  // All-optional plus strict still admits `{}`, which is the no-op update this
  // route is here to stop reporting as success.
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Supply at least one field to update',
  });

/**
 * A query string carries strings, so `favorites=true` arrives as `'true'`.
 * `z.coerce.boolean()` is wrong here — it is `Boolean(value)`, and
 * `Boolean('false')` is `true`, which would pin the Favorites tab permanently on.
 */
const queryBooleanSchema = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * The list query. `q`, `tag` and `favorites` are not new features — the contacts
 * page has sent them since it shipped. They were dropped by a pagination-only
 * schema, which is why the search box filtered nothing and the Favorites tab
 * listed everybody. Strict, so a misspelt filter is a 400 rather than a silent
 * unfiltered list.
 */
const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().min(1).max(200).optional(),
    tag: tagSchema.optional(),
    favorites: queryBooleanSchema.optional(),
  })
  .strict();

const searchSchema = z.object({
  q: z.string().min(1),
});

const frequentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function contactsRoutes(fastify: FastifyInstance) {
  // POST /contacts
  fastify.post('/', async (request, reply) => {
    const parseResult = addContactSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contact = await service.addContact({ userId, ...parseResult.data });

    return reply.status(201).send({ success: true, data: contact });
  });

  // GET /contacts
  fastify.get('/', async (request, reply) => {
    const queryResult = listQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const result = await service.getContacts(userId, queryResult.data);

    // The frontend contract (ApiResponse<Contact[]>) expects `data` to be the
    // array itself, with pagination carried in `metadata`. Returning the raw
    // PaginatedResult object here made `data` an object, so the contacts page
    // crashed with "F.map is not a function". Unwrap it.
    return reply.send({
      success: true,
      data: result.data,
      metadata: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
      },
    });
  });

  // GET /contacts/search
  fastify.get('/search', async (request, reply) => {
    const queryResult = searchSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contacts = await service.searchContacts(userId, queryResult.data.q);

    return reply.send({ success: true, data: contacts });
  });

  // GET /contacts/frequent
  fastify.get('/frequent', async (request, reply) => {
    const queryResult = frequentQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contacts = await service.getFrequentContacts(userId, queryResult.data.limit ?? 10);

    return reply.send({ success: true, data: contacts });
  });

  // GET /contacts/directory
  //
  // The address book as a flat list of addresses, for callers that need set
  // membership rather than contact records — the inbox's `Contacts` lens asks
  // "is this conversation with somebody I know?" of every visible thread.
  //
  // Deliberately unpaginated, which the list route is not: a client joining
  // against page one of `GET /contacts` calls contact 21 a stranger, and that
  // failure is silent. See `ContactService.listContactEmails` for why the payload
  // is a projection.
  fastify.get('/directory', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const emails = await service.listContactEmails(userId);

    return reply.send({ success: true, data: { emails } });
  });

  // GET /contacts/:id
  //
  // Registered after the three static routes it shares a prefix with. Fastify's
  // radix router prefers a static segment over a parametric one, so `/search`,
  // `/frequent` and `/directory` still reach their own handlers rather than
  // arriving here as an id — but keeping the declaration order honest saves the
  // next reader the trip to the router's source.
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contact = await service.getContact(request.params.id, userId);

    return reply.send({ success: true, data: contact });
  });

  // PUT /contacts/:id
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateContactSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contact = await service.updateContact(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: contact });
  });

  // DELETE /contacts/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contact = await service.deleteContact(request.params.id, userId);

    return reply.send({ success: true, data: contact });
  });
}
