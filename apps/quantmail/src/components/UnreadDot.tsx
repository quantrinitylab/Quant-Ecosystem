'use client';

/**
 * The one accent an unread row is allowed, plus the word that goes with it.
 *
 * All three lists that mark unread — the inbox, search results and the folder
 * mailboxes — shipped the same `<span className="mail-unread-dot"
 * aria-label="Unread" />`, and it named nothing. ARIA 1.2 prohibits `aria-label`
 * on role `generic`, which is what a `<span>` with no role maps to, and the
 * element has no text of its own, so the name is pruned and unread arrives as
 * colour alone — the one fact about a row that colour is least able to carry.
 *
 * The split is the house convention: the dot is decorative and says so, and the
 * word lives in `sr-only` text, exactly as `MessageKindBadge` does for its
 * compact glyph. Not `role="img"` with a name — an 8px disc is not a picture of
 * anything, and text a reader can find with its own cursor beats a graphic whose
 * whole content is its label.
 *
 * The `sr-only` sibling is out of flow, so it adds no gap to the flex rows it
 * sits in.
 */
export function UnreadDot() {
  return (
    <>
      <span className="mail-unread-dot" aria-hidden="true" />
      <span className="sr-only">Unread</span>
    </>
  );
}

export default UnreadDot;
