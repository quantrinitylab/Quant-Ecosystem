'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { AppShell, TopBar, BottomNav, ChatList } from '@quant/shared-ui';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useConversations } from '../hooks/useConversations';
import { navItems, routes } from '../lib/navigation';
import { listContainerVariants, listItemVariants } from '../lib/motion-variants';

type PresenceStatus = 'online' | 'away' | 'offline';

interface EnhancedConversation {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  presence: PresenceStatus;
  isPinned: boolean;
  isArchived: boolean;
  avatarInitial: string;
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 30) return 'just now';
  if (diffMin < 1) return `${diffSec}s`;
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getPresenceForIndex(index: number): PresenceStatus {
  const statuses: PresenceStatus[] = ['online', 'online', 'away', 'offline', 'online', 'away'];
  return statuses[index % statuses.length];
}

function PresenceDot({ status }: { status: PresenceStatus }) {
  const colorClass =
    status === 'online' ? 'bg-emerald-500' : status === 'away' ? 'bg-yellow-400' : 'bg-gray-400';

  return (
    <span
      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[var(--quant-background)] ${colorClass}`}
      aria-label={`${status}`}
    />
  );
}

interface SwipeableChatItemProps {
  item: EnhancedConversation;
  onSelect: () => void;
  onArchive: () => void;
  onPin: () => void;
}

function SwipeableChatItem({ item, onSelect, onArchive, onPin }: SwipeableChatItemProps) {
  const x = useMotionValue(0);
  const archiveOpacity = useTransform(x, [-120, -60], [1, 0]);
  const pinOpacity = useTransform(x, [60, 120], [0, 1]);
  const [swiped, setSwiped] = useState<'archive' | 'pin' | null>(null);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number } }) => {
      if (info.offset.x < -100) {
        setSwiped('archive');
        onArchive();
      } else if (info.offset.x > 100) {
        setSwiped('pin');
        onPin();
      }
    },
    [onArchive, onPin],
  );

  if (swiped === 'archive') return null;

  return (
    <div className="relative overflow-hidden">
      {/* Archive background (left swipe) */}
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-end px-6 bg-orange-500/20"
        style={{ opacity: archiveOpacity }}
      >
        <span className="text-sm font-medium text-orange-500">Archive</span>
      </motion.div>
      {/* Pin background (right swipe) */}
      <motion.div
        className="absolute inset-y-0 left-0 flex items-center px-6 bg-emerald-500/20"
        style={{ opacity: pinOpacity }}
      >
        <span className="text-sm font-medium text-emerald-500">Pin</span>
      </motion.div>

      <motion.div
        className={`relative z-10 flex items-center gap-3 p-3 rounded-xl cursor-pointer min-h-touch transition-colors ${
          item.isPinned
            ? 'bg-emerald-500/5 border border-emerald-500/20'
            : 'hover:bg-[var(--quant-muted)]'
        }`}
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -140, right: 140 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        onClick={onSelect}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', ...spring.snappy }}
      >
        {/* Avatar with presence */}
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white font-bold">
            {item.avatarInitial}
          </div>
          <PresenceDot status={item.presence} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--quant-foreground)] truncate">
              {item.name}
            </span>
            <span className="text-xs text-[var(--quant-muted-foreground)] flex-shrink-0 ml-2">
              {item.timestamp}
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-xs text-[var(--quant-muted-foreground)] truncate">
              {item.lastMessage}
            </span>
            {item.unreadCount > 0 && (
              <span className="flex-shrink-0 ml-2 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold px-1.5">
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Pin indicator */}
        {item.isPinned && (
          <span className="text-emerald-500 text-xs flex-shrink-0" aria-label="Pinned">
            &#128204;
          </span>
        )}
      </motion.div>
    </div>
  );
}

export default function ChatListPage() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useConversations();
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

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

  const enhancedItems: EnhancedConversation[] = conversations
    .map((conv, idx: number) => ({
      id: conv.id,
      name: conv.name || 'Chat',
      lastMessage: conv.lastMessage?.content || 'Tap to start chatting',
      timestamp: formatRelativeTime(
        conv.lastActivityAt
          ? conv.lastActivityAt instanceof Date
            ? conv.lastActivityAt.toISOString()
            : String(conv.lastActivityAt)
          : '',
      ),
      unreadCount: conv.unreadCount || 0,
      presence: getPresenceForIndex(idx),
      isPinned: pinnedIds.has(conv.id),
      isArchived: archivedIds.has(conv.id),
      avatarInitial: (conv.name || 'C').charAt(0).toUpperCase(),
    }))
    .filter((item) => !item.isArchived)
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });

  return (
    <AppShell topBar={<TopBar title="QuantChat" />}>
      <motion.div
        className="flex flex-col h-full pb-16 overflow-y-auto"
        variants={listContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="px-3 py-2 space-y-1">
          <AnimatePresence>
            {enhancedItems.map((item) => (
              <motion.div
                key={item.id}
                variants={listItemVariants}
                layout
                exit={{ opacity: 0, x: -200 }}
                transition={{ type: 'spring', ...spring.gentle }}
              >
                <SwipeableChatItem
                  item={item}
                  onSelect={() => router.push(`/chat/${item.id}`)}
                  onArchive={() => setArchivedIds((prev) => new Set([...prev, item.id]))}
                  onPin={() =>
                    setPinnedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) {
                        next.delete(item.id);
                      } else {
                        next.add(item.id);
                      }
                      return next;
                    })
                  }
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
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
