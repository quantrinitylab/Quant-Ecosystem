# M36 — Five-App Navigation Architecture

## QuantMail
Primary navigation: Inbox, Starred, Snoozed, Sent, Drafts, Scheduled, More. Product actions include Compose, filters, labels, thread actions, and mailbox administration where authorized.

## QuantCalendar
Primary navigation: Today, Calendar views, Agenda, Tasks/related attention where implemented. Primary action is Create event. Scheduling and RSVP remain Calendar-owned.

## QuantDrive
Primary navigation: Home, My Drive, Shared, Recent, Starred, Trash. Primary action is Upload/New. File actions remain Drive-owned.

## QuantContacts
Primary navigation: People, Favorites, Groups, Organizations, Import/Export where authorized. Contact profile is the canonical people surface.

## QuantGit
Primary navigation: Repositories, Assigned Work, Issues, Pull Requests, Actions, Settings where authorized. QuantGit keeps its specialized developer chrome and must not inherit a consumer Mail bottom bar.

## Cross-app navigation

A link between products is a contextual relationship, not ownership transfer. Example: a Mail thread may open a related Calendar event; the event remains Calendar-owned. A Drive file opened from Mail remains Drive-owned.

## Back behavior

Back returns to the previous product context and preserves list position/filter/search where safe. Opening a cross-product object must record an origin context so the user can return without reconstructing state.

## Mobile

The five-app switcher is available from the compact top surface. Only the active product's contextual navigation appears at the bottom. Never render a global five-app bottom navigation plus a product bottom navigation simultaneously.
