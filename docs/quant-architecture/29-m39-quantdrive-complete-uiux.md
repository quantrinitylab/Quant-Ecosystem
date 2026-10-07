# M39 — QuantDrive Complete UI/UX System

## Mission
Make QuantDrive an implementation-ready cloud file workspace inside QuantMail Workspace. Drive owns file objects, folders, versions, sharing, storage lifecycle, previews, upload/download capabilities, and file permissions.

## Product thesis
QuantDrive should feel like a fast professional file workspace: immediate retrieval, clear hierarchy, trustworthy file state, excellent preview, safe sharing, and seamless movement between Mail attachments and canonical Drive objects.

## Primary information architecture
Home · My Drive · Shared · Recent · Starred · Trash.
Secondary: Shared with me, Shared by me, offline/local where supported, storage/usage, shortcuts, search filters.
Primary action: New / Upload.
Global: workspace switcher, universal search, Quanty launcher, account/session.

## Core screens
1. Drive Home
2. My Drive
3. Folder view
4. Shared with me
5. Shared by me
6. Recent
7. Starred
8. Trash
9. File preview
10. Image preview
11. Video preview
12. PDF/document preview
13. Audio preview
14. Unsupported-file state
15. Upload center
16. New/create menu
17. Folder creation
18. File/folder rename
19. Move/copy destination picker
20. Share dialog
21. Permissions/access viewer
22. Link sharing
23. Version history
24. File details
25. Activity/history
26. Drive search
27. Search filters
28. Storage/usage
29. Security/scanning state
30. Mail attachment handoff
31. Quanty file workspace
32. Drive settings handoff

## Ownership
Drive is authoritative for file object state. Mail attachment references are not duplicate Drive objects. Search indexes are retrieval surfaces, not truth. Object storage credentials never reach clients.

## File identity
Every file surface must make name, type, owner, modified time, location, sharing state, scan/availability state, and version context understandable when relevant.

## Preview principle
Preview is progressive and capability-aware. A file can exist while preview, download, or scan is unavailable. Never collapse these into one generic loading state.

## Sharing principle
Sharing UI separates current access from proposed changes. Link sharing exposes scope, audience, expiry, and permission. Saving a share change requires authoritative confirmation.

## Large collections
Desktop uses virtualized list/grid and cursor pagination. Mobile uses progressive loading and compact metadata. Sorting/filtering is server-compatible and restorable.
