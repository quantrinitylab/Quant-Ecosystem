-- QC-F-518 (2026-10-21): group/channel history visibility for new members.
--
-- Until now, adding a member to a group handed them the ENTIRE prior
-- record unconditionally: MessageService.getMessages and the channel
-- feed bounded reads only by membership, never by the member's
-- joinedAt, and the Conversation model had no way to even express a
-- different choice (Telegram/WhatsApp both let a group hide pre-join
-- history from new members).
--
-- This migration only ADDS the setting:
--   conversations."historyVisibility" — 'VISIBLE' (default, today's
--   behaviour, so no existing group changes meaning) or 'HIDDEN'
--   (a member only sees messages at/after their own joinedAt).
--
-- The cutoff itself is enforced at read time in the services
-- (message.service getMessages/searchMessages, channel.service
-- getMessages) — no message rows are copied, moved, or deleted here,
-- and flipping the setting back to VISIBLE restores the full history,
-- because visibility is a read bound, not a purge.
--
-- All additive; no existing rows touched beyond the new column's
-- default.

CREATE TYPE "HistoryVisibility" AS ENUM ('VISIBLE', 'HIDDEN');

ALTER TABLE "conversations" ADD COLUMN "historyVisibility" "HistoryVisibility" NOT NULL DEFAULT 'VISIBLE';
