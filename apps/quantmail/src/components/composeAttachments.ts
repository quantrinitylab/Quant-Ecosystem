/**
 * Shared attachment-admission logic for the mail composers.
 *
 * WHY THIS FILE EXISTS (fix/qm-compose-drag-drop): the full composer
 * (EmailComposer) promised "drag and drop files" in its body placeholder
 * while no composer wired any drop handler at all — files could only arrive
 * through the hidden file-input click. Drag-and-drop must admit EXACTLY the
 * same files the picker admits (same 20 MB per-file / 25 MB total caps),
 * otherwise a file the picker accepts could bounce on drop and vice versa.
 * Both composers therefore decide through `decideAttachmentFiles` and only
 * differ in how they REPORT refusals (their picker toasts differ, and that
 * difference is preserved, not papered over).
 *
 * This module is pure (no React, no DOM, no FileReader) so the decision
 * is unit-testable without a browser: the FileReader loops stay in the
 * components, next to the picker loops they mirror.
 */

export interface AttachmentFileDecision {
  /** Files that fit inside both caps, in input order. */
  accepted: File[];
  /** Files refused for exceeding the per-file cap. */
  tooBig: File[];
  /**
   * Files refused for exceeding the running total cap. With
   * `stopAtBudget` this holds at most the one file that tripped the
   * budget (the loop stops there, exactly like DockedComposer's picker);
   * without it, it holds every later file that still did not fit
   * (exactly like EmailComposer's picker, which keeps scanning).
   */
  overBudget: File[];
  /** True when the loop stopped early at the first over-budget file. */
  stoppedAtBudget: boolean;
}

/**
 * Decide which files from a picker selection OR a drag-and-drop may be
 * attached, given the bytes already attached.
 *
 * - A file over `maxPerFile` is refused and never counts toward the total.
 * - A file that would push `usedBytes + accepted` over `maxTotal` is
 *   refused; with `stopAtBudget` the scan stops at that file (later files
 *   are not examined, matching DockedComposer's picker `break`), without
 *   it the scan continues so a later smaller file can still fit
 *   (matching EmailComposer's picker).
 * - `files` may be a FileList, an array, or any array-like of File.
 */
export function decideAttachmentFiles(
  files: ArrayLike<File>,
  usedBytes: number,
  maxPerFile: number,
  maxTotal: number,
  stopAtBudget: boolean,
): AttachmentFileDecision {
  const accepted: File[] = [];
  const tooBig: File[] = [];
  const overBudget: File[] = [];
  let stoppedAtBudget = false;
  let used = usedBytes;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    if (file.size > maxPerFile) {
      tooBig.push(file);
      continue;
    }
    if (used + file.size > maxTotal) {
      overBudget.push(file);
      if (stopAtBudget) {
        stoppedAtBudget = true;
        break;
      }
      continue;
    }
    used += file.size;
    accepted.push(file);
  }

  return { accepted, tooBig, overBudget, stoppedAtBudget };
}

/**
 * True when a drag carries files (as opposed to dragged text, a link, or
 * an in-page selection). Drag handlers must check this before calling
 * preventDefault or showing a drop overlay — otherwise dragging selected
 * body text across the composer would flash the attachment dropzone and
 * hijack a text drag the browser should handle itself.
 *
 * Accepts the shape React exposes (`e.dataTransfer`) and degrades to
 * false for null/undefined transfers (unit tests, SSR).
 */
export function dragCarriesFiles(
  dataTransfer: { types?: readonly string[] | null } | null | undefined,
): boolean {
  const types = dataTransfer?.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'Files') return true;
  }
  return false;
}
