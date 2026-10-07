# M06 — Calendar Context / Meeting Intelligence

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Purpose

Connect mail conversations with calendar reality without duplicating Calendar ownership.

## User outcome

From a mail thread the user can understand:
- which meeting an email refers to
- upcoming related events
- conflicts
- RSVP state
- safe event actions

## Context card

Possible fields:
- event title
- start/end with timezone
- location/video link
- organizer
- attendee state
- response state
- conflict indicator
- event route

Calendar remains the source of truth.

## Email invite

The mail UI may identify an invitation and render:
- invitation summary
- RSVP state
- event details

RSVP actions are routed to Calendar.

## Meeting correlation

Correlation can use:
- explicit calendar event ID
- provider invitation headers
- normalized participants
- time proximity
- subject similarity

Inference must be labeled as inferred when not explicit.

## Conflict

A conflict card can say:
- "This overlaps with another event"
- "Calendar has no matching event"
- "Time zone differs"

It must link to Calendar for authoritative resolution.

## Actions

Allowed orchestration:
- open event
- RSVP
- create event from mail
- propose time
- add reminder

Mail does not directly write Calendar tables.

## Evidence

- explicit invite
- inferred meeting
- no matching event
- conflicting events
- RSVP success/failure
- timezone case
- Calendar outage
