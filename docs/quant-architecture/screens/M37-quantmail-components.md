# M37 — QuantMail Component System

## Core components
MailThreadRow, MailThreadList, MailMessageCard, RecipientChip, RecipientPicker, MailComposer, DraftStatus, AttachmentChip, AttachmentPanel, LabelPicker, SnoozePicker, BulkActionBar, MailSearchBar, SearchFilterSheet, MailContextRail, ContactContextCard, CalendarContextCard, DriveContextCard, SecurityBanner, QuarantineCard, DeliveryStatus, QuantySuggestion, QuantyActionCard.

## Required states
Every interactive component has default, hover, focus, pressed, selected, disabled, loading, error, and permission-aware states as applicable.

## Component ownership
Shared primitives come from the workspace design system. Mail-specific components live with QuantMail. Product components may compose shared primitives but may not mutate another product's source state.
