// ============================================================================
// QuantMail — ERPGo Invoices API Routes
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { InvoiceGeneratorService } from '../services/invoice-generator.service';

const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  address: z.string().min(1),
  taxId: z.string().optional(),
});

const lineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().nonnegative().optional(),
});

const createInvoiceSchema = z.object({
  customer: customerSchema,
  items: z.array(lineItemSchema).min(1),
  currency: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE']).optional(),
  paymentLink: z.string().url().optional(),
});

const invoiceService = new InvoiceGeneratorService();

export default async function invoicesRoutes(fastify: FastifyInstance) {
  const paths = ['/workspaces/:id/invoices', '/api/workspaces/:id/invoices'];

  for (const basePath of paths) {
    fastify.post<{ Params: { id: string } }>(basePath, async (request, reply) => {
      const workspaceId = request.params.id;
      const parsed = createInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw createAppError(
          'Invalid invoice payload: ' + parsed.error.message,
          400,
          'BAD_REQUEST',
        );
      }
      const invoice = invoiceService.createInvoice(workspaceId, parsed.data);
      return reply.status(201).send({ success: true, data: invoice });
    });

    fastify.get<{ Params: { id: string; invoiceId: string } }>(
      `${basePath}/:invoiceId`,
      async (request, reply) => {
        const invoiceId = request.params.invoiceId;
        const invoice = invoiceService.getInvoice(invoiceId);
        if (!invoice) {
          throw createAppError('Invoice not found', 404, 'NOT_FOUND');
        }
        return reply.send({ success: true, data: invoice });
      },
    );

    fastify.get<{ Params: { id: string; invoiceId: string } }>(
      `${basePath}/:invoiceId/html`,
      async (request, reply) => {
        const invoiceId = request.params.invoiceId;
        const invoice = invoiceService.getInvoice(invoiceId);
        if (!invoice) {
          throw createAppError('Invoice not found', 404, 'NOT_FOUND');
        }
        const html = invoiceService.renderInvoiceHtml(invoice);
        return reply.type('text/html').send(html);
      },
    );
  }
}
