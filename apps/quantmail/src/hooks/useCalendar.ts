import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useCalendarEvents(options?: {
  calendarId?: string;
  start?: string;
  end?: string;
  type?: string;
}) {
  return useQuery({
    queryKey: ['calendar-events', options],
    queryFn: async () => {
      const response = await apiClient.getEvents(options);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load events');
      return response.data ?? [];
    },
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTodayEvents() {
  return useQuery({
    queryKey: ['today-events'],
    queryFn: async () => {
      const response = await apiClient.getTodayEvents();
      if (!response.success)
        throw new Error(response.error?.message || 'Failed to load today events');
      return response.data ?? [];
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      startTime: string;
      endTime: string;
      description?: string;
      calendarId?: string;
    }) => {
      const response = await apiClient.createEvent(
        data as Parameters<typeof apiClient.createEvent>[0],
      );
      if (!response.success) throw new Error(response.error?.message || 'Failed to create event');
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['today-events'] });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        title?: string;
        startTime?: string;
        endTime?: string;
        description?: string;
        calendarId?: string;
      };
    }) => {
      // Mirror createEvent: some calendar routes validate start/end instead of
      // startTime/endTime, so send both to stay compatible with either service.
      const payload = {
        ...data,
        ...(data.startTime ? { start: data.startTime } : {}),
        ...(data.endTime ? { end: data.endTime } : {}),
      };
      const response = await apiClient.updateEvent(
        id,
        payload as Parameters<typeof apiClient.updateEvent>[1],
      );
      if (!response.success) throw new Error(response.error?.message || 'Failed to update event');
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['today-events'] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.deleteEvent(id);
      if (!response.success) throw new Error(response.error?.message || 'Failed to delete event');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['today-events'] });
    },
  });
}
