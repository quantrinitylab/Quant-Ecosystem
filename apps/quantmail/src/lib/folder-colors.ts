// ============================================================================
// QuantDrive — folder color coding (fix/qm-drive-folder-colors-2).
//
// Drive-style "Change color" palette: a FIXED set of 16 swatches the backend
// validates every write against (PUT /drive/folders/:id/color). `null` is
// the default folder tint. The client must never invent a hex outside this
// list — normalizeFolderColor() clamps any backend value to the palette so a
// stale/foreign row can never render in an arbitrary color.
// ============================================================================

export interface FolderColor {
  name: string;
  hex: string;
}

export const FOLDER_COLORS: FolderColor[] = [
  { name: 'Tomato', hex: '#E87171' },
  { name: 'Tangerine', hex: '#F6A76B' },
  { name: 'Sunflower', hex: '#F7D354' },
  { name: 'Lime', hex: '#A3E635' },
  { name: 'Mint', hex: '#7DD8A8' },
  { name: 'Seafoam', hex: '#4FD1C5' },
  { name: 'Sky', hex: '#63B3ED' },
  { name: 'Periwinkle', hex: '#8EA2F8' },
  { name: 'Lavender', hex: '#B794F6' },
  { name: 'Orchid', hex: '#D68BE0' },
  { name: 'Rose', hex: '#F687B3' },
  { name: 'Peach', hex: '#FDBA74' },
  { name: 'Graphite', hex: '#9CA3AF' },
  { name: 'Slate', hex: '#64748B' },
  { name: 'Cocoa', hex: '#A18072' },
  { name: 'Steel', hex: '#7C8DA6' },
];

const HEX_TO_COLOR = new Map(FOLDER_COLORS.map((c) => [c.hex.toUpperCase(), c]));

/** Clamp an incoming folder color to the palette; unknown values → null (default tint). */
export function normalizeFolderColor(color: string | null | undefined): string | null {
  if (!color) return null;
  return HEX_TO_COLOR.has(color.toUpperCase()) ? color.toUpperCase() : null;
}

/** Human name for a palette hex, or null for the default tint. */
export function folderColorName(hex: string | null | undefined): string | null {
  if (!hex) return null;
  return HEX_TO_COLOR.get(hex.toUpperCase())?.name ?? null;
}
