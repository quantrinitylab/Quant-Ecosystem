# M36 — QuantMail Workspace Mobile UX

## Global mobile shell

Top: compact five-app switcher + search/action affordance.
Middle: active product content.
Bottom: one contextual navigation bar for the active product when navigation depth warrants it.

## Rules

- Never stack two bottom navigation systems.
- Respect safe-area insets.
- Use sheets for secondary actions and focused pages for primary workflows.
- Preserve scroll position and draft state across app switching.
- Swipe gestures require visible alternatives and must not be the only way to perform destructive actions.
- Keyboard appearance must not hide primary actions.

## Product switching

Switching app preserves each product's local navigation state where practical. The active app is visually obvious and announced to assistive technology.

## Offline/degraded

Mobile surfaces show cached/readable state when available and clearly distinguish pending local actions from server-confirmed state.
