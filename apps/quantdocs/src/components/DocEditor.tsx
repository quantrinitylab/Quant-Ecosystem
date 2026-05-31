'use client';

import { useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingState, sanitizeHtmlContent } from '@quant/shared-ui';
import * as Y from 'yjs';

interface RemoteCursor {
  id: string;
  name: string;
  color: string;
  index: number;
}

interface DocEditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  yDoc?: Y.Doc;
  synced?: boolean;
  connected?: boolean;
  remoteCursors?: RemoteCursor[];
}

export function DocEditor({
  initialContent = '',
  onChange,
  yDoc,
  synced,
  connected,
  remoteCursors = [],
}: DocEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  const handleInput = useCallback(() => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
    // If Yjs doc is available, update the shared text
    if (yDoc && editorRef.current) {
      const yText = yDoc.getText('content');
      const currentText = editorRef.current.innerText;
      yDoc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, currentText);
      });
    }
  }, [onChange, yDoc]);

  // Sync from Yjs doc to editor
  useEffect(() => {
    if (!yDoc || !editorRef.current) return;

    const yText = yDoc.getText('content');
    const observer = () => {
      if (editorRef.current && document.activeElement !== editorRef.current) {
        editorRef.current.innerText = yText.toString();
      }
    };
    yText.observe(observer);
    return () => {
      yText.unobserve(observer);
    };
  }, [yDoc]);

  if (yDoc && !synced) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--quant-background)]">
        <LoadingState text={connected ? 'Syncing document...' : 'Connecting...'} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--quant-background)] relative">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', ...spring.gentle }}
          className="min-h-full max-w-4xl mx-auto relative"
        >
          <div
            ref={editorRef}
            className="min-h-full p-6 md:p-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] rounded-lg prose prose-sm sm:prose lg:prose-lg dark:prose-invert"
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            role="textbox"
            aria-multiline="true"
            aria-label="Document editor"
            data-placeholder="Start typing..."
            dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(initialContent) }}
          />
          {/* Remote cursors */}
          {remoteCursors.map((cursor) => (
            <motion.div
              key={cursor.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="absolute pointer-events-none"
              style={{ top: `${cursor.index * 1.5}em`, left: 0 }}
              aria-hidden="true"
            >
              <div className="w-0.5 h-5 rounded-full" style={{ backgroundColor: cursor.color }} />
              <span
                className="text-[10px] px-1 py-0.5 rounded text-white whitespace-nowrap"
                style={{ backgroundColor: cursor.color }}
              >
                {cursor.name}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
      <style jsx>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: var(--quant-muted-foreground);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
