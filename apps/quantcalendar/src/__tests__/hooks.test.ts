// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent } from '../hooks/useEvents';
import {
  useCalendars,
  useCreateCalendar,
  useUpdateCalendar,
  useDeleteCalendar,
} from '../hooks/useCalendars';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useEvents', () => {
  it('fetches events successfully', async () => {
    const events = [
      {
        id: '1',
        title: 'Test Event',
        description: '',
        start: '',
        end: '',
        calendarId: 'c1',
        color: '#fff',
        isRecurring: false,
        location: '',
      },
    ];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => events });

    const { result } = renderHook(() => useEvents(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(events);
    expect(mockFetch).toHaveBeenCalledWith('/api/events');
  });

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useEvents(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to fetch events');
  });

  it('forwards calendarId query param', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    renderHook(() => useEvents({ calendarId: 'cal-123' }), { wrapper: createWrapper() });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledWith('/api/events?calendarId=cal-123');
  });

  it('forwards start and end query params', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    renderHook(() => useEvents({ start: '2024-01-01', end: '2024-01-31' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('start=2024-01-01');
    expect(url).toContain('end=2024-01-31');
  });

  it('forwards all query params together', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    renderHook(() => useEvents({ calendarId: 'c1', start: '2024-01-01', end: '2024-01-31' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('calendarId=c1');
    expect(url).toContain('start=2024-01-01');
    expect(url).toContain('end=2024-01-31');
  });
});

describe('useCreateEvent', () => {
  it('calls POST /api/events with input', async () => {
    const newEvent = {
      title: 'New',
      description: '',
      start: '',
      end: '',
      calendarId: 'c1',
      color: '#000',
      isRecurring: false,
      location: '',
    };
    const created = { id: 'e1', ...newEvent };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => created });

    const { result } = renderHook(() => useCreateEvent(), { wrapper: createWrapper() });

    await result.current.mutateAsync(newEvent);

    expect(mockFetch).toHaveBeenCalledWith('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEvent),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

    const { result } = renderHook(() => useCreateEvent(), { wrapper: createWrapper() });

    await expect(
      result.current.mutateAsync({
        title: 'X',
        description: '',
        start: '',
        end: '',
        calendarId: 'c1',
        color: '',
        isRecurring: false,
        location: '',
      }),
    ).rejects.toThrow('Failed to create event');
  });

  it('invalidates events query on success', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'e1',
        title: 'New',
        description: '',
        start: '',
        end: '',
        calendarId: 'c1',
        color: '',
        isRecurring: false,
        location: '',
      }),
    });

    const { result } = renderHook(() => useCreateEvent(), { wrapper });

    await result.current.mutateAsync({
      title: 'New',
      description: '',
      start: '',
      end: '',
      calendarId: 'c1',
      color: '',
      isRecurring: false,
      location: '',
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events'] });
    });
  });
});

describe('useUpdateEvent', () => {
  it('calls PUT /api/events with input', async () => {
    const input = { id: 'e1', title: 'Updated' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...input,
        description: '',
        start: '',
        end: '',
        calendarId: 'c1',
        color: '',
        isRecurring: false,
        location: '',
      }),
    });

    const { result } = renderHook(() => useUpdateEvent(), { wrapper: createWrapper() });

    await result.current.mutateAsync(input);

    expect(mockFetch).toHaveBeenCalledWith('/api/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useUpdateEvent(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({ id: 'e1', title: 'X' })).rejects.toThrow(
      'Failed to update event',
    );
  });

  it('invalidates events query on success', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'e1',
        title: 'Updated',
        description: '',
        start: '',
        end: '',
        calendarId: 'c1',
        color: '',
        isRecurring: false,
        location: '',
      }),
    });

    const { result } = renderHook(() => useUpdateEvent(), { wrapper });

    await result.current.mutateAsync({ id: 'e1', title: 'Updated' });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events'] });
    });
  });
});

describe('useDeleteEvent', () => {
  it('calls DELETE /api/events with event id', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useDeleteEvent(), { wrapper: createWrapper() });

    await result.current.mutateAsync('event-123');

    expect(mockFetch).toHaveBeenCalledWith('/api/events', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'event-123' }),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const { result } = renderHook(() => useDeleteEvent(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync('event-123')).rejects.toThrow('Failed to delete event');
  });

  it('invalidates events query on success', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useDeleteEvent(), { wrapper });

    await result.current.mutateAsync('event-99');

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events'] });
    });
  });
});

describe('useCalendars', () => {
  it('fetches calendars successfully', async () => {
    const calendars = [{ id: 'c1', name: 'Work', color: '#0000ff', isVisible: true }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => calendars });

    const { result } = renderHook(() => useCalendars(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(calendars);
    expect(mockFetch).toHaveBeenCalledWith('/api/calendars');
  });

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useCalendars(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to fetch calendars');
  });
});

describe('useCreateCalendar', () => {
  it('calls POST /api/calendars with input', async () => {
    const input = { name: 'Personal', color: '#ff0000', isVisible: true };
    const created = { id: 'c2', ...input };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => created });

    const { result } = renderHook(() => useCreateCalendar(), { wrapper: createWrapper() });

    const data = await result.current.mutateAsync(input);

    expect(data).toEqual(created);
    expect(mockFetch).toHaveBeenCalledWith('/api/calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

    const { result } = renderHook(() => useCreateCalendar(), { wrapper: createWrapper() });

    await expect(
      result.current.mutateAsync({ name: 'X', color: '', isVisible: true }),
    ).rejects.toThrow('Failed to create calendar');
  });

  it('invalidates calendars query on success', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'c2', name: 'Personal', color: '#ff0000', isVisible: true }),
    });

    const { result } = renderHook(() => useCreateCalendar(), { wrapper });

    await result.current.mutateAsync({ name: 'Personal', color: '#ff0000', isVisible: true });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['calendars'] });
    });
  });
});

describe('useUpdateCalendar', () => {
  it('calls PUT /api/calendars with input', async () => {
    const input = { id: 'c1', name: 'Updated' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...input, color: '#000', isVisible: true }),
    });

    const { result } = renderHook(() => useUpdateCalendar(), { wrapper: createWrapper() });

    await result.current.mutateAsync(input);

    expect(mockFetch).toHaveBeenCalledWith('/api/calendars', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useUpdateCalendar(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({ id: 'c1', name: 'X' })).rejects.toThrow(
      'Failed to update calendar',
    );
  });

  it('invalidates calendars query on success', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'c1', name: 'Updated', color: '#000', isVisible: true }),
    });

    const { result } = renderHook(() => useUpdateCalendar(), { wrapper });

    await result.current.mutateAsync({ id: 'c1', name: 'Updated' });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['calendars'] });
    });
  });
});

describe('useDeleteCalendar', () => {
  it('calls DELETE /api/calendars with calendar id', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useDeleteCalendar(), { wrapper: createWrapper() });

    await result.current.mutateAsync('cal-456');

    expect(mockFetch).toHaveBeenCalledWith('/api/calendars', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'cal-456' }),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    const { result } = renderHook(() => useDeleteCalendar(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync('cal-456')).rejects.toThrow(
      'Failed to delete calendar',
    );
  });

  it('invalidates calendars query on success', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useDeleteCalendar(), { wrapper });

    await result.current.mutateAsync('cal-789');

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['calendars'] });
    });
  });
});
