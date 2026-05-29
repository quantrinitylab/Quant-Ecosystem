'use client';

import { useState } from 'react';
import { AIChat, AnimatedPage, AppShell, Sidebar } from '@quant/shared-ui';
import { LoadingState, ErrorState } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { useAIChat } from '../hooks/useAIChat';
import { useModelSelector } from '../hooks/useModelSelector';
import { ModelSelector } from '../components/ModelSelector';
import { VoiceToggle } from '../components/VoiceToggle';
import { AgenticMessage } from '../components/AgenticMessage';

export default function AIPage() {
  const { models, currentModel, switchModel } = useModelSelector();
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    isStreaming,
    conversations,
    activeConversation,
    createConversation,
    selectConversation,
    currentModel: hookModel,
    switchModel: hookSwitchModel,
  } = useAIChat({ defaultModel: currentModel.id });

  const [voiceActive, setVoiceActive] = useState(false);

  const handleModelSwitch = (modelId: string) => {
    switchModel(modelId);
    hookSwitchModel(modelId);
  };

  const conversationItems: SidebarItem[] = conversations.map((conv) => ({
    id: conv.id,
    label: conv.title || 'New Chat',
    icon: <span>💬</span>,
    active: activeConversation?.id === conv.id,
    onClick: () => selectConversation(conv.id),
  }));

  const sidebarItems: SidebarItem[] = [
    { id: 'new-chat', label: 'New Chat', icon: <span>➕</span>, onClick: createConversation },
    ...conversationItems,
    { id: 'divider', label: '---', icon: <span /> },
    { id: 'ask', label: 'Ask Quant', icon: <span>🚀</span>, href: '/ask' },
    { id: 'settings', label: 'Settings', icon: <span>⚙️</span> },
  ];

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
        <Sidebar
          items={sidebarItems}
          header={<h2 className="text-lg font-semibold">QuantAI</h2>}
          footer={
            <div className="px-3 py-2 text-xs text-[var(--quant-text-secondary)]">
              Model: {currentModel.icon} {currentModel.name}
            </div>
          }
        />
      }
    >
      <AnimatedPage>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-[var(--quant-border)]">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">AI Assistant</h1>
              <ModelSelector
                currentModel={currentModel}
                models={models}
                onSelect={handleModelSwitch}
              />
              <div className="ml-auto">
                <VoiceToggle isActive={voiceActive} onToggle={() => setVoiceActive(!voiceActive)} />
              </div>
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
          {/* TODO: Render agentic messages inline within the chat stream once
              AIChat supports custom render slots. Currently rendered in a separate
              panel because AIChat only accepts {role, content} messages. */}
          {messages.some((m) => m.toolCalls && m.toolCalls.length > 0) && (
            <div className="p-4 space-y-3 border-t border-[var(--quant-border)] overflow-y-auto max-h-60">
              {messages
                .filter((m) => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0)
                .map((m) => (
                  <AgenticMessage
                    key={m.id}
                    content={m.content}
                    toolCalls={m.toolCalls || []}
                    reasoning={m.reasoning}
                  />
                ))}
            </div>
          )}
        </div>
      </AnimatedPage>
    </AppShell>
  );
}
