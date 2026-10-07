# QuantMail Flagship UX Architecture

> QuantMail is the identity root and first flagship proof of the Quant Design OS. It is not only an email client; it is the user's trusted communication and work command centre.

## 1. Product promise

**One identity. Every conversation, commitment, file and next action.**

QuantMail should make cross-app intelligence visible without overwhelming the user. Mail remains the primary task; calendar, contacts, drive, code and agents appear when context makes them useful.

## 2. Information architecture

### Global product rail

- Quantrinity/product switcher;
- Mail;
- Calendar;
- Drive;
- Code;
- Automations;
- search/command access;
- account and settings.

### Mail navigation

- Inbox;
- Priority;
- Needs reply;
- Commitments;
- Scheduled/Snoozed;
- Sent;
- Drafts;
- Trash;
- labels and spaces.

### Workspace

Desktop uses up to three task panes:

1. conversation list;
2. active thread/compose;
3. contextual intelligence.

Panes are resizable within tested limits. Empty inboxes do not render two giant blank panels.

## 3. Home/inbox

### Header

- current view and count;
- universal search/command trigger;
- filters and density;
- prominent Compose action;
- account/status controls.

### Smart brief

A compact, dismissible intelligence layer may show:

- unread summary;
- messages likely needing reply;
- detected commitments;
- upcoming meetings with relevant threads;
- risky or time-sensitive items.

Every item links to evidence. The brief cannot silently move, send or delete mail.

### Conversation rows

Rows communicate sender, subject, useful preview, participants, time, unread state, attachments, labels and AI-derived urgency without icon overload. Keyboard selection and bulk actions are first-class.

## 4. Thread experience

The active thread prioritises reading:

- clear participants and trust indicators;
- collapsible message history;
- attachment previews;
- reply/reply-all/forward;
- related files/events/contacts;
- quoted text disclosure;
- phishing/external sender warnings where applicable.

Contextual AI actions:

- summarise;
- identify decisions and commitments;
- draft a reply in the user's style;
- translate;
- create calendar event;
- save or locate files;
- open a task/project;
- explain technical content.

## 5. Compose

Compose is a focused editor, not a full-screen black rectangle.

Required structure:

- recipients with contact/identity resolution;
- subject;
- rich editor;
- attachments and Drive insertion;
- schedule send, signature and security options;
- visible send action and keyboard shortcut;
- autosave status;
- AI writing tools in context.

AI suggestions must preserve the user's text and show a diff/preview before replacement. Tone controls are a secondary workflow, not permanently dominant chips.

## 6. Contextual intelligence panel

The right panel changes with context:

- people and relationship context;
- related mail;
- calendar events;
- files and Drive locations;
- commitments;
- verified memory used for suggestions;
- next actions;
- activity across connected Quant products.

The panel can collapse completely. On tablet/mobile it becomes a drawer.

## 7. Cross-product boundaries

Calendar, Contacts and Drive can appear as integrated surfaces because they directly support communication. Repositories and pipelines belong in a coherent **Code workspace**, not as generic mail folders. Cross-navigation preserves identity and context but does not force unrelated tools into the mail sidebar.

## 8. Activation states

### New user

Instead of blank canvases:

1. confirm identity and recovery methods;
2. import/connect an account or send a first message;
3. show a guided sample thread;
4. explain AI and memory controls;
5. offer calendar/drive connection when relevant.

### Empty view

Each view has a specific action:

- Inbox: send/import/connect;
- Sent: compose or review scheduled mail;
- Drafts: start from a template/recent context;
- Contacts: import or create;
- Drive: upload/connect storage;
- Calendar: create or import event;
- Code: create/import repository.

## 9. Error and offline behaviour

- preserve cached/read content when network calls fail;
- separate partial service failure from total app failure;
- queue safe drafts locally;
- state retry timing and recovery;
- never expose raw backend error text as primary copy;
- destructive actions remain unavailable when state cannot be confirmed.

## 10. Authentication and endorsement

Auth uses the same product system as the application. The visual transition after sign-in must not feel like entering a different product.

Splash/auth lockup:

```text
QuantMail
by [Quantrinity mark] QUANTRINITY
```

The left-side promise remains concise and evidence-based. Benefits shown before authentication must visibly exist inside the product.

## 11. Responsive patterns

### Desktop

Three-pane workspace at wide widths; two-pane at medium widths.

### Tablet

List + active content, with navigation and intelligence drawers.

### Mobile

Inbox list → thread → compose as distinct screens. Bottom actions respect safe areas. No desktop sidebar or fixed-width modal is reused unchanged.

## 12. First prototype set

The first reviewable prototype covers:

1. splash/endorsement;
2. login;
3. populated intelligent inbox;
4. thread with contextual panel;
5. compose with AI preview;
6. universal command palette;
7. empty/new-user activation;
8. Drive partial-failure state;
9. desktop, tablet and mobile variants.

## 13. Acceptance scenarios

- find and open a priority conversation using keyboard only;
- understand why an item is marked important;
- draft and inspect an AI-assisted reply without losing original text;
- turn a commitment into a calendar/task action;
- attach a Drive file;
- recover from a Drive service failure without leaving mail;
- correct or remove memory used by AI;
- complete the same core mail task on 390 px mobile width.

Success is measured by task clarity, completion, accessibility and trust—not by the number of decorative screens.