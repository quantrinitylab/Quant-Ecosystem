// ============================================================================
// QuantMax - useNearby Hook
// Nearby people state: discovery, waves, filtering
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { apiClient } from '../services/api-client';

interface NearbyPerson {
  id: string;
  name: string;
  age: number;
  avatar: string;
  distance: number;
  interests: string[];
  mutualInterests: string[];
  lastActive: number;
  hasWaved: boolean;
  waveReceived: boolean;
  bio: string;
}

interface Wave {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'declined';
}

interface NearbyFilters {
  maxDistance: number;
  ageMin: number;
  ageMax: number;
  interests: string[];
  onlineOnly: boolean;
}

export function useNearby(userId: string = 'current-user', userInterests: string[] = []) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<NearbyFilters>({
    maxDistance: 25,
    ageMin: 18,
    ageMax: 50,
    interests: [],
    onlineOnly: false,
  });

  const peopleQuery = useQuery({
    queryKey: ['nearby-people', filters],
    queryFn: async () => {
      const response = await apiClient.getNearbyPeople(filters);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load nearby people');
      }
      return (response.data ?? []) as NearbyPerson[];
    },
  });

  const wavesQuery = useQuery({
    queryKey: ['nearby-waves'],
    queryFn: async () => {
      const response = await apiClient.getWaves();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load waves');
      }
      return (response.data ?? []) as Wave[];
    },
  });

  const sendWaveMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const response = await apiClient.sendWave(targetId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to send wave');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nearby-people'] });
    },
  });

  const respondWaveMutation = useMutation({
    mutationFn: async ({ waveId, action }: { waveId: string; action: 'accept' | 'decline' }) => {
      const response = await apiClient.respondToWave(waveId, action);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to respond to wave');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nearby-waves'] });
    },
  });

  const updateFilters = useCallback((updates: Partial<NearbyFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const refreshLocation = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['nearby-people'] });
  }, [queryClient]);

  const loadNearby = useCallback(async () => {
    await peopleQuery.refetch();
  }, [peopleQuery]);

  return {
    people: peopleQuery.data ?? [],
    waves: wavesQuery.data ?? [],
    filters,
    isLoading: peopleQuery.isLoading,
    error: peopleQuery.error,
    loadNearby,
    sendWave: (targetId: string) => sendWaveMutation.mutate(targetId),
    acceptWave: (waveId: string) => respondWaveMutation.mutate({ waveId, action: 'accept' }),
    declineWave: (waveId: string) => respondWaveMutation.mutate({ waveId, action: 'decline' }),
    updateFilters,
    refreshLocation,
  };
}

export default useNearby;
