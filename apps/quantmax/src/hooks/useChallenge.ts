// ============================================================================
// QuantMax - useChallenge Hook
// Challenge state: active challenges, submissions, leaderboard
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { apiClient } from '../services/api-client';

interface Challenge {
  id: string;
  title: string;
  description: string;
  hashtag: string;
  banner: string;
  creatorId: string;
  creatorName: string;
  prize: string;
  startDate: number;
  endDate: number;
  submissionCount: number;
  participantCount: number;
  status: 'upcoming' | 'active' | 'ended';
  rules: string[];
}

interface Submission {
  id: string;
  challengeId: string;
  userId: string;
  userName: string;
  videoUrl: string;
  thumbnail: string;
  likes: number;
  comments: number;
  shares: number;
  score: number;
  rank: number;
  submittedAt: number;
}

export function useChallenge() {
  const queryClient = useQueryClient();
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const challengesQuery = useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const response = await apiClient.getChallenges();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load challenges');
      }
      return (response.data ?? []) as Challenge[];
    },
  });

  const leaderboardQuery = useQuery({
    queryKey: ['challenge-leaderboard', activeChallenge?.id],
    queryFn: async () => {
      if (!activeChallenge) return [];
      const response = await apiClient.getLeaderboard(activeChallenge.id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load leaderboard');
      }
      return (response.data ?? []) as Submission[];
    },
    enabled: !!activeChallenge,
  });

  const participateMutation = useMutation({
    mutationFn: async ({ challengeId, videoUrl }: { challengeId: string; videoUrl: string }) => {
      const response = await apiClient.submitToChallenge(challengeId, videoUrl);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to submit');
      }
      return response.data as Submission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });

  const loadChallenges = useCallback(async () => {
    await challengesQuery.refetch();
  }, [challengesQuery]);

  const selectChallenge = useCallback(
    (id: string) => {
      const challenge = (challengesQuery.data ?? []).find((c: Challenge) => c.id === id);
      setActiveChallenge(challenge || null);
    },
    [challengesQuery.data],
  );

  const loadLeaderboard = useCallback(
    async (challengeId: string) => {
      await queryClient.invalidateQueries({ queryKey: ['challenge-leaderboard', challengeId] });
    },
    [queryClient],
  );

  const participate = useCallback(
    async (challengeId: string, videoUrl: string) => {
      await participateMutation.mutateAsync({ challengeId, videoUrl });
    },
    [participateMutation],
  );

  return {
    challenges: challengesQuery.data ?? [],
    activeChallenge,
    submissions,
    leaderboard: leaderboardQuery.data ?? [],
    isLoading: challengesQuery.isLoading,
    loadChallenges,
    selectChallenge,
    participate,
    loadLeaderboard,
  };
}

export default useChallenge;
