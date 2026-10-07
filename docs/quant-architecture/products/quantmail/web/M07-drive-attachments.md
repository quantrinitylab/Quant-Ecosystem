# QuantMail Web — M07 Attachments

## Components

- AttachmentList
- AttachmentCard
- AttachmentPreview
- ScanStatus
- SaveToDriveAction
- DownloadAction

## UX

Safe supported files:
- preview inline when practical

Unsafe/blocked:
- clear security state
- no preview/download bypass

Large files:
- progressive preview or explicit download

## Drive handoff

Save-to-Drive opens a destination picker or uses a recent approved destination.
Result links to the canonical Drive file.

## Performance

Do not download full attachments just to render list metadata.
Preview loads separately.
