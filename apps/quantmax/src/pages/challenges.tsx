// ============================================================================
// QuantMax - Challenges Page
// Active challenges list with banner/description/prize, leaderboard table,
// submission count, participate button, video gallery of entries
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useChallenge } from '../hooks/useChallenge';

const ChallengesPage: React.FC = () => {
  const {
    challenges,
    activeChallenge,
    submissions,
    leaderboard,
    isLoading,
    loadChallenges,
    selectChallenge,
    loadLeaderboard,
  } = useChallenge();
  const [filter, setFilter] = useState<'active' | 'upcoming' | 'ended'>('active');
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);

  useEffect(() => {
    loadChallenges();
  }, []);

  useEffect(() => {
    if (activeChallenge) loadLeaderboard(activeChallenge.id);
  }, [activeChallenge]);

  const filteredChallenges = useMemo(() => {
    return challenges.filter((c) => c.status === filter);
  }, [challenges, filter]);

  const formatCount = useCallback((count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  }, []);

  if (isLoading && challenges.length === 0) {
    return <LoadingState variant="skeleton" text="Loading challenges..." />;
  }

  if (activeChallenge) {
    return (
      <div className="challenge-detail-page">
        <button className="back-btn" onClick={() => selectChallenge('')}>
          &larr; Back
        </button>
        <div className="challenge-banner-area">
          <img className="detail-banner" src={activeChallenge.banner} alt={activeChallenge.title} />
          <div className="banner-overlay">
            <h1 className="detail-hashtag">{activeChallenge.hashtag}</h1>
            <h2 className="detail-title">{activeChallenge.title}</h2>
          </div>
        </div>
        <div className="challenge-stats-row">
          <div className="stat-item">
            <span className="stat-value">{formatCount(activeChallenge.submissionCount)}</span>
            <span className="stat-label">Submissions</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{formatCount(activeChallenge.participantCount)}</span>
            <span className="stat-label">Participants</span>
          </div>
          {activeChallenge.prize && (
            <div className="stat-item prize">
              <span className="stat-value">{activeChallenge.prize}</span>
              <span className="stat-label">Prize Pool</span>
            </div>
          )}
        </div>
        <p className="challenge-description">{activeChallenge.description}</p>
        <div className="challenge-rules">
          <h3>Rules</h3>
          <ul className="rules-list">
            {activeChallenge.rules.map((rule, idx) => (
              <li key={idx} className="rule-item">
                {rule}
              </li>
            ))}
          </ul>
        </div>
        <button className="participate-btn large" onClick={() => {}}>
          Participate Now
        </button>

        <div className="detail-tabs">
          <button
            className={`detail-tab ${!showLeaderboard ? 'active' : ''}`}
            onClick={() => setShowLeaderboard(false)}
          >
            Entries
          </button>
          <button
            className={`detail-tab ${showLeaderboard ? 'active' : ''}`}
            onClick={() => setShowLeaderboard(true)}
          >
            Leaderboard
          </button>
        </div>

        {showLeaderboard && (
          <div className="leaderboard-section">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Creator</th>
                  <th>Likes</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`lb-row ${entry.rank <= 3 ? `top-${entry.rank}` : ''}`}
                  >
                    <td className="rank-cell">
                      {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                    </td>
                    <td className="creator-cell">
                      <span className="lb-username">{entry.userName}</span>
                    </td>
                    <td className="likes-cell">{formatCount(entry.likes)}</td>
                    <td className="score-cell">{entry.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!showLeaderboard && (
          <div className="entries-section">
            <div className="entries-grid">
              {submissions.length === 0 ? (
                <EmptyState title="No entries yet" description="Be the first to participate!" />
              ) : (
                submissions.map((entry) => (
                  <div key={entry.id} className="entry-card">
                    <img className="entry-thumbnail" src={entry.thumbnail} alt="Entry" />
                    <div className="entry-info">
                      <span className="entry-creator">@{entry.userName}</span>
                      <div className="entry-stats">
                        <span>&#10084; {formatCount(entry.likes)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="challenges-page">
      <div className="challenges-header">
        <h1 className="page-title">Challenges</h1>
      </div>
      <div className="challenge-filters">
        {(['active', 'upcoming', 'ended'] as const).map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="challenges-list">
        {filteredChallenges.length === 0 ? (
          <EmptyState
            title={`No ${filter} challenges`}
            description="Check back later for new challenges"
          />
        ) : (
          filteredChallenges.map((challenge) => (
            <div
              key={challenge.id}
              className="challenge-card"
              onClick={() => selectChallenge(challenge.id)}
            >
              <img className="challenge-card-banner" src={challenge.banner} alt={challenge.title} />
              <div className="challenge-card-content">
                <div className="challenge-card-header">
                  <h3 className="challenge-card-hashtag">{challenge.hashtag}</h3>
                  {challenge.prize && <span className="prize-tag">{challenge.prize}</span>}
                </div>
                <p className="challenge-card-desc">{challenge.description}</p>
                <div className="challenge-card-stats">
                  <span>{formatCount(challenge.submissionCount)} videos</span>
                  <span>{formatCount(challenge.participantCount)} creators</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ChallengesPage;
