'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { IconWarning } from './icons';

interface LivePreviewProps {
  code: string;
  language: string;
  isVisible: boolean;
}

/**
 * Live Preview — renders HTML/CSS/React code in real-time.
 * CodePen/CodeSandbox have this but GitHub doesn't.
 * We show a live rendered preview beside the editor.
 */
export function LivePreview({ code, language, isVisible }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  const isPreviewable = useMemo(() => {
    return [
      'html',
      'css',
      'javascript',
      'typescript',
      'typescriptreact',
      'javascriptreact',
    ].includes(language);
  }, [language]);

  const previewHtml = useMemo(() => {
    if (!isPreviewable) return '';

    if (language === 'html') {
      return code;
    }

    if (language === 'css') {
      return `<!DOCTYPE html><html><head><style>${code}</style></head><body><div class="preview"><h1>CSS Preview</h1><p>Style applied</p><button>Button</button></div></body></html>`;
    }

    // For JS/TS/React, wrap in a basic HTML page
    const wrappedCode = code
      .replace(/import .*/g, '// import removed for preview')
      .replace(/export /g, '');

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui; padding: 1rem; background: #090A0C; color: #F5F5F5; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    try {
      ${wrappedCode}
    } catch(e) {
      document.getElementById('root').innerHTML = '<pre style="color:#f87171">' + e.message + '</pre>';
    }
  </script>
</body>
</html>`;
  }, [code, language, isPreviewable]);

  useEffect(() => {
    if (!iframeRef.current || !isVisible || !previewHtml) return;
    try {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(previewHtml);
        doc.close();
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview error');
    }
  }, [previewHtml, isVisible]);

  if (!isVisible || !isPreviewable) return null;

  return (
    <div className="live-preview">
      <header className="live-preview-header">
        <span className="live-preview-dot" />
        <span>Live Preview</span>
        {error && (
          <span className="live-preview-error inline-flex items-center gap-1">
            <IconWarning size={11} />
            {error}
          </span>
        )}
      </header>
      <iframe
        ref={iframeRef}
        className="live-preview-frame"
        sandbox="allow-scripts"
        title="Live code preview"
      />
    </div>
  );
}
