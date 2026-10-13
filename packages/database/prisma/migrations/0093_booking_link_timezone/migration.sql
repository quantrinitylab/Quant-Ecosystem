-- fix/qm-booking-tz-availability-2: host availability hours were timezone-naive
-- (BookingLinksModal captured no tz; lockSlot/confirmBooking day-boundary
-- checks used server-local setHours/getDay). This column stores the host's
-- IANA timezone so slot windows are computed in host tz and displayed in
-- guest tz. Legacy links default to 'UTC', matching the previous server-tz
-- behavior on UTC servers.
ALTER TABLE "booking_links" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
