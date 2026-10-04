// ============================================================================
// quant_core - realtime mail events module barrel (M6 prep, W4)
// ============================================================================
//
// Public surface of the realtime mail-events groundwork: hint payload models
// ([MailEvent] / [parseMailEvent]), the pure [EventGapTracker], and the
// [MailEventSource] transport seam with [mailEventChannelName].
//
// NOTE: the transport seam ships NO websocket implementation yet — see
// `mail_event_source.dart` for the staged-P0-3 merge-time wiring plan.

export 'event_gap_tracker.dart';
export 'mail_event_source.dart';
export 'mail_events.dart';
