'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlienAvatar, Badge, Button, Card, useQuantSidekick } from '@quant/shared-ui';
import { ownerFetch } from '../../lib/api';

interface Brief {
  generatedAt: string;
  headline: string;
  observations: { id: string; severity: 'info' | 'warn' | 'critical'; text: string }[];
  suggestedActions: { id: string; label: string; href: string }[];
}

const SEV_BADGE: Record<Brief['observations'][number]['severity'], 'info' | 'warning' | 'danger'> =
  {
    info: 'info',
    warn: 'warning',
    critical: 'danger',
  };

export default function OwnerAiPage() {
  const sidekick = useQuantSidekick();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBrief = useCallback(async () => {
    return sidekick.runTask(
      async () => {
        const res = await ownerFetch<{ data: Brief }>('/api/ai/brief');
        setBrief(res.data);
        setError(null);
        return res.data;
      },
      { speakOnDone: 'Daily brief ready. I summarized the ecosystem and flagged what needs you.' },
    );
  }, [sidekick]);

  useEffect(() => {
    loadBrief().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load brief'));
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">Owner QuantAI</h1>
        <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
          Your personal QuantAI — it monitors every app and user, surfaces a daily brief, and can
          act across the ecosystem. The alien below reflects its live state; it is the same presence
          that appears in every Quant app.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-600">{error}</p>
        </div>
      )}

      <Card padding="none">
        <div className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center">
            <AlienAvatar state={sidekick.status} size={88} />
            <Badge variant="info" size="sm" className="mt-2">
              {sidekick.status}
            </Badge>
          </div>
          <div className="flex-1">
            <p className="text-sm text-[var(--quant-muted-foreground)]">
              Drive the assistant to preview each motion state used across the ecosystem:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => sidekick.setStatus('listening')}>
                Listening
              </Button>
              <Button size="sm" variant="ghost" onClick={() => sidekick.setStatus('thinking')}>
                Thinking
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  sidekick.say('Working across QuantTube, QuantSync and QuantEdit now.', 'acting')
                }
              >
                Acting
              </Button>
              <Button size="sm" variant="primary" onClick={() => void loadBrief()}>
                Refresh brief
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="border-b border-[var(--quant-border)] px-5 py-4">
          <h2 className="font-semibold text-[var(--quant-foreground)]">
            {brief?.headline ?? 'Synthesizing daily brief…'}
          </h2>
          {brief && (
            <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
              Generated {new Date(brief.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="space-y-3 p-5">
          {brief?.observations.map((o) => (
            <div key={o.id} className="flex items-start gap-3">
              <Badge variant={SEV_BADGE[o.severity]} size="sm">
                {o.severity}
              </Badge>
              <p className="text-sm text-[var(--quant-foreground)]">{o.text}</p>
            </div>
          ))}
          {brief && brief.suggestedActions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {brief.suggestedActions.map((a) => (
                <a
                  key={a.id}
                  href={a.href}
                  className="rounded-lg bg-[var(--brand-app-color)]/10 px-3 py-1.5 text-sm font-medium text-[var(--brand-app-color)] hover:bg-[var(--brand-app-color)]/20"
                >
                  {a.label} →
                </a>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
