'use client';

// ============================================================================
// QuantChat - Broadcast Channels (Telegram-style one-to-many)
// ============================================================================
//
// Real identity + real backend: the caller's owned/subscribed channels, a
// per-channel feed, subscribe/unsubscribe, and an admin-only publish composer.
// Posting is gated SERVER-SIDE (OWNER/ADMIN -> 403 CHANNEL_POST_FORBIDDEN for a
// subscriber); the client composer is hidden when `canPost` is false purely as
// UX — the backend stays authoritative. There is no public channel directory
// endpoint, so discovery is honest: your channels + create + join-by-ID (no
// fabricated "explore" list).

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppShell,
  TopBar,
  BottomNav,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@quant/shared-ui';
import { navItems, routes } from '../../lib/navigation';
import {
  useChannels,
  useChannelFeed,
  useCreateChannel,
  useSubscribeChannel,
  useUnsubscribeChannel,
  usePublishToChannel,
} from '../../hooks/useChannels';
import type { SubscribedChannelView } from '../../types';

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChannelsPage() {
  const router = useRouter();
  const { channels, isLoading, error, refetch } = useChannels();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo<SubscribedChannelView | null>(
    () => channels.find((c) => c.id === selectedId) ?? null,
    [channels, selectedId],
  );

  if (isLoading) return <LoadingState variant="skeleton" text="Loading channels..." />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  return (
    <AppShell topBar={<TopBar title={selected ? (selected.name ?? 'Channel') : 'Channels'} />}>
      <div className="flex h-full flex-col overflow-y-auto pb-20">
        {selected ? (
          <ChannelDetail
            channel={selected}
            onBack={() => setSelectedId(null)}
            onChanged={() => void refetch()}
          />
        ) : (
          <ChannelList
            channels={channels}
            onOpen={(id) => setSelectedId(id)}
            onChanged={() => void refetch()}
          />
        )}
      </div>
      <BottomNav
        items={navItems}
        activeId="profile"
        onChange={(id) => {
          const route = routes[id];
          if (route) router.push(route);
        }}
      />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------

function ChannelList({
  channels,
  onOpen,
  onChanged,
}: {
  channels: SubscribedChannelView[];
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const createChannel = useCreateChannel();
  const subscribe = useSubscribeChannel();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [joinId, setJoinId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    setFormError(null);
    if (name.trim().length === 0) {
      setFormError('Enter a channel name');
      return;
    }
    try {
      await createChannel.mutateAsync({ name: name.trim(), description: description.trim() });
      setName('');
      setDescription('');
      onChanged();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create channel');
    }
  }, [name, description, createChannel, onChanged]);

  const handleJoin = useCallback(async () => {
    setFormError(null);
    if (joinId.trim().length === 0) {
      setFormError('Enter a channel ID to join');
      return;
    }
    try {
      await subscribe.mutateAsync(joinId.trim());
      setJoinId('');
      onChanged();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to join channel');
    }
  }, [joinId, subscribe, onChanged]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-4">
      <section className="space-y-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-muted)]/30 p-4">
        <h3 className="text-sm font-semibold text-[var(--quant-foreground)]">Create a channel</h3>
        {formError && (
          <div role="alert" className="text-sm text-red-500">
            {formError}
          </div>
        )}
        <input
          aria-label="Channel name"
          placeholder="Channel name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-[var(--quant-foreground)]"
        />
        <input
          aria-label="Channel description"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-[var(--quant-foreground)]"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={createChannel.isPending}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {createChannel.isPending ? 'Creating…' : 'Create channel'}
        </button>
      </section>

      <section className="flex items-end gap-2 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-muted)]/30 p-4">
        <div className="flex-1">
          <label htmlFor="joinId" className="mb-1 block text-sm font-semibold">
            Join by channel ID
          </label>
          <input
            id="joinId"
            placeholder="Channel ID"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-[var(--quant-foreground)]"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleJoin()}
          disabled={subscribe.isPending}
          className="rounded-lg border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-600 disabled:opacity-60"
        >
          {subscribe.isPending ? 'Joining…' : 'Join'}
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
          Your channels
        </h3>
        {channels.length === 0 ? (
          <EmptyState
            title="No channels yet"
            description="Create a channel or join one with its ID to get started"
          />
        ) : (
          <ul className="space-y-2">
            {channels.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--quant-border)] bg-[var(--quant-background)] p-3 text-left transition hover:bg-[var(--quant-muted)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--quant-foreground)]">
                      {c.name ?? 'Untitled channel'}
                    </span>
                    <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
                      {c.subscriberCount} subscriber{c.subscriberCount === 1 ? '' : 's'} ·{' '}
                      {c.role.toLowerCase()}
                    </span>
                  </span>
                  {c.canPost && (
                    <span className="ml-2 flex-shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                      admin
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChannelDetail({
  channel,
  onBack,
  onChanged,
}: {
  channel: SubscribedChannelView;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { messages, isLoading, error, refetch } = useChannelFeed(channel.id);
  const unsubscribe = useUnsubscribeChannel();
  const publish = usePublishToChannel(channel.id);
  const [draft, setDraft] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);

  const handleUnsubscribe = useCallback(async () => {
    try {
      await unsubscribe.mutateAsync(channel.id);
      onBack();
      onChanged();
    } catch {
      // React Query surfaces the error; the list refetch keeps state honest.
    }
  }, [unsubscribe, channel.id, onBack, onChanged]);

  const handlePublish = useCallback(async () => {
    setPublishError(null);
    if (draft.trim().length === 0) return;
    try {
      await publish.mutateAsync(draft.trim());
      setDraft('');
      void refetch();
    } catch (e) {
      // Surfaces the backend's authoritative 403 for read-only subscribers.
      setPublishError(e instanceof Error ? e.message : 'Failed to publish');
    }
  }, [draft, publish, refetch]);

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
        >
          ← All channels
        </button>
        <button
          type="button"
          onClick={() => void handleUnsubscribe()}
          disabled={unsubscribe.isPending || channel.role === 'OWNER'}
          title={channel.role === 'OWNER' ? 'Owners cannot unsubscribe' : undefined}
          className="rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-semibold text-[var(--quant-foreground)] disabled:opacity-50"
        >
          {unsubscribe.isPending ? 'Leaving…' : 'Unsubscribe'}
        </button>
      </div>

      {channel.description && (
        <p className="mb-3 text-sm text-[var(--quant-muted-foreground)]">{channel.description}</p>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto">
        {isLoading ? (
          <LoadingState variant="skeleton" text="Loading feed..." />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        ) : messages.length === 0 ? (
          <EmptyState title="No posts yet" description="Broadcasts will appear here" />
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-background)] p-3"
            >
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--quant-foreground)]">
                {m.content}
              </p>
              <span className="mt-1 block text-[10px] text-[var(--quant-muted-foreground)]">
                {formatTime(String(m.createdAt))}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Admin-only composer. Hidden for read-only subscribers (UX); the backend
          403 stays authoritative regardless of this client gate. */}
      {channel.canPost ? (
        <div className="mt-3 space-y-2 border-t border-[var(--quant-border)] pt-3">
          {publishError && (
            <div role="alert" className="text-sm text-red-500">
              {publishError}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              aria-label="Broadcast message"
              placeholder="Broadcast to subscribers…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="flex-1 resize-none rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-sm text-[var(--quant-foreground)]"
            />
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={publish.isPending || draft.trim().length === 0}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {publish.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-[var(--quant-border)] pt-3 text-center text-xs text-[var(--quant-muted-foreground)]">
          This is a read-only channel. Only admins can post.
        </p>
      )}
    </div>
  );
}
