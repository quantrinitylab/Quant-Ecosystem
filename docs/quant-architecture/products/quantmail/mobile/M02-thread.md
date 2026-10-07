# QuantMail Flutter — M02 Thread

## Structure

ThreadScreen
- top bar
- participant summary
- message list
- attachment cells
- reply action
- contextual action sheet

## Gesture policy

Allowed:
- swipe back according to platform convention
- attachment open
- explicit message action controls

Avoid hidden gesture-only destructive actions.

## Long threads

- lazy rendering
- collapse older messages
- preserve current anchor
- restore anchor after rotation/navigation where supported

## Mobile composer

Reply action opens the smallest useful composer surface.
Draft persists independently from thread rendering.

## Native handoffs

Attachments use approved viewer/share capabilities.
No unrestricted file access from the web-rendered content layer.
