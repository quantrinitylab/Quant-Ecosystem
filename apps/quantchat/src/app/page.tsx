'use client';

import { useRouter } from 'next/navigation';
import { AppShell, TopBar, BottomNav, ChatList } from '@quant/shared-ui';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useConversations } from '../hooks/useConversations';
import { navItems, routes } from '../lib/navigation';

export default function ChatListPage() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useConversations();

  if (isLoading) return <LoadingState variant="skeleton" text="Loading conversations..." />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  const conversations = data ?? [];

  if (conversations.length === 0)
    return (
      <AppShell topBar={<TopBar title="QuantChat" />}>
        <EmptyState title="No conversations" description="Start a new chat to get connected" />
        <BottomNav
          items={navItems}
          activeId="chats"
          onChange={(id) => {
            const route = routes[id];
            if (route) router.push(route);
          }}
        />
      </AppShell>
    );

  const chatItems = conversations.map((conv) => ({
    id: conv.id,
    name: conv.name || 'Chat',
    lastMessage: conv.lastMessage?.content || '',
    timestamp: conv.lastActivityAt ? new Date(conv.lastActivityAt).toLocaleString() : '',
    unreadCount: conv.unreadCount || 0,
  }));

  return (
    <AppShell topBar={<TopBar title="QuantChat" />}>
      <div className="flex flex-col h-full pb-16">
        <ChatList
          items={chatItems}
          onSelect={(id) => {
            router.push(`/chat/${id}`);
          }}
        />
      </div>
      <BottomNav
        items={navItems}
        activeId="chats"
        onChange={(id) => {
          const route = routes[id];
          if (route) router.push(route);
        }}
      />
    </AppShell>
  );
}
