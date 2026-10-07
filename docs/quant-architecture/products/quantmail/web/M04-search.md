# QuantMail Web — M04 Search

## UI

- persistent search entry
- command/keyboard shortcut
- recent searches where privacy settings allow
- scope chips
- grouped result sections
- result hover/keyboard actions
- domain status indicator
- clear/retry controls

Desktop should support direct keyboard navigation:
- / focus
- arrows move
- Enter open
- Esc close/return

## Responsive

Desktop:
- search popover or full results route

Mobile:
- dedicated search route
- full-width input
- stacked result groups

## Rendering

Search result rows are domain-adapter driven.
Do not build product-specific assumptions into a generic row.

## QA

Test:
- empty query
- no results
- partial domain outage
- unauthorized result
- slow search
- malformed cursor
- back/forward history
