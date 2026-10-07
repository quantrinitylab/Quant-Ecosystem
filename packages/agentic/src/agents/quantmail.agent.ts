import { Agent } from '../core/agent.js';
import { logger } from '@quant/common';
import { HttpClient, createQuantMailClient } from '../clients/http-client.js';

export class QuantMailAgent extends Agent {
  private httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    super({
      id: 'quantmail-agent',
      name: 'QuantMail Agent',
      personality: 'Professional, efficient, privacy-conscious email assistant',
      capabilities: [
        'send_email',
        'read_email',
        'organize_inbox',
        'draft_responses',
        'schedule_emails',
        'manage_folders',
      ],
    });

    this.httpClient = httpClient ?? createQuantMailClient();
    this.registerEmailTools();
  }

  private registerEmailTools() {
    this.addTool({
      name: 'quantmail_send',
      description: 'Send an email through QuantMail',
      parameters: {
        to: 'string',
        subject: 'string',
        body: 'string',
        attachments: 'array',
      },
      // NOTE: Input validation is intentionally omitted here. All parameter validation
      // is enforced server-side by the backend's Zod schemas (see @quant/server-core createApp).
      // Client-side validation would be redundant and create a maintenance burden.
      execute: async (params: any) => {
        logger.log('[QuantMailAgent] Sending email:', params);

        const response = await this.httpClient.post('/api/emails', {
          to: params.to,
          subject: params.subject,
          body: params.body,
          attachments: params.attachments || [],
        });

        if (!response.ok) {
          logger.warn('[QuantMailAgent] Failed to send email:', response.error);
          return { success: false, error: response.error };
        }

        return {
          success: true,
          messageId: response.data?.id || response.data?.messageId,
          status: response.data?.status || 'sent',
        };
      },
    });

    this.addTool({
      name: 'quantmail_read',
      description: 'Read emails from inbox',
      parameters: {
        folder: 'string',
        limit: 'number',
        filter: 'object',
      },
      execute: async (params: any) => {
        logger.log('[QuantMailAgent] Reading emails:', params);

        const queryParams: Record<string, any> = {};
        if (params.folder) queryParams['folder'] = params.folder;
        if (params.limit) queryParams['limit'] = params.limit;
        if (params.filter?.search) queryParams['search'] = params.filter.search;
        if (params.filter?.from) queryParams['from'] = params.filter.from;
        if (params.filter?.unread !== undefined) queryParams['unread'] = params.filter.unread;

        const response = await this.httpClient.get('/api/emails', queryParams);

        if (!response.ok) {
          logger.warn('[QuantMailAgent] Failed to read emails:', response.error);
          return { emails: [], count: 0, error: response.error };
        }

        const emails = Array.isArray(response.data) ? response.data : response.data?.emails || [];
        return { emails, count: emails.length };
      },
    });
  }
}
