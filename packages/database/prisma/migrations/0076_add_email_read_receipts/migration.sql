-- Read-receipt pipeline: per-copy delivery/read timestamps behind the
-- WhatsApp-style ticks on outbound messages. Additive and nullable: every row
-- written before this pipeline existed keeps working with no events recorded.
ALTER TABLE "emails" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "emails" ADD COLUMN "readAt" TIMESTAMP(3);
