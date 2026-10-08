-- QM-M39-006: link sharing scope/audience/expiry (M39 screen 22).
-- Adds `scope` and `audience` to drive_share_links so a share link can be
-- restricted to "anyone with the link", "people in my organization", or
-- "specific people". Existing rows keep `scope = 'anyone'` (the only behavior
-- that existed before), so nothing silently changes access on upgrade.
-- `audience` holds a JSON array of user IDs for scope='specific'; it stays
-- NULL for the other scopes. Expiry was already enforced on resolve/download
-- (410 LINK_EXPIRED); this migration only adds the scope/audience state the
-- M39 link-share dialog needs to be honest about who a link reaches.
ALTER TABLE "drive_share_links" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'anyone';
ALTER TABLE "drive_share_links" ADD COLUMN "audience" TEXT;
