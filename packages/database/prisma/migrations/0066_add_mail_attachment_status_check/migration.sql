-- Migration 0066: Constrain mail_attachments.status to actual runtime lifecycle states
ALTER TABLE "mail_attachments" DROP CONSTRAINT IF EXISTS "mail_attachments_status_check";
ALTER TABLE "mail_attachments" ADD CONSTRAINT "mail_attachments_status_check"
    CHECK ("status" IN ('PENDING', 'READY', 'REJECTED'));
