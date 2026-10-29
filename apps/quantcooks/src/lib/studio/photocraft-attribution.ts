// ============================================================================
// QuantCooks Studio — third-party attribution record for the embedded
// layered photo editor (checklist row #80, plan unit C-3).
//
// This is QuantCooks' own in-repo attribution record, written for the
// C-3 embed. It is based on the license files verified inside the
// pinned release bundle itself (LICENSE-MIT, LICENSE-APACHE, NOTICE
// and ATTRIBUTION.md all ship inside photocraft-web-0.17.0.zip — see
// PHOTOCRAFT_PIN in ./photocraft.ts). The full upstream license texts
// travel with the bundle when the serving follow-up installs it; this
// record is the pointer that survives in the QuantCooks tree.
//
// Trademark boundary (from the upstream NOTICE, restated because it
// governs every QuantCooks surface): the upstream project's name,
// wordmark and logos are trademarks of its team; they are NOT covered
// by the code license and do NOT appear in QuantCooks UI copy. The
// editor is presented to users simply as "Photo Editor".
// ============================================================================

export const PHOTOCRAFT_ATTRIBUTION = {
  /** Upstream project (named here for attribution only — never in UI). */
  project: 'PhotoCraft',
  authors: 'ArtCraft Team and the PhotoCraft contributors',
  source: 'github.com/storytold/photocraft',
  version: '0.17.0',
  license: 'MIT OR Apache-2.0 (dual-licensed, at the recipient’s option)',
  licenseFilesInBundle: ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md'],
  releaseZipSha256: '9dbc979e138e83136d5958acd0cf7d1832aeae5095409eb4691dca577db5fc99',
  /**
   * Third-party material bundled inside the editor, as summarised in
   * the bundle's own NOTICE (the per-file author/source/license list
   * is the bundle's ATTRIBUTION.md):
   */
  bundledThirdParty: [
    'Inter font — SIL Open Font License 1.1',
    'JetBrains Mono font — SIL Open Font License 1.1',
    'Lucide icons — ISC (icons derived from Feather also MIT)',
    'SCOWL English word list — SCOWL license',
    'libfacedetection weights/network — BSD-3-Clause',
    'Emoji icon subset (from emoji-icon-font by John Slegers) — MIT',
  ],
  trademarkNote:
    'The upstream name, wordmark and logos are trademarks of the ArtCraft Team, are not ' +
    'open source, and are not used in any QuantCooks surface.',
} as const;

/** One-paragraph attribution, for an About/Notices surface to render. */
export const PHOTOCRAFT_ATTRIBUTION_TEXT =
  'The layered photo editor embedded in QuantCooks is PhotoCraft v0.17.0 ' +
  '(© 2026 ArtCraft Team and the PhotoCraft contributors), used under the ' +
  'MIT License or the Apache License, Version 2.0, at our option. Its full ' +
  'license texts and third-party notices (Inter and JetBrains Mono fonts, ' +
  'Lucide icons, and others) ship inside the editor bundle itself.';
