// ============================================================================
// driveFilesViewState — restorable sort/filter state for DriveFilesSubView
// (QM-M39-014). Sort/filter are server-compatible (they map 1:1 onto the
// GET /drive/files `sortBy`/`sortDir`/`filter` query params), so the persisted
// state can be re-applied as a server query after navigation instead of being
// re-derived client-side.
// ============================================================================

export type DriveSortKey = 'name' | 'updatedAt' | 'size';
export type DriveSortDir = 'asc' | 'desc';
/** Type-card filters. Each maps to a GET /drive/files `filter` value. */
export type DriveTypeFilter = 'all' | 'pdf' | 'doc' | 'code' | 'zip';

export interface DriveFilesViewState {
  sortBy: DriveSortKey;
  sortDir: DriveSortDir;
  typeFilter: DriveTypeFilter;
}

export const DEFAULT_DRIVE_FILES_VIEW_STATE: DriveFilesViewState = {
  sortBy: 'updatedAt',
  sortDir: 'desc',
  typeFilter: 'all',
};

const SORT_KEYS: DriveSortKey[] = ['name', 'updatedAt', 'size'];
const SORT_DIRS: DriveSortDir[] = ['asc', 'desc'];
const TYPE_FILTERS: DriveTypeFilter[] = ['all', 'pdf', 'doc', 'code', 'zip'];

export function driveFilesViewStateKey(folderId: string | null | undefined): string {
  return `quantdrive:files-view:${folderId ?? 'root'}`;
}

function readStorage(): Storage | null {
  try {
    // Prefer window.sessionStorage in browsers; fall back to a global stub so
    // the helpers stay unit-testable in a node environment.
    const g = globalThis as {
      window?: { sessionStorage?: Storage | null };
      sessionStorage?: Storage | null;
    };
    return g.window?.sessionStorage ?? g.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Loads the persisted view state for a folder; returns only valid fields. */
export function loadDriveFilesViewState(
  folderId: string | null | undefined,
): Partial<DriveFilesViewState> {
  const storage = readStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(driveFilesViewStateKey(folderId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<DriveFilesViewState>;
    const out: Partial<DriveFilesViewState> = {};
    if (parsed.sortBy && SORT_KEYS.includes(parsed.sortBy)) out.sortBy = parsed.sortBy;
    if (parsed.sortDir && SORT_DIRS.includes(parsed.sortDir)) out.sortDir = parsed.sortDir;
    if (parsed.typeFilter && TYPE_FILTERS.includes(parsed.typeFilter)) {
      out.typeFilter = parsed.typeFilter;
    }
    return out;
  } catch {
    return {};
  }
}

/** Persists the view state for a folder. Never throws. */
export function saveDriveFilesViewState(
  folderId: string | null | undefined,
  state: DriveFilesViewState,
): void {
  const storage = readStorage();
  if (!storage) return;
  try {
    storage.setItem(driveFilesViewStateKey(folderId), JSON.stringify(state));
  } catch {
    // Storage full or unavailable — view state is a convenience, not data.
  }
}
