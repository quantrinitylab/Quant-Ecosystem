/**
 * Public surface of the keyboard system.
 *
 * Import from here rather than reaching into the individual modules, so the
 * split between chord parsing, the engine, the registry and the React bindings
 * stays an implementation detail.
 */

export {
  chordToLabelParts,
  formatBinding,
  isApplePlatform,
  parseChord,
  parseSequence,
  sequenceToString,
  setApplePlatformOverride,
  type Chord,
  type Sequence,
} from './chords';

export {
  KeyboardEngine,
  keyboardEngine,
  type Binding,
  type BindingOptions,
  type ShortcutHandler,
} from './engine';

export {
  COMMAND_GROUPS,
  getCommand,
  getCommands,
  getVisibleCommands,
  registerCommands,
  runCommand,
  subscribeToCommands,
  type Command,
  type CommandGroup,
} from './command-registry';

export {
  useCommandList,
  useKeyboardScope,
  usePendingChords,
  useRegisterCommands,
  useShortcut,
  useShortcutOverrides,
  useVisibleCommands,
  type UseKeyboardScopeOptions,
  type UseShortcutOptions,
  type UseShortcutOverrides,
} from './hooks';

export {
  SHORTCUT_OVERRIDES_STORAGE_KEY,
  bindingStringFromKeyboardEvent,
  canonicalBindingString,
  clearAllShortcutOverrides,
  clearShortcutOverride,
  findShortcutConflicts,
  getShortcutOverride,
  getShortcutOverrides,
  getShortcutOverridesVersion,
  reloadShortcutOverrides,
  resolveShortcutKeys,
  setShortcutOverride,
  subscribeToShortcutOverrides,
  validateBindingStrings,
  type ConflictRow,
  type ResolvedShortcutKeys,
  type ShortcutKeyState,
  type ShortcutOverride,
  type ShortcutOverrides,
} from './shortcut-overrides';
