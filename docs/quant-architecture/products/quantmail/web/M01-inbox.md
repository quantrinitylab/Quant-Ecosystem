# QuantMail Web — M01 Inbox

## Layout

Desktop wide:
- global pillar switcher
- QuantMail rail
- inbox content
- optional context rail

Desktop compact:
- collapse secondary rail
- preserve thread density
- keep search reachable

Tablet:
- prioritize inbox
- context becomes overlay

Mobile browser:
- mobile shell rules
- one top app switcher
- one contextual bottom navigation

## Components

- InboxPage
- InboxHeader
- InboxModeTabs
- InboxToolbar
- ThreadList
- ThreadRow
- ThreadRowActions
- InboxContextRail

Data hooks:
- useMailThreads
- useMailThreadCommand
- useMailContext

Never fetch Quanty independently for every row.

## Rendering

- stable list keys
- cursor pagination
- optimistic mutation has bounded reconciliation
- server response is source of truth
- thread routes support deep linking
- context is lazy loaded

## Browser QA

Verify:
- 1440px desktop
- 1024px compact/tablet
- 390px mobile
- keyboard navigation
- browser back/forward
- deep-link refresh
- throttled network
- 401/403/500 responses
