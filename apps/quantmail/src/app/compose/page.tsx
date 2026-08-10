'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { EmailComposer } from '../../components/EmailComposer';
import type { ComposerMessageData } from '../../components/EmailComposer';
import { apiClient } from '../../services/api-client';

export default function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const replyTo = searchParams?.get('replyTo') ?? null;
  const forwardId = searchParams?.get('forward') ?? null;
  const draftId = searchParams?.get('draftId') ?? null;
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId);

  const [draftData, setDraftData] = useState<{
    to?: Array<{ email: string }>;
    subject?: string;
    body?: string;
  } | null>(null);
  const [draftLoading, setDraftLoading] = useState(Boolean(draftId));

  useEffect(() => {
    if (!draftId) return;
    let active = true;
    setDraftLoading(true);
    apiClient
      .getEmail(draftId)
      .then((response) => {
        if (!active) return;
        if (response.success && response.data) {
          const storedDraft = response.data as typeof response.data & {
            toAddresses?: string[];
            bodyPlain?: string;
          };
          setDraftData({
            to: storedDraft.to ?? storedDraft.toAddresses?.map((email) => ({ email })),
            subject: storedDraft.subject ?? '',
            body: storedDraft.bodyText ?? storedDraft.bodyPlain ?? storedDraft.snippet ?? '',
          });
        }
        setDraftLoading(false);
      })
      .catch(() => {
        if (active) setDraftLoading(false);
      });
    return () => {
      active = false;
    };
  }, [draftId]);

  const composeDraft = useCallback(
    async (data: ComposerMessageData) => {
      const payload = {
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
        priority: data.priority,
        scheduledAt: data.scheduledAt,
        inReplyTo: replyTo || undefined,
        isDraft: true,
      };
      const response = currentDraftId
        ? await apiClient.updateDraft(currentDraftId, payload)
        : await apiClient.composeEmail(payload);

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Draft could not be saved.');
      }

      if (!currentDraftId) setCurrentDraftId(response.data.id);
      return response.data;
    },
    [currentDraftId, replyTo],
  );

  const handleSend = useCallback(
    async (data: ComposerMessageData) => {
      const draft = await composeDraft(data);

      // Scheduling currently persists an explicitly scheduled draft only.
      if (data.scheduledAt) return;

      const response = await apiClient.sendEmail(draft.id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Message could not be sent.');
      }

      router.push('/');
    },
    [composeDraft, router],
  );

  const handleSaveDraft = useCallback(
    async (data: ComposerMessageData) => {
      await composeDraft(data);
    },
    [composeDraft],
  );

  const handleDiscard = useCallback(() => {
    router.push('/');
  }, [router]);

  const handleAIAssist = useCallback(
    async (action: 'compose' | 'improve' | 'shorten' | 'formalize', text: string) => {
      const response = await apiClient.aiCompose({
        instructions: `${action}: ${text}`,
        tone: action === 'formalize' ? 'formal' : 'professional',
        length: action === 'shorten' ? 'short' : 'medium',
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'AI writing assistance is unavailable.');
      }

      return response.data?.body || text;
    },
    [],
  );

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      aria-label="Compose a QuantMail message"
    >
      <PageTransition className="compose-page">
        {draftLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[var(--quant-muted-foreground)]">Loading draft…</p>
          </div>
        ) : (
          <EmailComposer
            initialTo={draftData?.to}
            initialSubject={
              draftData?.subject ?? (forwardId ? 'Fwd: ' : replyTo ? 'Re: ' : undefined)
            }
            initialBody={draftData?.body}
            inReplyTo={replyTo || undefined}
            onSend={handleSend}
            onSaveDraft={handleSaveDraft}
            onDiscard={handleDiscard}
            onAIAssist={handleAIAssist}
          />
        )}
      </PageTransition>
    </AppShell>
  );
}
