# QuantMail Flutter — M01 Inbox

Targets:
- Android
- iOS

## Widget structure

QuantMailInboxScreen
- QuantPillarTopBar
- SearchBar
- InboxModeSwitcher
- InboxActionBar
- lazy thread list
- ThreadRow
- ContextBottomNavBar

Use shared shell only once.

## Native behavior

Android:
- back goes thread -> inbox before leaving
- haptics only on meaningful actions
- approved capability bridge for share/deep links

iOS:
- native swipe expectations
- safe-area handling
- system navigation conventions

## Offline

Allowed:
- cached inbox snapshot
- cached reads
- local preferences

Conditional:
- queued read/star/archive only where conflict semantics are implemented

Forbidden by default:
- send
- destructive delete
- policy/admin actions

## Performance

- first list paint does not wait for Quanty/context
- bounded avatar loading
- cursor pagination
- row mutation must not rebuild the whole list
