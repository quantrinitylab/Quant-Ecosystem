# QuantMail Flutter — M04 Search

## Structure

SearchScreen
- top search field
- scope selector
- filter sheet
- grouped results
- result row
- retry/degraded domain state

## Native behavior

- platform keyboard opens immediately on entry
- back returns to prior screen
- clear action is one tap
- haptic only for meaningful selection/action

## Offline

Show only explicitly cached/recent search state if policy allows.
Never present stale cached search as guaranteed current.

## Accessibility

- semantic result group labels
- clear focus order
- announced result counts when available
- sufficient touch targets
