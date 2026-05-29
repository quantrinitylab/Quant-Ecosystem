'use client';

import { AIChat, AnimatedPage, AppShell, Sidebar } from '@quant/shared-ui';
import { LoadingState, ErrorState } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { useAIChat } from '../hooks/useAIChat';

const sidebarItems: SidebarItem[] = [
  { id: 'chat', label: 'Chat', icon: <span>&#128172;</span>, active: true },
  { id: 'voice', label: 'Voice', icon: <span>&#127908;</span>, href: '/voice' },
  { id: 'history', label: 'History', icon: <span>&#128339;</span> },
  { id: 'settings', label: 'Settings', icon: <span>&#9881;</span> },
];

export default function AIPage() {
  const { messages, isLoading, error, sendMessage, isStreaming } = useAIChat();

  if (isLoading) return <LoadingState variant="skeleton" text="Loading AI assistant..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  const chatMessages = messages.map((msg) => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    timestamp: msg.timestamp,
  }));

  return (
    <AppShell
      sidebar={
        <Sidebar items={sidebarItems} header={<h2 className="text-lg font-semibold">QuantAI</h2>} />
      }
    >
      <AnimatedPage>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-[var(--quant-border)]">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">AI Assistant</h1>
              <select
                className="text-sm px-3 py-1 rounded-md border border-[var(--quant-border)] bg-[var(--quant-background)]"
                aria-label="Select AI model"
              >
                <option value="gpt-4">GPT-4</option>
                <option value="claude-3">Claude 3</option>
                <option value="llama-3">Llama 3</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <AIChat
              messages={chatMessages}
              onSendMessage={(content) => {
                sendMessage(content);
              }}
            />
          </div>
        </div>
      </AnimatedPage>
    </AppShell>
  );
}
