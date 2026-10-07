# M36 Mobile Implementation Contract

## Navigation

Use the existing QuantPillarTopBar/AppShell/ContextBottomNavBar architecture as the shared foundation. The implementation must preserve the invariant of one five-app switcher plus one contextual bottom navigation.

## Deep surfaces

Thread, compose, event editor, file preview, contact profile, repository/PR views may suppress generic suite chrome when the focused task benefits from it. Each focused surface must provide an explicit back/close affordance.

## Gestures

Gestures are enhancements, never undiscoverable critical paths. Destructive swipe actions require undo or confirmation according to risk.

## Accessibility

Respect font scaling, screen-reader labels, reduced motion, touch target sizing, and system back navigation.
