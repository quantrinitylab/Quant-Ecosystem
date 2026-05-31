'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { EmailComposer } from '../../components/EmailComposer';
import { apiClient } from '../../services/api-client';

export default function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const replyTo = searchParams?.get('replyTo') ?? null;
  const forwardId = searchParams?.get('forward') ?? null;

  const handleSend = useCallback(
    async (data: {
      to: { email: string; name?: string }[];
      cc: { email: string; name?: string }[];
      bcc: { email: string; name?: string }[];
      subject: string;
      bodyText: string;
      bodyHtml: string;
      priority: 'high' | 'normal' | 'low';
    }) => {
      const response = await apiClient.composeEmail({
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
        priority: data.priority,
        inReplyTo: replyTo || undefined,
      });
      if (!response.success) throw new Error(response.error?.message || 'Failed to compose');
      const emailId = response.data!.id;
      const sendResponse = await apiClient.sendEmail(emailId);
      if (!sendResponse.success) throw new Error(sendResponse.error?.message || 'Failed to send');
      router.push('/');
    },
    [replyTo, router],
  );

  const handleSaveDraft = useCallback(() => {
    // Draft saving handled by triggering compose with isDraft
    // For UX, show feedback
  }, []);

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
      if (!response.success) return text;
      return response.data?.body || text;
    },
    [],
  );

  const handleAttach = useCallback((file: { name: string; size: number; type: string }) => {
    // File upload not wired to backend yet
    console.log('Attachment selected:', file.name);
  }, []);

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full">
        <EmailComposer
          initialSubject={forwardId ? 'Fwd: ' : replyTo ? 'Re: ' : undefined}
          inReplyTo={replyTo || undefined}
          onSend={handleSend}
          onSaveDraft={handleSaveDraft}
          onDiscard={handleDiscard}
          onAIAssist={handleAIAssist}
          onAttach={handleAttach}
        />
      </PageTransition>
    </AppShell>
  );
}
