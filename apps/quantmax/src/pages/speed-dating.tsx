// ============================================================================
// QuantMax - Speed Dating
//
// HONESTY NOTE (2026-10-07): this page previously fabricated the entire
// feature — fake time slots with random participant counts, fake date partners
// (random Emma/Sophia/Liam names, coin-flip verification badges), fake timers,
// and coin-flip "mutual matches". No speed-dating backend exists, so the page
// is now an honest "coming soon" placeholder until real matchmaking ships.
// ============================================================================

import React from 'react';

const SpeedDatingPage: React.FC = () => {
  return (
    <div className="speed-dating-page coming-soon">
      <div className="coming-soon-card">
        <span className="coming-soon-icon" aria-hidden="true">💕</span>
        <h1 className="page-title">Speed Dating</h1>
        <span className="coming-soon-badge">Coming soon</span>

        <p className="coming-soon-description">
          3-minute video dates with real people. Quick, fun, and pressure-free —
          that&apos;s the plan. Speed dating isn&apos;t available yet, so
          there are no sessions, partners, or timers on this page right now.
        </p>

        <div className="how-it-will-work">
          <h3>How it will work</h3>
          <div className="steps">
            <div className="step">
              <span className="step-number">1</span>
              <span className="step-text">Join a real time slot</span>
            </div>
            <div className="step">
              <span className="step-number">2</span>
              <span className="step-text">3-min video date with a matched person</span>
            </div>
            <div className="step">
              <span className="step-number">3</span>
              <span className="step-text">Rate &amp; connect for real</span>
            </div>
          </div>
        </div>

        <p className="coming-soon-note">
          We&apos;d rather show you this honest placeholder than a fake lobby
          with invented people and rigged matches.
        </p>
      </div>
    </div>
  );
};

export default SpeedDatingPage;
