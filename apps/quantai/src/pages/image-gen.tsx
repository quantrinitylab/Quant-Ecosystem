// ============================================================================
// QuantAI - Image Generation Page
//
// Honesty gate: no image-generation backend is connected to this build.
// The page shows a plain "coming soon" state with zero simulated generation,
// sample images, or fake progress.
// ============================================================================

import React from 'react';

export default function ImageGenPage(): JSX.Element {
  return (
    <div className="image-gen-page">
      <header className="image-gen-header">
        <h1>Image Generation</h1>
      </header>

      <div className="image-gen-body">
        <div className="empty-state">
          <h2>Coming soon</h2>
          <p>
            Image generation is not available in this build. No image model is
            connected, so nothing is generated or previewed here yet.
          </p>
        </div>
      </div>
    </div>
  );
}
