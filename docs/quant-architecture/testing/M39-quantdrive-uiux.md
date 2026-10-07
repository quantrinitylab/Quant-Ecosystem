# M39 — QuantDrive UI/UX Acceptance Tests

## Critical flows
1. Home → My Drive → folder → preview → back → exact context restored.
2. Upload → progress → scan → available/blocked authoritative state.
3. Select file → share → inspect audience/permission → save → verified access state.
4. File → versions → inspect → restore selected version → verify current version.
5. Trash → restore → verify object returns to authoritative location.
6. Search → filter → preview → return → exact query/filter state restored.
7. Mail attachment → inspect → save/open in Drive → return to Mail origin.
8. Quanty suggestion → review proposed organization → explicit approval → verify result.

## Responsive
Desktop, tablet, mobile, narrow mobile, landscape, large text, reduced motion, keyboard-visible mobile.

## Security
Blocked/scanning files cannot be represented as normal downloadable files. Client never receives object-store credentials. Sharing changes never imply success before authoritative confirmation.

## Performance
Large folders use cursor pagination/virtualization. Preview and secondary metadata load progressively. Upload progress remains responsive during navigation.
