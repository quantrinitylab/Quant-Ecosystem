# Requirements Document

## Introduction

QuantMail is the flagship application of the Quant ecosystem: a single, deeply integrated
product that combines an email client (Gmail-class), a code-hosting and CI platform
(GitHub-class), and an AI assistant (Copilot/ClaudeCode-class) behind one premium dark UI.
Every QuantMail user receives a first-class identity address, `username@quantmail.in`, which
serves as both a real mailbox and the single-sign-on identity across all Quant applications.

A working foundation is already live in production on `quantmail.quantrinity.in`: registration,
login, sessions, JWT issuance with aligned issuer/audience, `/oauth/userinfo`, internal
mail delivery between `@quantmail.in` users, contacts, repositories with CI pipelines,
calendar and drive surfaces backed by database models, an AI compose endpoint wired to the
real `@quant/ai` engine, and a premium dark-themed auth and inbox experience.

This document specifies the capabilities required to complete QuantMail to its full vision.
It covers the depth features that bring mail, code, and AI to parity with the incumbents,
the external mail pipeline via AWS SES, programmatic control by QuantAI, a consistent premium
dark experience across every screen, ecosystem-wide SSO, and the security correctness
properties that must hold throughout. The document is scoped to the QuantMail application and
its directly owned services; other Quant applications are treated as external consumers of
QuantMail's identity and action APIs.

## Glossary

- **QuantMail**: The integrated email, code-hosting, and AI application specified by this document.
- **QuantMail_Backend**: The server-side application (Fastify) that exposes QuantMail's HTTP and action APIs.
- **QuantMail_UI**: The Next.js frontend that renders all QuantMail screens.
- **Identity_Service**: The component that issues, verifies, and manages authentication tokens and OAuth/OIDC flows.
- **Quant_Address**: A user's canonical address of the form `username@QUANT_MAIL_DOMAIN` (default `quantmail.in`), which is also the user's ecosystem login identity.
- **QUANT_MAIL_DOMAIN**: The environment-configurable domain under which Quant_Addresses are issued.
- **Internal_Mail**: An email whose sender and all recipients are Quant_Addresses, delivered entirely within QuantMail.
- **External_Mail**: An email where at least one sender or recipient address is outside QUANT_MAIL_DOMAIN, requiring the SES pipeline.
- **Mail_Pipeline**: The outbound and inbound mail-processing components integrating AWS SES for External_Mail.
- **SES**: Amazon Simple Email Service, used for outbound send and inbound receipt of External_Mail.
- **Message_Authentication**: The set of SPF, DKIM, and DMARC checks applied to mail.
- **Label**: A user-defined or system tag applied to emails for organization (e.g. Inbox, Sent, Spam, Starred).
- **Filter_Rule**: A user-defined condition-and-action rule automatically applied to incoming emails.
- **Thread**: A conversation grouping of related emails sharing a conversation identifier.
- **Repository**: A code-hosting project owned by a user, containing branches, files, commits, pull requests, and issues.
- **Git_Storage**: The backing store that holds real git object content (trees, blobs, commits) for a Repository.
- **Pull_Request**: A proposed set of changes between two branches of a Repository, supporting diff view and review.
- **CI_Pipeline**: An automated build/test workflow associated with a Repository, producing runs, logs, and artifacts.
- **AI_Engine**: The `@quant/ai` multi-provider inference engine backing QuantMail's AI features.
- **AI_Provider_Key**: A configured credential (OpenAI/Anthropic/Google/OpenRouter) that enables AI inference.
- **QuantAI**: The ecosystem AI assistant that programmatically operates QuantMail through the Action_API.
- **Action_API**: The documented, authenticated tool/action interface QuantAI uses to perform QuantMail operations.
- **Design_System**: The shared set of dark-theme design tokens and components used across QuantMail_UI.
- **Secure_Token**: An identifier or secret generated from a cryptographically secure random source.
- **User**: An authenticated owner of a Quant_Address interacting with QuantMail.

## Requirements

### Requirement 1: Gmail-class Mail Organization

**User Story:** As a QuantMail user, I want to organize my mail with labels, stars, importance, and read state, so that I can manage a high-volume inbox efficiently.

#### Acceptance Criteria

1. WHEN a User applies a Label to an email, THE QuantMail_Backend SHALL persist the Label association and return the updated email in the `{success, data}` envelope.
2. WHEN a User removes a Label from an email, THE QuantMail_Backend SHALL remove the Label association and exclude that Label from the email's returned Label set.
3. WHEN a User creates a Label with a name, THE QuantMail_Backend SHALL store the Label scoped to that User and reject a duplicate name for the same User with an error response.
4. WHEN a User marks an email as read or unread, THE QuantMail_Backend SHALL persist the read state and reflect the state in subsequent inbox listings.
5. WHEN a User stars or marks an email as important, THE QuantMail_Backend SHALL persist the star and importance flags independently of each other.
6. THE QuantMail_Backend SHALL restrict every Label operation to emails owned by the requesting User.
7. WHERE a User requests emails filtered by a Label, THE QuantMail_Backend SHALL return only emails owned by that User that carry the specified Label.

### Requirement 2: Filters and Rules

**User Story:** As a QuantMail user, I want to define filters that act on incoming mail automatically, so that my inbox stays organized without manual effort.

#### Acceptance Criteria

1. WHEN a User creates a Filter_Rule with match conditions and actions, THE QuantMail_Backend SHALL persist the Filter_Rule scoped to that User.
2. WHEN an email is delivered to a User inbox, THE QuantMail_Backend SHALL evaluate the User's active Filter_Rules against that email in creation order.
3. WHEN an incoming email matches a Filter_Rule condition, THE QuantMail_Backend SHALL apply the Filter_Rule's configured actions to that email.
4. IF a Filter_Rule references a Label that does not exist, THEN THE QuantMail_Backend SHALL reject creation of the Filter_Rule with a descriptive error response.
5. WHEN a User disables a Filter_Rule, THE QuantMail_Backend SHALL exclude the disabled Filter_Rule from evaluation on subsequent incoming emails.

### Requirement 3: Snooze, Schedule-Send, and Undo-Send

**User Story:** As a QuantMail user, I want to control the timing of when messages appear and are sent, so that I can manage my attention and correct mistakes.

#### Acceptance Criteria

1. WHEN a User snoozes an email until a future timestamp, THE QuantMail_Backend SHALL persist the snooze timestamp and exclude the email from the inbox listing until that timestamp is reached.
2. WHEN a snooze timestamp is reached, THE QuantMail_Backend SHALL return the email to the inbox listing with unread state preserved.
3. WHEN a User schedules an email to send at a future timestamp, THE QuantMail_Backend SHALL persist the scheduled send server-side and deliver the email at or after the scheduled timestamp.
4. WHEN a User cancels a scheduled email before its send timestamp, THE QuantMail_Backend SHALL cancel the scheduled delivery and retain the email as a draft.
5. WHERE undo-send is enabled with a configured delay window, WHEN a User sends an email, THE QuantMail_Backend SHALL defer delivery until the delay window elapses.
6. WHEN a User invokes undo-send within the delay window, THE QuantMail_Backend SHALL cancel delivery and restore the email to a draft.

### Requirement 4: Signatures, Threading, and Conversation View

**User Story:** As a QuantMail user, I want signatures and grouped conversations, so that my messages are consistent and readable in context.

#### Acceptance Criteria

1. WHEN a User saves a signature, THE QuantMail_Backend SHALL persist the signature scoped to that User.
2. WHERE a User has a default signature configured, WHEN the User composes a new email, THE QuantMail_UI SHALL insert the default signature into the compose body.
3. WHEN emails share a conversation identifier, THE QuantMail_Backend SHALL group those emails into a single Thread in conversation-view responses.
4. WHEN a User opens a Thread, THE QuantMail_UI SHALL display the constituent emails ordered by ascending send timestamp.
5. THE QuantMail_Backend SHALL restrict Thread membership to emails owned by the requesting User.

### Requirement 5: Advanced Search and Keyboard Shortcuts

**User Story:** As a QuantMail user, I want advanced search operators and keyboard shortcuts, so that I can find and act on mail quickly.

#### Acceptance Criteria

1. WHEN a User submits a search query containing `from:`, `to:`, `subject:`, `label:`, `has:attachment`, `is:unread`, or `is:starred` operators, THE QuantMail_Backend SHALL return only emails owned by that User that satisfy every operator in the query.
2. WHEN a User submits a search query with free-text terms, THE QuantMail_Backend SHALL return emails owned by that User whose subject or body contains the terms.
3. IF a search query contains an unrecognized operator, THEN THE QuantMail_Backend SHALL return a descriptive error response identifying the invalid operator.
4. WHEN a User presses a defined keyboard shortcut in QuantMail_UI, THE QuantMail_UI SHALL perform the mapped action on the currently focused email or Thread.

### Requirement 6: Spam and Attachments

**User Story:** As a QuantMail user, I want spam handling and attachment support, so that unwanted mail is contained and files travel with my messages.

#### Acceptance Criteria

1. WHEN a User marks an email as spam, THE QuantMail_Backend SHALL move the email to the Spam Label and exclude it from the inbox listing.
2. WHEN a User marks a spam email as not spam, THE QuantMail_Backend SHALL remove the Spam Label and return the email to the inbox listing.
3. WHEN a User attaches a file to an email, THE QuantMail_Backend SHALL store the attachment and associate it with the email.
4. WHEN a recipient retrieves an email with attachments, THE QuantMail_Backend SHALL return attachment metadata and a retrieval reference for each attachment.
5. IF an attachment upload exceeds the configured maximum size, THEN THE QuantMail_Backend SHALL reject the upload with a descriptive error response.

### Requirement 7: Internal Mail Delivery Isolation

**User Story:** As a QuantMail user, I want mail between Quant_Addresses to be delivered privately and reliably, so that my internal correspondence is isolated from other users.

#### Acceptance Criteria

1. WHEN a User sends an Internal_Mail via the send endpoint, THE QuantMail_Backend SHALL deliver a copy to each recipient's inbox and record the email in the sender's Sent folder.
2. THE QuantMail_Backend SHALL exclude a User's own sent emails and drafts from that User's inbox listing.
3. THE QuantMail_Backend SHALL ensure that an inbox listing returns only emails delivered to the requesting User.
4. IF a User attempts to read or modify an email not owned by that User, THEN THE QuantMail_Backend SHALL reject the request with an authorization error response.
5. WHEN an Internal_Mail is delivered, THE QuantMail_Backend SHALL NOT expose the email content to any User who is neither the sender nor a recipient.

### Requirement 8: External Outbound Mail via SES

**User Story:** As a QuantMail user, I want to send email to external addresses, so that I can correspond with anyone from my Quant_Address.

#### Acceptance Criteria

1. WHEN a User sends an email addressed to a recipient outside QUANT_MAIL_DOMAIN, THE Mail_Pipeline SHALL submit the message to SES for delivery.
2. WHEN the Mail_Pipeline submits an External_Mail, THE Mail_Pipeline SHALL sign the message with DKIM using the configured domain key.
3. IF SES rejects an outbound submission, THEN THE Mail_Pipeline SHALL record the failure against the email and mark the email as not delivered.
4. WHEN SES reports a bounce for a previously sent External_Mail, THE Mail_Pipeline SHALL record the bounce against the originating email and against the recipient address.
5. WHEN SES reports a complaint for a previously sent External_Mail, THE Mail_Pipeline SHALL record the complaint and suppress future sends to the complaining recipient address.

### Requirement 9: External Inbound Mail via SES

**User Story:** As a QuantMail user, I want to receive email from external senders at my Quant_Address, so that my mailbox is a complete inbox.

#### Acceptance Criteria

1. WHEN SES receives inbound mail for a Quant_Address, THE Mail_Pipeline SHALL ingest the message and deliver it to the addressed User's inbox.
2. WHEN the Mail_Pipeline ingests inbound mail, THE Mail_Pipeline SHALL evaluate SPF, DKIM, and DMARC results for the message.
3. IF inbound mail fails DMARC evaluation, THEN THE Mail_Pipeline SHALL apply the domain's published DMARC policy to the message.
4. IF inbound mail is addressed to a Quant_Address that does not correspond to an existing User, THEN THE Mail_Pipeline SHALL reject the message without delivering it.
5. WHEN inbound mail carries attachments, THE Mail_Pipeline SHALL store the attachments and associate them with the ingested email.

### Requirement 10: GitHub-class Code Content

**User Story:** As a QuantMail user, I want real git repository content, so that I can host, browse, and manage code inside QuantMail.

#### Acceptance Criteria

1. WHEN a User creates a Repository, THE QuantMail_Backend SHALL persist the Repository scoped to that User and return it in the `{success, data}` envelope.
2. WHEN a User pushes git content to a Repository, THE QuantMail_Backend SHALL persist the commit, tree, and blob objects in Git_Storage.
3. WHEN a User requests a file at a path and reference, THE QuantMail_Backend SHALL return the file content stored in Git_Storage for that reference.
4. WHEN a User requests the commit history of a branch, THE QuantMail_Backend SHALL return the commits in reverse-chronological order.
5. IF a User requests content from a Repository they neither own nor have access to, THEN THE QuantMail_Backend SHALL reject the request with an authorization error response.
6. WHEN a User deletes a Repository, THE QuantMail_Backend SHALL remove the Repository and its associated Git_Storage content.

### Requirement 11: Pull Requests, Review, and CI

**User Story:** As a QuantMail developer, I want pull request diffs, reviews, and CI logs, so that I can collaborate on and verify code changes.

#### Acceptance Criteria

1. WHEN a User opens a Pull_Request between two branches, THE QuantMail_Backend SHALL compute and return the diff between the branch tips.
2. WHEN a User submits a review with a decision and comments on a Pull_Request, THE QuantMail_Backend SHALL persist the review associated with the Pull_Request.
3. WHEN a CI_Pipeline run executes, THE QuantMail_Backend SHALL persist the run's logs and produced artifacts.
4. WHEN a User requests the logs for a CI_Pipeline run, THE QuantMail_Backend SHALL return the stored logs for that run.
5. WHEN a User requests the artifacts for a completed CI_Pipeline run, THE QuantMail_Backend SHALL return retrieval references for the stored artifacts.

### Requirement 12: AI Mail Assistance

**User Story:** As a QuantMail user, I want AI to compose, reply, summarize, prioritize, and flag phishing, so that I can process mail faster and safer.

#### Acceptance Criteria

1. WHERE an AI_Provider_Key is configured, WHEN a User requests an AI compose or reply, THE QuantMail_Backend SHALL generate the text via the AI_Engine and return it in the `{success, data}` envelope.
2. WHERE an AI_Provider_Key is configured, WHEN a User requests a summary of a Thread, THE QuantMail_Backend SHALL return a summary generated from the emails the User owns in that Thread.
3. WHERE an AI_Provider_Key is configured, WHEN a User requests a priority assessment of an email, THE QuantMail_Backend SHALL return a priority classification for that email.
4. WHERE an AI_Provider_Key is configured, WHEN a User requests a phishing assessment of an email, THE QuantMail_Backend SHALL return a phishing risk classification for that email.
5. IF no AI_Provider_Key is configured, THEN THE QuantMail_Backend SHALL respond to AI feature requests with HTTP 503 and a structured provider-unavailable error.
6. THE QuantMail_Backend SHALL restrict every AI mail feature to emails and Threads owned by the requesting User.

### Requirement 13: AI Search and Code Assistance

**User Story:** As a QuantMail user, I want AI-powered search and inline code assistance, so that I can find information and write code without leaving QuantMail.

#### Acceptance Criteria

1. WHERE an AI_Provider_Key is configured, WHEN a User submits a natural-language AI search query, THE QuantMail_Backend SHALL return matching emails owned by that User ranked by relevance.
2. WHERE an AI_Provider_Key is configured, WHEN a User requests inline code assistance within a Repository, THE QuantMail_Backend SHALL return a code suggestion generated from the provided code context.
3. WHERE an AI_Provider_Key is configured, WHEN a User requests an AI review of a Pull_Request, THE QuantMail_Backend SHALL return review comments generated from the Pull_Request diff.
4. IF no AI_Provider_Key is configured, THEN THE QuantMail_Backend SHALL respond to AI search and code-assist requests with HTTP 503 and a structured provider-unavailable error.

### Requirement 14: AI Provider Key Management

**User Story:** As a QuantMail user, I want to manage AI provider keys, so that I control which model backs my AI features.

#### Acceptance Criteria

1. WHEN a User saves an AI_Provider_Key, THE QuantMail_Backend SHALL store the key in encrypted form scoped to that User.
2. WHEN a User retrieves their AI provider configuration, THE QuantMail_Backend SHALL return provider status and a masked representation of the stored key.
3. THE QuantMail_Backend SHALL NOT return a stored AI_Provider_Key in plaintext in any response.
4. WHEN a User deletes an AI_Provider_Key, THE QuantMail_Backend SHALL remove the stored key and disable AI features that depend on it for that User.

### Requirement 15: QuantAI Programmatic Control

**User Story:** As a QuantAI operator, I want a documented action API for QuantMail, so that QuantAI can operate mail, code, calendar, and drive on a user's behalf.

#### Acceptance Criteria

1. THE QuantMail_Backend SHALL expose an Action_API that includes send mail, search mail, create calendar event, and create Repository actions.
2. WHEN QuantAI invokes an Action_API action with a valid User authorization token, THE QuantMail_Backend SHALL execute the action as that User and return the result in the `{success, data}` envelope.
3. IF QuantAI invokes an Action_API action without a valid authorization token, THEN THE QuantMail_Backend SHALL reject the request with an authorization error response.
4. WHEN QuantAI invokes an Action_API action, THE QuantMail_Backend SHALL enforce the same ownership and access restrictions applied to direct User requests.
5. IF QuantAI invokes an Action_API action with parameters that fail schema validation, THEN THE QuantMail_Backend SHALL reject the request with a field-level validation error response.

### Requirement 16: Premium Dark Experience Across All Screens

**User Story:** As a QuantMail user, I want a consistent premium dark UI on every screen, so that the product feels cohesive and high-quality.

#### Acceptance Criteria

1. THE QuantMail_UI SHALL apply the dark Design_System theme by default on the inbox, thread, compose, settings, security, repos, pipelines, calendar, drive, contacts, and search screens.
2. THE QuantMail_UI SHALL render every screen using shared Design_System tokens for color, typography, and spacing.
3. WHEN a screen has no content to display, THE QuantMail_UI SHALL render a branded empty state consistent with the Design_System.
4. WHEN a data request is in progress, THE QuantMail_UI SHALL render a loading state consistent with the Design_System.

### Requirement 17: Ecosystem SSO Identity

**User Story:** As a Quant ecosystem user, I want my Quant_Address to be my single sign-on identity, so that I can access every Quant app with one login.

#### Acceptance Criteria

1. WHEN a User registers a username, THE QuantMail_Backend SHALL assign the Quant_Address `username@QUANT_MAIL_DOMAIN` as that User's login identity.
2. IF a requested username does not match the canonical handle format, THEN THE QuantMail_Backend SHALL reject registration with a descriptive validation error response.
3. WHEN a relying Quant application initiates an OAuth2/OIDC authorization flow, THE Identity_Service SHALL authenticate the User and issue tokens identifying the User by their Quant_Address.
4. WHEN a relying application requests user information via `/oauth/userinfo` with a valid access token, THE Identity_Service SHALL return the User's Quant_Address and profile claims.
5. WHEN a relying application performs PKCE code exchange, THE Identity_Service SHALL verify the PKCE code challenge using SHA-256 and reject a mismatched verifier.

### Requirement 18: Security Correctness Properties

**User Story:** As a QuantMail user, I want strong security guarantees, so that my identity, mail, and secrets are protected.

#### Acceptance Criteria

1. WHEN the QuantMail_Backend generates an identifier, secret, authorization code, or token, THE QuantMail_Backend SHALL derive it from a cryptographically secure random source.
2. THE QuantMail_Backend SHALL store user passwords and AI_Provider_Keys only in encrypted or hashed form and SHALL NOT store them in plaintext.
3. WHEN the Identity_Service issues an authentication token, THE Identity_Service SHALL set the token issuer and audience to values the token verifier accepts.
4. WHEN the QuantMail_Backend verifies an authentication token, THE QuantMail_Backend SHALL reject a token whose issuer or audience does not match the expected values.
5. WHEN the Mail_Pipeline sends External_Mail, THE Mail_Pipeline SHALL apply DKIM signing and SHALL rely on the domain's published SPF and DMARC records for authentication.
6. WHEN the Mail_Pipeline receives inbound External_Mail, THE Mail_Pipeline SHALL enforce the domain's DMARC policy against messages that fail Message_Authentication.
7. THE QuantMail_Backend SHALL NOT expose one User's emails, Repositories, or secrets to another User.
