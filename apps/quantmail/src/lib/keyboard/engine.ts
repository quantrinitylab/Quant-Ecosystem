/**
 * The QuantMail keyboard engine.
 *
 * One `keydown` listener for the whole application. Before this existed the app
 * had fifteen independent `document.addEventListener('keydown', …)` calls that
 * silently fought over `r`, `s`, `t`, `e`, `/`, `?` and `Escape`: pressing `r`
 * in the inbox both focused the reply box *and* navigated to the composer.
 *
 * The engine fixes that with three ideas:
 *
 * 1. **Scopes.** Bindings live in a named scope. Scopes are pushed onto a stack;
 *    a scope pushed as `exclusive` (what every modal does) masks everything
 *    below it, so a dialog's `Escape` can never race the sidebar's `Escape`.
 * 2. **Deterministic resolution.** For one key press the candidates are sorted
 *    by scope depth, then declared priority, then registration recency. Exactly
 *    one handler runs unless it explicitly passes through by returning `false`.
 * 3. **Sequences.** `g i` works for any binding, not just the one hard-coded
 *    prefix, and a chord that could still grow into a longer sequence is held
 *    rather than fired.
 *
 * The registry is a module singleton so non-React code can bind keys and so
 * Fast Refresh does not drop live bindings. It touches no browser API until
 * {@link KeyboardEngine.attach} is called, which keeps it import-safe on the server.
 */

import {
  candidateChords,
  parseSequence,
  sequenceToString,
  type Chord,
  type Sequence,
} from './chords';

/** Milliseconds a partially-typed sequence stays live before it is abandoned. */
const SEQUENCE_TIMEOUT_MS = 1400;

/**
 * Return `false` from a handler to decline the key press and let the next
 * matching binding try. Any other return value consumes it.
 */
export type ShortcutHandler = (event: KeyboardEvent) => void | boolean | Promise<void>;

export interface BindingOptions {
  /**
   * Named layer this binding belongs to. Bindings in a scope only fire while
   * that scope is active. Defaults to `'global'`, which is always active.
   */
  scope?: string;
  /** Higher wins within the same scope depth. Defaults to `0`. */
  priority?: number;
  /** Skip the binding when this returns `false`. Evaluated per key press. */
  enabled?: () => boolean;
  /**
   * Allow firing while a text input, textarea or contenteditable has focus.
   * Off by default — only chorded bindings such as `mod+enter` should opt in.
   */
  allowInInput?: boolean;
  /** Call `preventDefault()` when the binding fires. Defaults to `true`. */
  preventDefault?: boolean;
  /** Also call `stopPropagation()`. Defaults to `false`. */
  stopPropagation?: boolean;
  /**
   * Fire on auto-repeat while the key is held. Defaults to `true` for the
   * navigation keys where holding is natural, `false` everywhere else.
   */
  allowRepeat?: boolean;
  /**
   * Survive exclusive masking, so the binding still fires from inside a modal.
   *
   * Reserved for the app-wide escape hatches — the command palette and the
   * shortcuts sheet. Without this, opening any drawer or menu would leave ⌘K
   * dead, and the alternative is re-declaring the same binding in every scope
   * that masks it, which is how the fifteen competing listeners started.
   */
  unmaskable?: boolean;
  /** Human label, surfaced by the shortcuts sheet when this binding is ad hoc. */
  label?: string;
}

export interface Binding extends BindingOptions {
  id: string;
  sequences: Sequence[];
  handler: ShortcutHandler;
  /** Monotonic registration counter; later registrations win ties. */
  order: number;
}

interface ScopeFrame {
  name: string;
  exclusive: boolean;
  token: symbol;
}

/** Shared empty snapshot, so `getPendingChords()` is reference-stable when idle. */
const NO_CHORDS: Chord[] = [];

const REPEATABLE_BY_DEFAULT = new Set<Chord>([
  'j',
  'k',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'pageup',
  'pagedown',
  'backspace',
  'delete',
]);

/**
 * Elements that own their key presses. `[data-quant-keys="off"]` lets any
 * subtree — a code editor, a rich text surface — opt out wholesale.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== 'function') return false;

  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    // Checkboxes and buttons-as-inputs do not swallow text keys.
    const type = (element as HTMLInputElement).type;
    if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio' || type === 'button')) {
      return false;
    }
    return true;
  }
  if (element.isContentEditable) return true;
  return element.closest('[data-quant-keys="off"]') !== null;
}

export class KeyboardEngine {
  private bindings = new Map<string, Binding>();
  private scopeStack: ScopeFrame[] = [];
  private buffer: Chord[] = [];
  private bufferExpiresAt = 0;
  private orderCounter = 0;
  private attachCount = 0;
  private detach: (() => void) | null = null;
  private listeners = new Set<() => void>();
  /** Latest partially-typed sequence, for the "g …" hint chip. */
  private pendingChords: Chord[] = NO_CHORDS;

  // ─────────────────────────────── lifecycle ───────────────────────────────

  /**
   * Install the single global listener. Reference counted, so nested providers
   * or a Fast Refresh remount never produce duplicate listeners.
   */
  attach(target: Document | null = typeof document === 'undefined' ? null : document): () => void {
    if (!target) return () => {};
    this.attachCount += 1;

    if (this.attachCount === 1) {
      const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
      const onBlur = () => this.resetBuffer();
      // Capture phase: the engine decides before React's synthetic handlers, so
      // a binding can reliably suppress browser defaults such as ⌘K.
      target.addEventListener('keydown', onKeyDown, { capture: true });
      target.defaultView?.addEventListener('blur', onBlur);
      this.detach = () => {
        target.removeEventListener('keydown', onKeyDown, { capture: true });
        target.defaultView?.removeEventListener('blur', onBlur);
      };
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.attachCount -= 1;
      if (this.attachCount === 0) {
        this.detach?.();
        this.detach = null;
        this.resetBuffer();
      }
    };
  }

  // ─────────────────────────────── bindings ────────────────────────────────

  /**
   * Register a binding. `keys` accepts one binding string or several aliases
   * (`['mod+k', 'mod+p']`). Returns an unregister function.
   */
  bind(
    id: string,
    keys: string | string[],
    handler: ShortcutHandler,
    options: BindingOptions = {},
  ): () => void {
    const sequences = (Array.isArray(keys) ? keys : [keys])
      .map(parseSequence)
      .filter((sequence) => sequence.length > 0);

    if (sequences.length === 0) return () => {};

    this.orderCounter += 1;
    const binding: Binding = {
      ...options,
      id,
      sequences,
      handler,
      order: this.orderCounter,
    };
    this.bindings.set(id, binding);
    this.emit();

    return () => {
      // Only remove if it is still *this* registration — a remount may have
      // already replaced the entry under the same id.
      if (this.bindings.get(id) === binding) {
        this.bindings.delete(id);
        this.emit();
      }
    };
  }

  unbind(id: string): void {
    if (this.bindings.delete(id)) this.emit();
  }

  /** Every live binding, in registration order. Used by the shortcuts sheet. */
  getBindings(): Binding[] {
    return [...this.bindings.values()].sort((a, b) => a.order - b.order);
  }

  // ──────────────────────────────── scopes ─────────────────────────────────

  /**
   * Activate a scope. `exclusive` masks every shallower scope, which is what a
   * modal wants: while it is open, only its own keys and bindings marked
   * `unmaskable` respond. Returns a release function; releasing is idempotent and
   * order-independent, so overlapping modals unwind cleanly.
   */
  pushScope(name: string, { exclusive = false } = {}): () => void {
    const frame: ScopeFrame = { name, exclusive, token: Symbol(name) };
    this.scopeStack.push(frame);
    this.resetBuffer();
    this.emit();

    return () => {
      const index = this.scopeStack.findIndex((entry) => entry.token === frame.token);
      if (index === -1) return;
      this.scopeStack.splice(index, 1);
      this.resetBuffer();
      this.emit();
    };
  }

  /** Scope names currently active, outermost first. */
  getActiveScopes(): string[] {
    return this.scopeStack.map((frame) => frame.name);
  }

  /**
   * Depth of the topmost exclusive frame, or `-1` when none is active.
   * Bindings shallower than this are masked.
   */
  private exclusiveDepth(): number {
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      if (this.scopeStack[i].exclusive) return i;
    }
    return -1;
  }

  /**
   * How deeply nested a binding's scope is. `-1` means the scope is not active
   * at all, so the binding is ineligible.
   */
  private scopeDepthOf(scope: string): number {
    if (scope === 'global') return 0;
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      if (this.scopeStack[i].name === scope) return i + 1;
    }
    return -1;
  }

  private isScopeEligible(scope: string, unmaskable = false): boolean {
    const depth = this.scopeDepthOf(scope);
    if (depth === -1) return false;

    const exclusive = this.exclusiveDepth();
    if (exclusive === -1) return true;
    if (unmaskable) return true;
    // Only the exclusive frame itself and anything stacked above it may fire.
    return depth >= exclusive + 1;
  }

  // ───────────────────────────── subscription ──────────────────────────────

  /** Subscribe to binding/scope changes. Powers `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  // ──────────────────────────── event handling ─────────────────────────────

  private resetBuffer(): void {
    if (this.buffer.length > 0) this.buffer = [];
    this.bufferExpiresAt = 0;
    if (this.pendingChords.length > 0) {
      // Reuse the shared empty array: `getPendingChords` feeds
      // `useSyncExternalStore`, which compares snapshots by reference.
      this.pendingChords = NO_CHORDS;
      this.emit();
    }
  }

  /** Chords typed so far in an in-flight sequence, for on-screen hinting. */
  getPendingChords(): Chord[] {
    return this.pendingChords;
  }

  private eligibleBindings(inEditable: boolean): Binding[] {
    const result: Binding[] = [];
    for (const binding of this.bindings.values()) {
      if (inEditable && !binding.allowInInput) continue;
      if (!this.isScopeEligible(binding.scope ?? 'global', binding.unmaskable)) continue;
      result.push(binding);
    }
    // Deepest scope first, then explicit priority, then most recently bound.
    return result.sort((a, b) => {
      const scopeDelta =
        this.scopeDepthOf(b.scope ?? 'global') - this.scopeDepthOf(a.scope ?? 'global');
      if (scopeDelta !== 0) return scopeDelta;
      const priorityDelta = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDelta !== 0) return priorityDelta;
      return b.order - a.order;
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Never fight an IME: while composing, `key` is a partial glyph.
    if (event.isComposing || event.keyCode === 229) return;
    if (event.defaultPrevented) return;

    const now = Date.now();
    if (this.bufferExpiresAt !== 0 && now > this.bufferExpiresAt) this.resetBuffer();

    const inEditable = isEditableTarget(event.target);
    const candidates = this.eligibleBindings(inEditable);
    if (candidates.length === 0) {
      this.resetBuffer();
      return;
    }

    for (const chord of candidateChords(event)) {
      if (this.tryChord(chord, event, candidates)) return;
    }

    // Nothing matched and nothing is waiting on a longer sequence.
    this.resetBuffer();
  }

  /**
   * Attempt one canonical chord. Returns `true` when the key press was
   * consumed — either a handler ran or the chord extends a live sequence.
   */
  private tryChord(chord: Chord, event: KeyboardEvent, candidates: Binding[]): boolean {
    const attempt = [...this.buffer, chord];

    const matches: Array<{ binding: Binding; length: number }> = [];
    let hasLongerPrefix = false;

    for (const binding of candidates) {
      let matchedLength = 0;
      for (const sequence of binding.sequences) {
        if (sequence.length > attempt.length) {
          if (matchesPrefix(sequence, attempt)) hasLongerPrefix = true;
          continue;
        }
        if (!endsWith(attempt, sequence)) continue;
        if (!allowsRepeat(binding, sequence) && event.repeat) continue;
        if (sequence.length > matchedLength) matchedLength = sequence.length;
      }
      if (matchedLength === 0) continue;
      if (binding.enabled && !binding.enabled()) continue;
      matches.push({ binding, length: matchedLength });
    }

    // `candidates` arrives pre-sorted by scope depth, priority and recency;
    // a stable sort by sequence length keeps that order within each length so
    // `g i` beats a bare `i` without disturbing the rest of the ranking.
    matches.sort((a, b) => b.length - a.length);

    for (const { binding } of matches) {
      const outcome = binding.handler(event);
      // A handler may decline by returning `false`, handing the key press to
      // the next-best binding — the escape hatch for "only if I can act on it".
      if (outcome === false) continue;
      if (binding.preventDefault !== false) event.preventDefault();
      if (binding.stopPropagation) event.stopPropagation();
      this.resetBuffer();
      return true;
    }

    if (hasLongerPrefix) {
      // Hold the chord: it is the start of something longer, e.g. `g` of `g i`.
      this.buffer = attempt;
      this.bufferExpiresAt = Date.now() + SEQUENCE_TIMEOUT_MS;
      this.pendingChords = attempt;
      event.preventDefault();
      this.emit();
      return true;
    }

    return false;
  }
}

function matchesPrefix(sequence: Sequence, prefix: Chord[]): boolean {
  if (prefix.length > sequence.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (sequence[i] !== prefix[i]) return false;
  }
  return true;
}

function endsWith(attempt: Chord[], sequence: Sequence): boolean {
  const offset = attempt.length - sequence.length;
  if (offset < 0) return false;
  for (let i = 0; i < sequence.length; i += 1) {
    if (attempt[offset + i] !== sequence[i]) return false;
  }
  return true;
}

function allowsRepeat(binding: Binding, sequence: Sequence): boolean {
  if (binding.allowRepeat !== undefined) return binding.allowRepeat;
  // Multi-chord sequences must never auto-repeat.
  if (sequence.length > 1) return false;
  return REPEATABLE_BY_DEFAULT.has(sequence[0]);
}

/**
 * The application-wide engine. A singleton so that modules outside React —
 * services, the command bus — can bind keys, and so Fast Refresh preserves
 * registrations across reloads.
 */
export const keyboardEngine = new KeyboardEngine();

export { sequenceToString };
