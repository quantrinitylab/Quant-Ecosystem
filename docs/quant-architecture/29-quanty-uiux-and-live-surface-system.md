# 29 — Quanty UI/UX and Live Surface System

## Design language
Quanty should feel like one living intelligence, not a modal dialog. Motion communicates state; it must never replace text/status. The Quanty mark/avatar is consistent across products while each product retains its own brand identity.

## Surfaces
1. Entry button: persistent product-local Quanty affordance.
2. Chat panel: conversation, attachments, tool results, citations/evidence, task cards.
3. Voice capsule: compact live state near the camera/island area on supported mobile layouts.
4. Expanded live sheet: transcript, current action, plan progress, confirmation and controls.
5. Task center: background jobs across products.
6. Handoff banner: “Opening QuantMax…” with cancel/return.
7. Confirmation sheet: target/action/consequence and confirm/cancel.
8. Error/unknown sheet: what happened, what is known, next safe action.

## Live capsule states
Idle → listening → processing → speaking → executing → asking → confirming → completed/error. Each state has a distinct animation, label and accessibility announcement. Reduced-motion mode replaces animation with static state indicators.

## Visible execution
When Quanty performs an action, the destination UI should render the real product state. Quanty may show a lightweight execution rail, but must not fake UI changes in an animation overlay.

## Cross-app transition
A transition preserves the Quanty capsule/task indicator. The target app receives only the scoped handoff context. Returning to the prior app restores the prior task view when possible.

## Voice-first accessibility
Live transcript is always available. Users can switch to text, type corrections, select entities from disambiguation cards and confirm actions without speech. Screen readers receive semantic state changes, not animation descriptions.

## Responsive behavior
Mobile: capsule + bottom sheet. Tablet: side rail or floating panel. Web: dockable panel. Desktop: floating panel/window. QuantMeet: compact participant-aware assistant surface that never covers critical meeting controls.

## Empty/loading/error
Every Quanty surface has explicit loading, offline, microphone denied, speech unavailable, model unavailable, tool unavailable, permission denied, confirmation pending and unknown-outcome states.

## Implementation
UIX-01 design tokens; UIX-02 capsule; UIX-03 chat; UIX-04 live sheet; UIX-05 confirmation; UIX-06 task center; UIX-07 transitions; UIX-08 accessibility; UIX-09 responsive surfaces; UIX-10 visual regression.
