/**
 * Engine Integration Wiring — model, inventory and DoD evaluator.
 *
 * Standalone barrel for the wiring sub-system. It is intentionally kept out of the
 * server-core runtime barrel (`src/index.ts`) so the filesystem-scanning DoD
 * evaluator never ends up in an app's runtime bundle.
 */
export * from './types';
export * from './inventory';
export * from './dod-evaluator';
