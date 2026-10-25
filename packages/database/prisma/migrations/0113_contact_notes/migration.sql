-- fix/qm-contacts-notes-field-r3 (2026-10-25): per-contact notes field.
--
-- Google Contacts gives every contact a free-form notes field (lightweight
-- CRM-style annotations, autosaved); QuantMail's Contact row had no column
-- for it, so there was nowhere to store relationship context ("met at Conf,
-- prefers morning calls"). Nullable TEXT: existing rows keep working, and
-- an empty/cleared note is stored as NULL (the service normalizes blank to
-- null) rather than an empty string, so "has notes" stays meaningful.
ALTER TABLE "contacts" ADD COLUMN "notes" TEXT;
