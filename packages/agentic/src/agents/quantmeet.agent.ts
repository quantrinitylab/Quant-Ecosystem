import { Agent } from '../core/agent.js';
import { logger } from '@quant/common';
import { HttpClient, createQuantMeetClient } from '../clients/http-client.js';

export class QuantMeetAgent extends Agent {
  private httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    super({
      id: 'quantmeet-agent',
      name: 'QuantMeet Agent',
      personality: 'Professional, scheduling-aware, video conferencing specialist',
      capabilities: [
        'schedule_meeting',
        'create_room',
        'manage_participants',
        'record_meeting',
        'transcribe_meeting',
        'summarize_meeting',
      ],
    });

    this.httpClient = httpClient ?? createQuantMeetClient();
    this.registerMeetTools();
  }

  private registerMeetTools() {
    this.addTool({
      name: 'quantmeet_create_room',
      description: 'Create a video meeting room',
      parameters: {
        title: 'string',
        participants: 'array',
        scheduledTime: 'string',
      },
      execute: async (params: any) => {
        logger.log('[QuantMeetAgent] Creating room:', params);

        const response = await this.httpClient.post('/api/rooms', {
          title: params.title,
          participants: params.participants || [],
          scheduledTime: params.scheduledTime,
        });

        if (!response.ok) {
          logger.warn('[QuantMeetAgent] Failed to create room:', response.error);
          return { success: false, error: response.error };
        }

        return {
          success: true,
          roomId: response.data?.id || response.data?.roomId,
          joinUrl: response.data?.joinUrl || response.data?.url,
          token: response.data?.token,
        };
      },
    });

    this.addTool({
      name: 'quantmeet_summarize',
      description: 'Summarize a meeting',
      parameters: {
        meetingId: 'string',
      },
      execute: async (params: any) => {
        logger.log('[QuantMeetAgent] Summarizing meeting:', params);

        const response = await this.httpClient.post('/api/meetings/summarize', {
          meetingId: params.meetingId,
        });

        if (!response.ok) {
          logger.warn('[QuantMeetAgent] Failed to summarize meeting:', response.error);
          return {
            summary: 'Unable to generate summary - service unavailable',
            actionItems: [],
            error: response.error,
          };
        }

        return {
          summary: response.data?.summary || '',
          actionItems: response.data?.actionItems || [],
          participants: response.data?.participants || [],
          duration: response.data?.duration,
        };
      },
    });
  }
}
