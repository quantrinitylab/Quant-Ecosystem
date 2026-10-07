# QuantMail Authentication and Command Audit — 2026-08-02

> Scope: login, registration, password recovery, global command palette, and related active backend routes on `main` at `1404e9bcd1e301798d36ef9a3fd3ebf594193350`.

## Executive finding

Login and registration have strong interaction foundations: accessible field errors, loading announcements, password visibility controls, normalized QuantMail addresses, non-enumerating recovery copy, and consistent auth branding. Three contract gaps still block trustworthy completion:

1. password recovery UI targets routes that do not exist in the active backend;
2. registration consent and email-verification claims are not backed by the inspected server contract;
3. command labels claim people search and priority inbox behaviour that their destinations do not establish.

## Login

### Strengths

- Address-or-handle normalization is explicit.
- Required fields have inline errors and accessible descriptions.
- Password visibility has a pressed state and clear accessible name.
- Loading and failure states are announced.

### Risk

The page renders an arbitrary `success` query parameter as a trusted success banner. React escapes the text, but any link can make QuantMail display attacker-chosen success copy. Success banners should be selected from trusted state/codes, not arbitrary URL prose.

### Required boundary

- Replace free-form `success` text with an allowlisted result code or short-lived internal navigation state.
- Keep authentication errors generic where account enumeration matters.
- Preserve the current accessible field behaviour.

## Registration

### Strengths

- Username normalization and address preview are visible.
- Password confirmation and strength feedback exist.
- Duplicate account responses from the backend are actionable.
- Submission is disabled while pending.

### Contract gaps

- The terms checkbox has no linked Terms or Privacy documents.
- The client sends `acceptTerms`; the backend does not validate or store it.
- The backend marks new users `emailVerified: true` immediately.
- No inspected verification challenge proves address ownership.

### Required boundary

Define a real ownership/verification policy and a versioned consent contract. Do not issue verification claims beyond completed evidence.

Tracking: #118.

## Password recovery

### Strengths

- Public copy avoids confirming whether an account exists.
- The form distinguishes offline/network failure.
- Loading and completion states are accessible.

### Blocking gaps

- The client calls `/auth/password-reset` and `/auth/password-reset/confirm`.
- The active backend auth route implements login, register, and change-password only.
- The app has no reset-confirmation page.
- The request page treats every non-network failure as completion, including a missing route.

### Required boundary

Implement rate-limited request and confirmation endpoints, hashed single-use tokens, verified delivery, expiry/reuse states, a confirmation page, and session invalidation policy.

Tracking: #117.

## Command palette

### Strengths

- `Ctrl/Cmd + K` is a real global handler.
- Public auth routes correctly suppress the palette and MailCopilot.
- Commands close the palette after navigation.
- Groups provide useful Create, Find, Mail, Context, Code, and Control hierarchy.

### Truthfulness gaps

- `Search mail and people` opens an email-only search screen.
- `Open priority inbox` opens the general inbox without establishing a priority filter.
- MailCopilot repeats the priority-inbox claim.

### Required boundary

Use `Search mail` and `Open inbox` until the corresponding expanded capabilities exist. Treat the current palette as navigation, not an execution surface.

Tracking: Design OS issue #71.

## Release rule

Authentication and security copy is part of the security boundary. A success, verification, recovery, or inventory claim must come from authenticated server evidence or an allowlisted internal state—not free-form URL text or missing data.