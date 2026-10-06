// ============================================================================
// LegalSheet — legal info.
// Privacy Policy links to the real published page (quantmail.in/privacy).
// Terms of Service is honestly marked as forthcoming — no fabricated legal
// text, no dead link.
// ============================================================================
import React from 'react';
import { SettingsSheet, SheetNote } from '../SettingsSheet';
import { SettingsRow, SettingsCard } from '../SettingsRow';
import { LegalIcon, ChevronRightIcon } from '../SettingsIcons';

const PRIVACY_URL = 'https://quantmail.in/privacy';

export function LegalSheet({ onClose }: { onClose: () => void }) {
  return (
    <SettingsSheet
      title="Legal info"
      subtitle="The fine print."
      onClose={onClose}
      testId="legal-sheet"
    >
      <SettingsCard>
        <SettingsRow
          icon={<LegalIcon />}
          label="Privacy Policy"
          subtitle="How we handle your data"
          testId="legal-privacy"
          onClick={() => window.open(PRIVACY_URL, '_blank', 'noopener,noreferrer')}
        />
        <SettingsRow
          icon={<LegalIcon />}
          label="Terms of Service"
          subtitle="The rules of the road"
          comingSoon
          testId="legal-terms"
          trailing={<ChevronRightIcon />}
          onClick={() => {
            // Honest placeholder — the sheet already says it. Keep the row
            // tappable so it never feels dead.
          }}
        />
      </SettingsCard>
      <SheetNote>
        Our Terms of Service are being finalized and will appear here before they take effect.
        The Privacy Policy above is the live, published version.
      </SheetNote>
    </SettingsSheet>
  );
}
