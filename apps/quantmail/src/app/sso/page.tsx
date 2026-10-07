'use client';

import React, { Suspense } from 'react';
import { SsoChooserContent } from './SsoChooserContent';

export default function SsoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
          Loading SSO...
        </div>
      }
    >
      <SsoChooserContent />
    </Suspense>
  );
}
