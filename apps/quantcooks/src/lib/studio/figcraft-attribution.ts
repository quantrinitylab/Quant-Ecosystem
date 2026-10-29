// ============================================================================
// QuantCooks Studio — third-party attribution record for the embedded
// design editor (plan unit C-7, Design Studio "Screens").
//
// This is QuantCooks' own in-repo attribution record, written for the
// C-7 embed. It is based on the license files verified inside the
// pinned release bundle itself (LICENSE-MIT, LICENSE-APACHE, NOTICE
// and the OFL-*.txt font license texts all ship inside
// figcraft-web-0.12.1.zip — see FIGCRAFT_PIN in ./figcraft.ts). The
// full upstream license texts travel with the bundle at its serving
// path (public/design-editor/0.12.1/); this record is the pointer
// that survives in the QuantCooks tree.
//
// Trademark boundary (from the upstream NOTICE, restated because it
// governs every QuantCooks surface): the upstream project's name,
// wordmark and logos are trademarks of its team; they are NOT covered
// by the code license and do NOT appear in QuantCooks UI copy. The
// editor is presented to users simply as "Design Studio".
// ============================================================================

export const FIGCRAFT_ATTRIBUTION = {
  /** Upstream project (named here for attribution only — never in UI). */
  project: 'FigCraft',
  authors: 'ArtCraft Team and the FigCraft contributors',
  source: 'github.com/storytold/figcraft',
  version: '0.12.1',
  license: 'MIT OR Apache-2.0 (dual-licensed, at the recipient’s option)',
  licenseFilesInBundle: ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE'],
  releaseZipSha256: '8f52f52d4897d35b14c2a347c44ab6362b60b93d6a2f54a17d218111b9006c37',
  /**
   * Third-party material bundled inside the editor: the bundle ships
   * 28 OFL-*.txt license files for its user-interface fonts (Inter,
   * Lato, Montserrat, Open Sans, Poppins, Roboto, the Noto families,
   * and others), each under the SIL Open Font License 1.1. The files
   * themselves travel with the bundle at its serving path.
   */
  bundledThirdParty: [
    'Bundled user-interface fonts (28 OFL-*.txt files in the bundle) — SIL Open Font License 1.1',
  ],
  trademarkNote:
    'The upstream name, wordmark and logos are trademarks of the ArtCraft Team, are not ' +
    'open source, and are not used in any QuantCooks surface.',
} as const;

/** One-paragraph attribution, for an About/Notices surface to render. */
export const FIGCRAFT_ATTRIBUTION_TEXT =
  'The design editor embedded in QuantCooks is FigCraft v0.12.1 ' +
  '(© 2026 ArtCraft Team and the FigCraft contributors), used under the ' +
  'MIT License or the Apache License, Version 2.0, at our option. Its full ' +
  'license texts and font notices (SIL Open Font License 1.1) ship inside ' +
  'the editor bundle itself.';
