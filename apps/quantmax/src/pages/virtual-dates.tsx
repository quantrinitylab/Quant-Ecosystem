// ============================================================================
// QuantMax - Virtual Date Activities
//
// HONESTY NOTE (2026-10-07): this page previously fabricated the whole feature
// — a hardcoded partner "Emma", a fake watch-together catalog with fake CDN
// thumbnails, rigged rock-paper-scissors and coin-flip trivia against a fake
// opponent. No virtual-dates backend exists (no partner, no shared sessions),
// so the page is now an honest "coming soon" placeholder until real
// date-with-a-partner sessions ship.
// ============================================================================

import React from 'react';

const VirtualDatesPage: React.FC = () => {
  return (
    <div className="virtual-dates-page coming-soon">
      <div className="coming-soon-card">
        <span className="coming-soon-icon" aria-hidden="true">🎬</span>
        <h1 className="page-title">Virtual Dates</h1>
        <span className="coming-soon-badge">Coming soon</span>

        <p className="coming-soon-description">
          Watch together, play games, cook together, trivia nights, and a shared
          whiteboard — real activities with a real date. None of that is wired
          up yet, so there&apos;s no partner, no catalog, and no games on this
          page right now.
        </p>

        <div className="planned-activities">
          <h3>Planned activities</h3>
          <div className="activities-grid">
            <div className="activity-card">
              <span className="activity-icon" aria-hidden="true">🎬</span>
              <h3 className="activity-name">Watch Together</h3>
              <p className="activity-desc">Watch videos, movies or shows together in sync</p>
            </div>
            <div className="activity-card">
              <span className="activity-icon" aria-hidden="true">🎮</span>
              <h3 className="activity-name">Play a Game</h3>
              <p className="activity-desc">Fun mini-games to play together and compete</p>
            </div>
            <div className="activity-card">
              <span className="activity-icon" aria-hidden="true">🍳</span>
              <h3 className="activity-name">Cook Together</h3>
              <p className="activity-desc">Follow recipes together and show off your skills</p>
            </div>
            <div className="activity-card">
              <span className="activity-icon" aria-hidden="true">🧠</span>
              <h3 className="activity-name">Trivia Night</h3>
              <p className="activity-desc">Test your knowledge with fun trivia questions</p>
            </div>
            <div className="activity-card">
              <span className="activity-icon" aria-hidden="true">🎨</span>
              <h3 className="activity-name">Draw Together</h3>
              <p className="activity-desc">Shared whiteboard for drawing, doodling, or pictionary</p>
            </div>
          </div>
        </div>

        <p className="coming-soon-note">
          We&apos;d rather show you this honest placeholder than pretend a fake
          partner is waiting to play along.
        </p>
      </div>
    </div>
  );
};

export default VirtualDatesPage;
