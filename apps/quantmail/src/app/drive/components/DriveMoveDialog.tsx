'use client';

// QM-DRIVE-MOVE — user-facing "Move to…" destination picker.
//
// Root cause of the finding: handleMoveFile existed in drive/page.tsx but
// nothing ever called it — there was no Move button, no destination picker,
// and no drag target. This dialog is the picker half: the page opens it for
// a file/folder, the user picks a destination, the page calls handleMoveFile.
// It renders plain markup (no shared Modal dependency) so it stays
// unit-testable with renderToStaticMarkup.

export interface MoveDestination {
  /** null = My Drive (root). */
  id: string | null;
  name: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface MoveDialogFolder {
  id: string;
  name: string;
}

/**
 * Destination list for moving one item.
 *
 * - "My Drive" is always listed first. It is disabled when the item already
 *   lives at root (currentFolderId === null) — moving root-to-root is a
 *   no-op, and offering it would toast a success for nothing happening.
 * - The item itself is never listed: a folder cannot be its own destination
 *   (the backend also rejects this with CIRCULAR_REFERENCE, but the picker
 *   should not offer an option that can only fail).
 * - Only folders visible in the current view are offered. That covers the
 *   reported case (a file uploaded at root moved into a visible folder) and
 *   moving back out to My Drive; deeper cross-tree moves go through folder
 *   navigation first, not through an invented folder list.
 */
export function moveDestinations(
  folders: MoveDialogFolder[],
  moveTargetId: string | null,
  currentFolderId: string | null,
): MoveDestination[] {
  const destinations: MoveDestination[] = [
    currentFolderId === null
      ? {
          id: null,
          name: 'My Drive',
          disabled: true,
          disabledReason: 'Already in My Drive',
        }
      : { id: null, name: 'My Drive' },
  ];
  for (const folder of folders) {
    if (folder.id === moveTargetId) continue;
    destinations.push({ id: folder.id, name: folder.name });
  }
  return destinations;
}

export interface DriveMoveDialogProps {
  open: boolean;
  itemName: string;
  itemType: 'file' | 'folder';
  destinations: MoveDestination[];
  onSelect: (destinationId: string | null) => void;
  onClose: () => void;
}

export function DriveMoveDialog({
  open,
  itemName,
  itemType,
  destinations,
  onSelect,
  onClose,
}: DriveMoveDialogProps) {
  if (!open) return null;
  const selectable = destinations.filter((d) => !d.disabled);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Move "${itemName}" to another folder`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[#0B0E14] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-[#F8FAFC]">Move &ldquo;{itemName}&rdquo;</h3>
        <p className="text-xs text-[#94A3B8] mt-1">
          Choose where this {itemType === 'folder' ? 'folder' : 'file'} should live.
        </p>
        {selectable.length === 0 ? (
          <p className="text-xs text-[#94A3B8] mt-4 rounded-lg bg-[var(--quant-surface)] p-3">
            No other folders yet — create a folder first, then move items into it.
          </p>
        ) : (
          <ul className="mt-4 space-y-1.5">
            {destinations.map((destination) => (
              <li key={destination.id ?? 'root'}>
                <button
                  type="button"
                  disabled={destination.disabled}
                  onClick={() => onSelect(destination.id)}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-[#F8FAFC] bg-[var(--quant-surface)] hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--quant-surface)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                >
                  <span>
                    {destination.id === null ? 'My Drive' : destination.name}
                    {destination.disabled && destination.disabledReason ? (
                      <span className="block text-[11px] font-normal text-[#64748B]">
                        {destination.disabledReason}
                      </span>
                    ) : null}
                  </span>
                  {!destination.disabled && (
                    <span className="text-[var(--app-accent)]">Move here</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-[var(--quant-surface)] text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
