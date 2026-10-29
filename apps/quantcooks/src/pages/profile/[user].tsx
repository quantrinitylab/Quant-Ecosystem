// ============================================================================
// QuantCooks Studio — Public profile page (route: /profile/[user],
// checklist #68, G-17)
//
// Thin wiring: the handle comes from the route; the only real read is
// the signed-in caller's own projects (useProjects), handed to
// ProfilePage with its state. The handle is displayed but never
// resolved — no public identity, follower, or publishing backend exists
// yet, and ProfilePage renders those layers in their honest
// not-available states rather than inventing a person. The grid is the
// caller's own and is labelled visible-only-to-you until publishing
// (G-17) exists.
// ============================================================================

import React from 'react';
import { useRouter } from 'next/router';
import { StudioShell } from '../../components/studio/StudioShell';
import { ProfilePage, type ProfileProjectsState } from '../../components/studio/ProfilePage';
import { useAuth } from '../../providers/auth-provider';
import { useProjects } from '../../hooks/useProjects';

export default function PublicProfilePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const projectsQuery = useProjects();

  const handleParam = router.query.user;
  const handle = typeof handleParam === 'string' ? handleParam : 'me';

  const projectsState: ProfileProjectsState = projectsQuery.isLoading
    ? 'loading'
    : projectsQuery.isError
      ? 'error'
      : 'ready';

  return (
    <StudioShell active="profile">
      <ProfilePage
        handle={handle}
        signedIn={isAuthenticated}
        projectsState={projectsState}
        projectsError={projectsQuery.error instanceof Error ? projectsQuery.error.message : null}
        projects={projectsQuery.data ?? []}
      />
    </StudioShell>
  );
}
