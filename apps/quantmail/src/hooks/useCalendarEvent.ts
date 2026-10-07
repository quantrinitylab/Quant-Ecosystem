'use client';

// ============================================================================
// QuantMail — Calendar event detail hooks (K10 / M09).
//
// useCalendarEvent(id)  — one event via apiClient.getEvent (GET /api/events/:id)
// useRsvpEvent()        — POST /api/events/:id/rsvp, then refresh the detail
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { CalendarEvent } from '../types';

export type RsvpStatus = 'accepted' | 'declined' | 'tentative' | 'pending';

export function useCalendarEvent(id: string | null) {
  return useQuery({
    queryKey: ['calendar-event', id],
    queryFn: async (): Promise<CalendarEvent> => {
      const response = await apiClient.getEvent(id as string);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load event');
      if (!response.data) throw new Error('Event not found');
      return response.data;
    },
    enabled: Boolean(id),
    // The backend DTO is the authority; the calendar list already caches the
    // same rows, so a short stale window avoids a refetch on every back/forward.
    staleTime: 30 * 1000,
  });
}

export function useRsvpEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RsvpStatus }) => {
      const response = await apiClient.rsvpEvent(id, status);
      if (!response.success) throw new Error(response.error?.message || 'Failed to update RSVP');
      return response.data!;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['calendar-event', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      void queryClient.invalidateQueries({ queryKey: ['today-events'] });
    },
  });
}
