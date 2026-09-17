'use client';

// ============================================================================
// QuantDrive Document Editor — Canonical Route /drive/doc/[docId]
// Adheres strictly to Gates N-G1 through N-G5 in PHASE_N_COLLABORATION_MEMO.md
// Tasks N05 & N06: TipTap / Block Editor UI & Real-Time CRDT Collaboration
// ============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../../components/AppShell';
import { AppSidebar } from '../../../../components/AppSidebar';
import { showToast } from '../../../../components/InboxToast';
import { useCollabDoc } from './useCollabDoc';
import { DocumentHeader } from './DocumentHeader';
import { BlockEditor } from './BlockEditor';
import { blocksToMarkdown, markdownToBlocks, downloadMarkdownFile } from './markdown-serializer';

const EMOJI_PRESETS = ['📄', '🚀', '💡', '📝', '📊', '⚡', '🔒', '🎯', '✨', '🔥'];

export default function DocumentPage() {
  const params = useParams<{ docId: string }>();
  const router = useRouter();
  const docId = params?.docId ?? 'default';

  const {
    title,
    setTitle,
    blocks,
    setBlocks,
    metadata,
    setMetadata,
    isPublic,
    setIsPublic,
    syncStatus,
    lastSaved,
    collaborators,
    isLoading,
    broadcastCursor,
  } = useCollabDoc(docId);

  const [fullWidth, setFullWidth] = useState<boolean>(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);

  // Compute total word count
  const wordCount = useMemo(() => {
    return blocks.reduce((acc, b) => {
      const text = b.content || '';
      const words = text.trim().split(/\s+/).filter(Boolean);
      return acc + words.length;
    }, 0);
  }, [blocks]);

  // Markdown Export handler
  const handleExportMarkdown = useCallback(() => {
    const md = blocksToMarkdown(blocks);
    const filename = title || 'untitled-document';
    downloadMarkdownFile(filename, md);
    showToast({
      text: `Exported "${filename}.md"`,
      type: 'success',
      subject: 'doc-export',
    });
  }, [blocks, title]);

  // Markdown Import handler
  const handleImportMarkdown = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsedBlocks = markdownToBlocks(text);
        setBlocks(parsedBlocks);
        // If file has a name, update title
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        if (baseName && (!title || title === 'Untitled Document')) {
          setTitle(baseName);
        }
        showToast({
          text: `Imported ${parsedBlocks.length} blocks from "${file.name}"`,
          type: 'success',
          subject: 'doc-import',
        });
      } catch {
        showToast({
          text: `Failed to import "${file.name}"`,
          type: 'error',
          subject: 'doc-import',
        });
      }
    },
    [setBlocks, setTitle, title],
  );

  // Duplicate document handler
  const handleDuplicateDocument = useCallback(() => {
    const newDocId = 'doc_' + Math.random().toString(36).substring(2, 9);
    try {
      localStorage.setItem(
        `quant_doc_${newDocId}`,
        JSON.stringify({
          title: `${title} (Copy)`,
          blocks,
          metadata,
          updatedAt: new Date().toISOString(),
        }),
      );
      showToast({ text: 'Document duplicated', type: 'success', subject: 'doc-duplicate' });
      router.push(`/drive/doc/${newDocId}`);
    } catch {
      showToast({ text: 'Failed to duplicate document', type: 'error', subject: 'doc-duplicate' });
    }
  }, [title, blocks, metadata, router]);

  // Delete document handler
  const handleDeleteDocument = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      localStorage.removeItem(`quant_doc_${docId}`);
      showToast({ text: 'Document moved to trash', type: 'info', subject: 'doc-delete' });
      router.push('/drive');
    } catch {
      showToast({ text: 'Failed to delete document', type: 'error', subject: 'doc-delete' });
    }
  }, [docId, router]);

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      searchPlaceholder="Search document content..."
    >
      <div className="flex flex-col h-full bg-[#0D1117] text-[#C9D1D9] overflow-hidden">
        {/* Notion-class Header Bar */}
        <DocumentHeader
          docId={docId}
          title={title}
          onTitleChange={setTitle}
          syncStatus={syncStatus}
          lastSaved={lastSaved}
          collaborators={collaborators}
          isPublic={isPublic}
          onTogglePublic={setIsPublic}
          onExportMarkdown={handleExportMarkdown}
          onImportMarkdown={handleImportMarkdown}
          onDeleteDocument={handleDeleteDocument}
          onDuplicateDocument={handleDuplicateDocument}
          fullWidth={fullWidth}
          onToggleFullWidth={() => setFullWidth(!fullWidth)}
          wordCount={wordCount}
        />

        {/* Scrollable Document Workspace */}
        <main className="flex-1 overflow-y-auto no-scrollbar relative">
          {isLoading ? (
            <div className="mx-auto max-w-4xl py-20 px-8 space-y-6 animate-pulse">
              <div className="h-10 w-48 bg-[#161B22] rounded-lg" />
              <div className="h-4 w-full bg-[#161B22] rounded" />
              <div className="h-4 w-3/4 bg-[#161B22] rounded" />
              <div className="h-32 w-full bg-[#161B22] rounded-xl" />
            </div>
          ) : (
            <div className="min-h-full">
              {/* Document Title & Icon Header Area */}
              <div
                className={`mx-auto pt-12 px-4 sm:px-12 transition-all ${
                  fullWidth ? 'max-w-full' : 'max-w-4xl'
                }`}
              >
                {/* Emoji / Icon Selector */}
                <div className="relative inline-block mb-3">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="w-12 h-12 rounded-xl bg-[#161B22] border border-[#30363D] hover:border-[#FF8C42] flex items-center justify-center text-2xl transition-all shadow-sm"
                    title="Change icon"
                  >
                    {metadata.icon || '📄'}
                  </button>

                  {showEmojiPicker && (
                    <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-[#30363D] bg-[#161B22] p-2 shadow-2xl z-50">
                      <div className="text-[10px] font-semibold text-[#8B949E] px-1 py-1 uppercase tracking-wider">
                        Select Icon
                      </div>
                      <div className="grid grid-cols-5 gap-1.5 pt-1">
                        {EMOJI_PRESETS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setMetadata({ icon: emoji });
                              setShowEmojiPicker(false);
                            }}
                            className="w-10 h-10 rounded-lg hover:bg-[#21262D] flex items-center justify-center text-xl transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Primary Editable Document Heading */}
                <input
                  type="text"
                  placeholder="Untitled"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-transparent border-none text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#F0F6FC] placeholder-[#30363D] focus:outline-none focus:ring-0 leading-tight mb-4"
                />
              </div>

              {/* Core Block Editor Workspace */}
              <BlockEditor
                blocks={blocks}
                onChange={setBlocks}
                collaborators={collaborators}
                onCursorMove={broadcastCursor}
                fullWidth={fullWidth}
              />
            </div>
          )}

          {/* Floating Auto-save / Sync Status Pill */}
          <div className="fixed bottom-4 right-6 z-30 flex items-center gap-2 rounded-full border border-[#30363D] bg-[#161B22]/90 px-3 py-1.5 text-xs text-[#8B949E] shadow-xl backdrop-blur-md">
            {syncStatus === 'connected' && (
              <>
                <span className="h-2 w-2 rounded-full bg-[#3FB950] animate-pulse" />
                <span>Live Multiplayer CRDT</span>
              </>
            )}
            {syncStatus === 'saving' && (
              <>
                <span className="h-2 w-2 rounded-full bg-[#D29922]" />
                <span>Auto-saving changes...</span>
              </>
            )}
            {syncStatus === 'saved' && (
              <>
                <span className="h-2 w-2 rounded-full bg-[#3FB950]" />
                <span>
                  Saved{' '}
                  {lastSaved
                    ? lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'just now'}
                </span>
              </>
            )}
            {syncStatus === 'offline' && (
              <>
                <span className="h-2 w-2 rounded-full bg-[#8B949E]" />
                <span>Offline (Local Cache)</span>
              </>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
