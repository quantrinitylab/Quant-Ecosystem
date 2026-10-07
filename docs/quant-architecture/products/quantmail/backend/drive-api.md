# QuantMail Backend — Attachment / Drive API

## Query

mail.message.attachments

Input:
~~~ts
{ messageId: string }
~~~

Output:
~~~ts
{
  attachments: AttachmentSummary[];
  requestId: string;
}
~~~

## Capability

mail.attachment.prepare_download

Returns a short-lived, scoped capability for an authorized object.

## Preview

mail.attachment.prepare_preview

Preview is only available when:
- attachment exists
- user has access
- scan/security policy allows rendering

## Save to Drive

mail.attachment.save_to_drive

Input:
~~~ts
{
  attachmentId: string;
  destinationFolderId?: string;
}
~~~

Returns:
~~~ts
{
  driveFileId: string;
  route: string;
  requestId: string;
}
~~~

## Errors

- ATTACHMENT_NOT_FOUND
- ATTACHMENT_BLOCKED
- DOWNLOAD_NOT_ALLOWED
- PREVIEW_NOT_ALLOWED
- DRIVE_UNAVAILABLE
- FORBIDDEN
