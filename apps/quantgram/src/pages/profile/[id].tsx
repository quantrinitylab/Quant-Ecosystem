// ============================================================================
// QuantNeon - User Profile Page
// Forensic 98-Screen Instagram Parity (Task W39-G04)
// Powered by ProfileView 4-Tab Matrix & Multi-Account Switcher
// ============================================================================

import React from 'react';
import { useRouter } from 'next/router';
import { LoadingState, ErrorState, EmptyState, PageTransition } from '@quant/shared-ui';
import { useProfile } from '../../hooks/useProfile';
import { ProfileView } from '../../components/ProfileView';

const ProfilePage: React.FC = () => {
  const router = useRouter();
  const id = (router.query.id as string) || '';

  const { data: profile, isLoading, error, refetch } = useProfile(id);

  if (isLoading && id) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#000000] flex items-center justify-center">
          <LoadingState variant="skeleton" text="Loading profile..." />
        </div>
      </PageTransition>
    );
  }

  if (error) {
    // An honest 404: the profile genuinely doesn't exist. Show an empty state,
    // not a retry button that can never succeed. Other errors keep the retry.
    const code = (error as { code?: string } | null)?.code;
    if (code === 'PROFILE_NOT_FOUND' || code === 'NOT_FOUND') {
      return (
        <PageTransition>
          <div className="min-h-screen bg-white dark:bg-[#000000] flex items-center justify-center">
            <EmptyState
              title="Profile not found"
              description={`The account "${id}" doesn't exist or was removed. Check the link and try again.`}
              actionLabel="Back to explore"
              onAction={() => router.push('/explore')}
            />
          </div>
        </PageTransition>
      );
    }
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#000000] flex items-center justify-center">
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <ProfileView
        userId={id}
        initialProfile={profile}
        isOwnProfile={true}
        onPostClick={(postId) => router.push(`/post/${postId}`)}
        onReelClick={(reelId) => router.push(`/reels?id=${reelId}`)}
        onStoryClick={(storyUserId) => router.push(`/story-viewer?userId=${storyUserId}`)}
        onAccountSwitched={(account) => router.push(`/profile/${account.id}`)}
      />
    </PageTransition>
  );
};

export default ProfilePage;
