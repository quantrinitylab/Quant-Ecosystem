'use client';

import { useState, use, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { Button, LoadingState, ErrorState } from '@quant/shared-ui';
import { useDocument, useYjsDoc } from '../../../hooks/useDocument';
import { DocToolbar } from '../../../components/DocToolbar';
import { DocEditor } from '../../../components/DocEditor';
import { PresenceBar } from '../../../components/PresenceBar';
import { CommentsPanel } from '../../../components/CommentsPanel';
import { VersionHistory } from '../../../components/VersionHistory';
import { AISidebar } from '../../../components/AISidebar';
import { ShareDialog } from '../../../components/ShareDialog';

type PanelType = 'comments' | 'history' | 'ai' | null;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DocEditorPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: document, isLoading, error, refetch } = useDocument(id);
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const currentUser = useMemo(
    () => ({
      id: 'current-user',
      name: 'You',
      color: '#14B8A6',
    }),
    [],
  );

  const { doc: yDoc, connected, synced, awareness } = useYjsDoc(id, currentUser);

  const togglePanel = (panel: PanelType) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  const viewers = useMemo(() => {
    return Array.from(awareness.values()).map((user) => ({
      id: user.id,
      name: user.name,
      color: user.color,
    }));
  }, [awareness]);

  const remoteCursors = useMemo(() => {
    return Array.from(awareness.values())
      .filter((user) => user.id !== currentUser.id && user.cursor)
      .map((user) => ({
        id: user.id,
        name: user.name,
        color: user.color,
        index: user.cursor?.index ?? 0,
      }));
  }, [awareness, currentUser.id]);

  if (isLoading) {
    return <LoadingState text="Loading document..." />;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex flex-col h-screen">
      <PresenceBar viewers={viewers} />
      <DocToolbar />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'spring', ...spring.gentle }}
            className="flex items-center justify-between px-4 py-2 border-b border-[var(--quant-border)]"
          >
            <h1 className="text-lg font-semibold truncate">
              {document?.title || 'Untitled Document'}
            </h1>
            <div className="flex items-center gap-2">
              {connected && (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  Live
                </span>
              )}
              <nav className="flex items-center gap-1" aria-label="Panel toggles">
                <Button
                  variant={activePanel === 'comments' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => togglePanel('comments')}
                  aria-pressed={activePanel === 'comments'}
                  aria-label="Toggle comments panel"
                  className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  Comments
                </Button>
                <Button
                  variant={activePanel === 'history' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => togglePanel('history')}
                  aria-pressed={activePanel === 'history'}
                  aria-label="Toggle version history panel"
                  className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  History
                </Button>
                <Button
                  variant={activePanel === 'ai' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => togglePanel('ai')}
                  aria-pressed={activePanel === 'ai'}
                  aria-label="Toggle AI assistant panel"
                  className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  AI
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShareOpen(true)}
                  aria-label="Share document"
                  className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  Share
                </Button>
              </nav>
            </div>
          </motion.div>

          <DocEditor
            initialContent={document?.content}
            yDoc={yDoc}
            synced={synced}
            connected={connected}
            remoteCursors={remoteCursors}
          />
        </div>

        <AnimatePresence mode="wait">
          {activePanel === 'comments' && <CommentsPanel key="comments" />}
          {activePanel === 'history' && <VersionHistory key="history" />}
          {activePanel === 'ai' && <AISidebar key="ai" />}
        </AnimatePresence>
      </div>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
