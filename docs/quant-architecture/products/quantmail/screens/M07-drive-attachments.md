# M07 — Drive / Attachment Context

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Purpose

Make email attachments useful across Mail and Drive without turning Mail into a file-storage system.

## User outcome

A user can:
- see attachment metadata
- preview safe supported types
- download with authorization
- save/copy to Drive
- understand scan/security state
- find related Drive files

## Attachment card

Fields:
- attachmentId
- filename
- mime type
- size
- scan state
- preview availability
- source message
- Drive relationship where authorized

## States

- uploading
- available
- scanning
- blocked
- preview unavailable
- download unavailable
- deleted/expired

Never imply an attachment is safe merely because the email itself is readable.

## Save to Drive

Flow:
1. user chooses Save to Drive
2. Drive destination selected
3. capability checked
4. object copied/moved through owning service
5. Drive returns canonical file ID
6. Mail shows relationship

Mail does not write Drive tables.

## Preview

Preview service must:
- use safe rendering
- respect scan status
- isolate active content
- enforce size/time limits

## Evidence

- image/pdf preview
- unsupported type
- blocked file
- large file
- Save to Drive
- download authorization failure
- Drive outage
