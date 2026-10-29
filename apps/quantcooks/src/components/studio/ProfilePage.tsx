// ============================================================================
// QuantCooks Studio — Public profile (checklist row #68, specs §10.4, G-17)
//
// The studied pattern is a public face: avatar/name, follower counts, a
// featured project, a project grid, a Publish action. What exists today
// is exactly one of those five things — the project grid, from the real
// useProjects read. The rest is community-layer data (G-17) that no
// backend in this app can serve yet:
//  - Identity: no client read of any user's name/avatar exists (see
//    account.ts IDENTITY_VIEW) — so no name, no avatar image, and above
//    all NO follower numbers are rendered. An invented "128 followers"
//    is precisely the fabrication this unit refuses.
//  - Featured project: needs a featured/publish flag on the project
//    record; ServerProject has none.
//  - Publish: update_project's twin accepts only name and type today —
//    there is no publish flag to flip, so every card's Publish button is
//    disabled with that reason (account.ts PUBLISH_UNAVAILABLE_REASON).
//    When the flag lands, QuantAI may prepare a publish but never
//    complete one without the user's tap (CP-6 rule, specs §10.4).
// The grid shown is the signed-in caller's own, labelled as visible only
// to them until publishing exists — never presented as a public page of
// the handle in the URL.
// ============================================================================

import React from 'react';
import { profileProjectCards } from '../../lib/studio/account';
import type { ServerProject } from '../../services/api-client';

export type ProfileProjectsState = 'loading' | 'error' | 'ready';

export interface ProfilePageProps {
  /** The /profile/[user] route segment — displayed, never resolved. */
  handle: string;
  signedIn: boolean;
  projectsState: ProfileProjectsState;
  projectsError?: string | null;
  /** The caller's real projects (useProjects), when ready. */
  projects?: ServerProject[];
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  handle,
  signedIn,
  projectsState,
  projectsError,
  projects = [],
}) => {
  const cards = profileProjectCards(projects);

  return (
    <div className="studio-profile" data-testid="profile-page">
      <header className="studio-profile-header">
        <div className="studio-profile-avatar" data-testid="profile-avatar-unavailable" aria-hidden="true">
          ?
        </div>
        <div>
          <h1>@{handle}</h1>
          <p data-testid="profile-identity-unavailable">
            Public profiles are not live yet. QuantCooks has no public identity or follower data
            for this page — no name, avatar or counts are shown, because any that appeared here
            today would be invented. The community layer (G-17) is what turns this page public.
          </p>
          <p data-testid="profile-social-unavailable">
            Followers and following counts appear when the community layer exists. Until then this
            page makes no social claims at all.
          </p>
        </div>
      </header>

      <section className="studio-profile-featured" data-testid="profile-featured-unavailable">
        <h2>Featured project</h2>
        <p>
          Nothing is featured. Featuring a project needs a publish/featured flag on the project
          record, and projects do not carry one yet — so there is no featured slot to fill and
          none is faked.
        </p>
      </section>

      <section className="studio-profile-grid-section">
        <h2>Projects</h2>
        {!signedIn && (
          <p data-testid="profile-grid-signed-out">
            Sign in to see your own project grid here. Another cook&apos;s public grid cannot be
            shown yet — public profiles are not live (above).
          </p>
        )}
        {signedIn && projectsState === 'loading' && (
          <p data-testid="profile-grid-loading">Loading your projects…</p>
        )}
        {signedIn && projectsState === 'error' && (
          <p data-testid="profile-grid-error">
            Your projects could not be loaded{projectsError ? `: ${projectsError}` : ''}.
          </p>
        )}
        {signedIn && projectsState === 'ready' && cards.length === 0 && (
          <p data-testid="profile-grid-empty">
            No projects yet. Start one from Explore and it will appear in this grid.
          </p>
        )}
        {signedIn && projectsState === 'ready' && cards.length > 0 && (
          <>
            <p className="studio-account-note" data-testid="profile-grid-visibility">
              Your projects — visible only to you today. This grid becomes the public grid when
              publishing (G-17) exists.
            </p>
            <ul className="studio-profile-grid" data-testid="profile-grid">
              {cards.map((card) => (
                <li key={card.id} className="studio-profile-card" data-testid="profile-project-card">
                  <p className="studio-profile-card-name">{card.name}</p>
                  <p className="studio-account-note">
                    {card.type} · updated {card.updatedAt}
                  </p>
                  <a href={card.editorHref}>Open in editor</a>{' '}
                  <button
                    type="button"
                    disabled
                    title={card.publish.reason}
                    data-testid="profile-publish-disabled"
                  >
                    Publish
                  </button>
                  <p className="studio-account-note">{card.publish.reason}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
};

export default ProfilePage;
