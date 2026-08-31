// ============================================================================
// QuantMail Drive proxy — where the Drive backend lives
// ============================================================================
//
// Drive is served by the QuantMail backend (`backend/routes/drive.ts` declares
// the whole `/drive/*` surface), so the local default has to be the QuantMail
// port. It said 3011 in all eight proxy routes — a port nothing listens on —
// which is why every Drive call in local dev came back 502
// `UPSTREAM_UNAVAILABLE` and the Drive page never loaded a file, a folder or a
// quota. Deployed environments set `QUANTMAIL_BACKEND_URL` and so were never
// affected, which is how the wrong default survived eight copies of itself.
//
// `QUANTDRIVE_BACKEND_URL` is kept as an override for the day Drive moves to a
// service of its own.

export const DRIVE_BACKEND_URL =
  process.env.QUANTDRIVE_BACKEND_URL ||
  process.env.QUANTMAIL_BACKEND_URL ||
  'http://localhost:3010';
