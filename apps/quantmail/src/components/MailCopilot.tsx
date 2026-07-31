'use client';

import { useRouter } from 'next/navigation';
import { useQuantSidekick } from '@quant/shared-ui';
import { quantAiBrandLockup } from '../brand/identity';
import { QuantrinityMark } from './QuantrinityMark';

const STATUS_COPY = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Responding',
  acting: 'Working',
} as const;

const STATUS_DETAIL_COPY = {
  idle: 'Use a focused next step here, or open commands for the full workspace.',
  listening: 'Describe the task in plain language and QuantAI will turn it into the next move.',
  thinking: 'Reviewing workspace context and preparing the clearest next action.',
  speaking: 'Sharing the next recommendation for your current flow.',
  acting: 'Carrying out the action you chose inside QuantMail.',
} as const;

/** QuantMail-specific presentation for the shared QuantAI sidekick state. */
export function MailCopilot() {
  const router = useRouter();
  const { status, message, suggestions, isOpen, toggle, close } = useQuantSidekick();

  const quickActions = [
    {
      id: 'compose',
      label: 'Draft a clear message',
      badge: 'Open',
      action: () => router.push('/compose'),
    },
    {
      id: 'search',
      label: 'Find anything in mail',
      badge: 'Open',
      action: () => router.push('/search'),
    },
    {
      id: 'focus',
      label: 'Review priority inbox',
      badge: 'Open',
      action: () => router.push('/'),
    },
  ];

  const hasSuggestions = suggestions.length > 0;
  const actionItems = hasSuggestions
    ? suggestions.map((item) => ({
        id: item.id,
        label: item.label,
        badge: 'AI',
        action: item.onSelect,
      }))
    : quickActions;

  return (
    <aside
      className={`mail-copilot is-${status}`}
      data-state={status}
      aria-label="QuantAI mail copilot"
    >
      {isOpen && (
        <section className="mail-copilot-panel" role="dialog" aria-label="Ask QuantAI">
          <header>
            <div className="mail-copilot-lockup">
              <QuantrinityMark compact label={quantAiBrandLockup.accessibleName} />
              <div>
                <strong>{quantAiBrandLockup.productName}</strong>
                <span>
                  <i /> {STATUS_COPY[status]}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="mail-copilot-close"
              onClick={close}
              aria-label="Close QuantAI"
            >
              ×
            </button>
          </header>

          <div className="mail-copilot-body">
            <p className="mail-copilot-eyebrow">Signal copilot</p>
            <h2>{message ?? 'What should we move forward?'}</h2>
            <p className="mail-copilot-description">{STATUS_DETAIL_COPY[status]}</p>
          </div>

          <div className="mail-copilot-actions" aria-label="QuantAI actions">
            <div className="mail-copilot-actions-heading">
              {hasSuggestions ? 'Suggested next steps' : 'Common actions'}
            </div>
            {actionItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.action();
                  close();
                }}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">{item.badge}</span>
              </button>
            ))}
          </div>

          <footer>
            <span>{hasSuggestions ? 'Workspace-aware suggestions' : 'On-screen navigation actions'}</span>
            <span>Choose an action above</span>
          </footer>
        </section>
      )}

      <button
        type="button"
        className="mail-copilot-trigger"
        onClick={toggle}
        aria-label={isOpen ? 'Close QuantAI mail copilot' : 'Open QuantAI mail copilot'}
        aria-expanded={isOpen}
      >
        <QuantrinityMark compact label={quantAiBrandLockup.productName} />
        <span>
          <strong>Ask {quantAiBrandLockup.productName}</strong>
          <small>{STATUS_COPY[status]}</small>
        </span>
        <i className="mail-copilot-signal" aria-hidden="true" />
      </button>
    </aside>
  );
}
