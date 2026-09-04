'use client';

import { QuantSidekickProvider, ThemeProvider } from '@quant/shared-ui';

/**
 * Global, non-keyboard providers.
 *
 * This file used to carry a second, unreachable command palette: a 156-line
 * `CommandPaletteItem[]` array, its own `⌘K` document listener writing to state
 * nothing rendered, and a "show shortcuts" entry that dispatched a synthetic
 * `KeyboardEvent` at the document to reach the help sheet. The live palette is
 * `components/CommandPalette`, generated from the command registry, so all of
 * that has gone. Key handling belongs to `KeyboardProvider`.
 *
 * It also mounted two floating widgets, and both are gone for the same reason:
 * something else already does the job, properly.
 *
 * `<MailCopilot />` was Quanty's bottom-right dock. Its only way in was the
 * `.mail-copilot-trigger` pill, and `overrides.css` hides that with
 * `display: none !important` — so every authenticated route paid for 525 lines,
 * a 40px `<Quanty>` canvas and a chat transport behind a control that neither a
 * pointer nor the Tab key could reach, while a screen reader was still told
 * there was a "Quanty — QuantAI mail copilot" region with nothing usable inside
 * it. `AppShell` owns the real launcher now (`QuantyLauncher`), in the header of
 * every shell route. `MailCopilot.tsx` stays on disk; reviving the dock would
 * need the `QuantSidekickProvider` below, which is why that provider stays even
 * though nothing consumes it today.
 *
 * `<ContextFab />` was a `return null` stub whose comment described a
 * contextual bottom-right `+`: compose on mail surfaces, a new event on the
 * calendar, hidden everywhere else. `AppShell`'s `QuantFab` had already shipped
 * exactly that, opt-out table included, so the stub was describing finished
 * work.
 *
 * With both gone the auth gate went with them. `showTools` existed only to keep
 * the copilot off `/login`, and reading `useAuth()` this high re-rendered the
 * whole provider tree on every auth transition to decide whether to render
 * nothing.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark">
      <QuantSidekickProvider>{children}</QuantSidekickProvider>
    </ThemeProvider>
  );
}
