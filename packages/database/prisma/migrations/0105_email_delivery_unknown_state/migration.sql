-- fix/qm-stuck-send-reconciler: explicit UNKNOWN delivery outcome.
--
-- A transmit whose provider response was lost (SES accepted but the response
-- timed out) is neither delivered nor definitively failed. Recording it as
-- 'deferred' would silently allow re-fire (duplicate send); recording it as
-- 'delivered' would be a lie. 'unknown' is preserved honestly: the worker
-- fire-gate never fires it, the stuck-send reconciler never re-enqueues it,
-- and it surfaces to the user for manual resolution instead of auto-retry.
ALTER TYPE "EmailDeliveryStatus" ADD VALUE IF NOT EXISTS 'unknown';
