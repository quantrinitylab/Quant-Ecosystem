'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { AIChat, AnimatedPage, AppShell, Sidebar } from '@quant/shared-ui';
import { ErrorState } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { useAIChat } from '../hooks/useAIChat';
import { useModelSelector } from '../hooks/useModelSelector';
import { ModelSelector } from '../components/ModelSelector';
import { VoiceToggle } from '../components/VoiceToggle';
import { AgenticMessage } from '../components/AgenticMessage';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, x: -12 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', ...spring.snappy },
  },
};

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

  if (isLoading) {
    return (
      <AppShell
        sidebar={<Sidebar items={[]} header={<h2 className="text-lg font-semibold">QuantAI</h2>} />}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-[var(--quant-border)]">
            <LoadingSkeleton variant="model-card" count={1} />
          </div>
          <div className="flex-1">
            <LoadingSkeleton variant="chat-message" count={3} />
          </div>
        </div>
      </AppShell>
    );
  }

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
            <div className="px-3 py-2 text-xs text-[var(--foreground-secondary)]">
              Model: {currentModel.icon} {currentModel.name}
            </div>
          }
        />
      }
    >
      <AnimatedPage>
        <motion.div
          className="flex flex-col h-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', ...spring.gentle }}
        >
          {/* Header */}
          <div className="p-4 border-b border-[var(--quant-border)]">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-[var(--foreground)]">AI Assistant</h1>
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

          {/* Chat area */}
          <div className="flex-1 overflow-hidden">
            <AIChat
              messages={chatMessages}
              onSendMessage={(content) => {
                sendMessage(content);
              }}
            />
          </div>

          {/* Agentic messages panel */}
          <AnimatePresence>
            {messages.some((m) => m.toolCalls && m.toolCalls.length > 0) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', ...spring.snappy }}
                className="border-t border-[var(--quant-border)] overflow-hidden"
              >
                <motion.div
                  className="p-4 space-y-3 overflow-y-auto max-h-60"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                >
                  {messages
                    .filter((m) => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0)
                    .map((m) => (
                      <motion.div key={m.id} variants={staggerItem}>
                        <AgenticMessage
                          content={m.content}
                          toolCalls={m.toolCalls || []}
                          reasoning={m.reasoning}
                        />
                      </motion.div>
                    ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatedPage>
    </AppShell>
  );
}
