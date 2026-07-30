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

/** QuantMail-specific presentation for the shared QuantAI sidekick state. */
export function MailCopilot() {
  const router = useRouter();
  const { status, message, suggestions, isOpen, toggle, close } = useQuantSidekick();

  const quickActions = [
    {
      id: 'compose',
      label: 'Draft a clear message',
      hint: 'C',
      action: () => router.push('/compose'),
    },
    {
      id: 'search',
      label: 'Find anything in mail',
      hint: '/',
      action: () => router.push('/search'),
    },
    { id: 'focus', label: 'Review priority inbox', hint: 'I', action: () => router.push('/') },
  ];

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
            <p className="mail-copilot-description">
              Compose, retrieve and prioritize without leaving your mail flow.
            </p>
          </div>

          <div className="mail-copilot-actions">
            {(suggestions.length > 0
              ? suggestions.map((item) => ({
                  id: item.id,
                  label: item.label,
                  hint: 'AI',
                  action: item.onSelect,
                }))
              : quickActions
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.action();
                  close();
                }}
              >
                <span>{item.label}</span>
                <kbd>{item.hint}</kbd>
              </button>
            ))}
          </div>

          <footer>
            <span>Private workspace context</span>
            <span>⌘ K for commands</span>
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
