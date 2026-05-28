'use client';

import { useCallback, useRef } from 'react';
import { sanitizeHtmlContent } from '@quant/shared-ui';

interface DocEditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
}

export function DocEditor({ initialContent = '', onChange }: DocEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  const handleInput = useCallback(() => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--quant-background)]">
      <div
        ref={editorRef}
        className="min-h-full max-w-4xl mx-auto p-6 md:p-10 focus:outline-none prose prose-sm sm:prose lg:prose-lg"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        role="textbox"
        aria-multiline="true"
        aria-label="Document editor"
        data-placeholder="Start typing..."
        dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(initialContent) }}
      />
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
