'use client';

// ============================================================================
// QuantGram (QuantNeon) — Geospatial Social Map Page (/map)
// Forensic 98-Screen Instagram Parity (Screens 33-36, 75-78) - Task W39-G07
// ============================================================================

import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { SocialMapView } from '../components/SocialMapView';
import type { StoryLocationPin } from '../features/map/social-map';

export default function SocialMapPage() {
  const router = useRouter();
  const [activeStory, setActiveStory] = useState<StoryLocationPin | null>(null);

  const handleOpenStory = (pin: StoryLocationPin) => {
    setActiveStory(pin);
    // Deep-link or modal route into story viewer
    if (pin.storyId) {
      router.push(`/story-viewer?id=${pin.storyId}`);
    }
  };

  return (
    <>
      <Head>
        <title>Social Map | QuantGram</title>
        <meta
          name="description"
          content="Explore stories from creators around the globe on the QuantGram Geospatial Social Map."
        />
      </Head>

      <div className="w-full h-screen max-h-screen overflow-hidden flex flex-col bg-[#090A0C]">
        <SocialMapView currentUserId="current-user" onOpenStory={handleOpenStory} />
      </div>
    </>
  );
}
