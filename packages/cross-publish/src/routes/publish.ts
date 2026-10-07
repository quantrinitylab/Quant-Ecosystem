import { z } from 'zod';
import { CreatePublishIntentSchema, PublishIntentService } from '../publish-intent.js';
import { PublishFanoutService } from '../publish-fanout.service.js';
import { AnalyticsAggregatorService } from '../analytics-aggregator.service.js';

export interface RouteRequest {
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export interface RouteResponse {
  status: number;
  body: unknown;
}

export function createPublishRoutes(
  intentService: PublishIntentService,
  fanoutService: PublishFanoutService,
  analyticsService: AnalyticsAggregatorService,
) {
  async function handleCreatePublish(req: RouteRequest): Promise<RouteResponse> {
    try {
      const input = CreatePublishIntentSchema.parse(req.body);
      const intent = intentService.create(input);
      const jobIds = await fanoutService.fanOut(intent);
      return {
        status: 201,
        body: { intent, jobIds },
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return {
          status: 400,
          body: { error: 'Validation failed', details: err.errors },
        };
      }
      const message = err instanceof Error ? err.message : 'Internal error';
      return {
        status: 500,
        body: { error: message },
      };
    }
  }

  function handleGetStatus(req: RouteRequest): RouteResponse {
    const id = req.params?.['id'];
    if (!id) {
      return { status: 400, body: { error: 'Missing id parameter' } };
    }

    const status = fanoutService.getStatus(id);
    if (!status) {
      return { status: 404, body: { error: 'Not found' } };
    }

    return { status: 200, body: status };
  }

  function handleGetAnalytics(req: RouteRequest): RouteResponse {
    const userId = req.query?.['userId'];
    if (!userId) {
      return { status: 400, body: { error: 'Missing userId query parameter' } };
    }

    const analytics = analyticsService.getByUser(userId);
    return { status: 200, body: { analytics } };
  }

  return {
    handleCreatePublish,
    handleGetStatus,
    handleGetAnalytics,
  };
}
