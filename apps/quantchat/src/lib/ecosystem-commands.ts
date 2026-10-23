import type { CommandPaletteItem } from '@quant/shared-ui';
import type { CoreQuantAppId } from '@quant/shared-ui';

export interface EcosystemTarget {
  id: string;
  label: string;
  appId: CoreQuantAppId;
}

export const ECOSYSTEM_TARGETS: EcosystemTarget[] = [
  { id: 'open-mail', label: 'Open QuantMail', appId: 'quantmail' },
  { id: 'open-ai', label: 'Open QuantAI', appId: 'quantai' },
];

/**
 * Palette commands with REAL actions.
 *
 * QC-F-050: the previous entries were dead `() => {}` stubs — selecting one
 * only closed the palette. `search` / `settings` are deliberately absent here:
 * global message search is a separate finding (QC-F-073) and the `/settings`
 * route does not exist, so listing them would be a dead promise again.
 *
 * `navigate` = Next router.push (in-app route). `openApp` = cross-app jump
 * through UniversalSSOTokenBridge (SSO handoff, fail-closed).
 */
export function buildCommands(
  navigate: (path: string) => void,
  openApp: (appId: CoreQuantAppId) => void,
): CommandPaletteItem[] {
  return [
    {
      id: 'new-chat',
      label: 'New Chat',
      shortcut: 'N',
      action: () => navigate('/new-chat'),
    },
    ...ECOSYSTEM_TARGETS.map((t) => ({
      id: t.id,
      label: t.label,
      action: () => openApp(t.appId),
    })),
  ];
}
