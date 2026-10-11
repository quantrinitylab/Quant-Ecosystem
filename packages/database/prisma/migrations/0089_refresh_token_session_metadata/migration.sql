-- QM-SCREEN-016: device metadata + source tag for the Security page's Active
-- Sessions tab. Previously the tab was theatrical — a hard-coded "Current
-- session" row and a permanently disabled Revoke All — because nothing was
-- ever recorded about browser sessions. These columns let GET /auth/sessions
-- list real sessions and POST /auth/sessions/revoke-others end them.
--
-- userAgent / ipAddress are display-only metadata captured at issuance and on
-- every rotation. Rows issued before this migration carry NULLs, and the UI
-- says "device details not recorded" for them instead of inventing a device.
--
-- source distinguishes cookie-based browser sessions ('browser') from
-- third-party OAuth app grants ('oauth') so the sessions list never shows an
-- OAuth grant as a device. NULL = issued before tagging, presumed browser
-- session (no OAuth apps were connected when this shipped).
ALTER TABLE "refresh_tokens" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "source" TEXT;
