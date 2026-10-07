# M36 — QuantDrive UI/UX

## Information architecture

Drive is an object workspace. Home provides useful entry points; My Drive provides hierarchy; Shared, Recent, Starred, and Trash provide alternate retrieval paths.

## File list

Desktop supports list and grid modes. List mode prioritizes name, owner, modified time, type, size, sharing state, and contextual actions. Grid mode prioritizes visual scanning and preview.

## File preview

Preview opens in a focused viewer with metadata and safe actions. Download/share/save-to-location actions remain explicit. Security and scanning states are visible when applicable.

## Upload

Upload is asynchronous with per-file progress, retry, failure explanation, and cancellation where safe. Never imply a file is available before the authoritative state confirms it.

## Cross-product attachment

A Mail attachment can open in Drive context without duplicating the canonical file object. The UI should explain whether the user is viewing a received attachment or a Drive file.
