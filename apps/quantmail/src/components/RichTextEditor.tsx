// ============================================================================
// QuantMail - Rich Text Editor Component
// WYSIWYG editor with toolbar, formatting, images, links, undo/redo
// ============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { sanitizeHtmlContent } from '@quant/shared-ui';

interface RichTextEditorProps {
  initialContent?: string;
  placeholder?: string;
  onChange?: (html: string) => void;
  onImageInsert?: (file: File) => Promise<string>;
  minHeight?: number;
  maxHeight?: number;
  readOnly?: boolean;
}

interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  orderedList: boolean;
  unorderedList: boolean;
  heading: string;
  alignment: string;
  foreColor: string;
}

interface LinkDialogState {
  isOpen: boolean;
  url: string;
  text: string;
  isEdit: boolean;
}

interface ImageDialogState {
  isOpen: boolean;
  url: string;
  alt: string;
  width: string;
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
const COLORS = [
  '#000000',
  '#333333',
  '#666666',
  '#999999',
  '#dc3545',
  '#fd7e14',
  '#ffc107',
  '#28a745',
  '#17a2b8',
  '#0d6efd',
  '#6f42c1',
  '#e83e8c',
];
const HEADINGS = [
  { value: 'p', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  initialContent = '',
  placeholder = 'Start typing...',
  onChange,
  onImageInsert,
  minHeight = 200,
  maxHeight = 600,
  readOnly = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formatState, setFormatState] = useState<FormatState>({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    orderedList: false,
    unorderedList: false,
    heading: 'p',
    alignment: 'left',
    foreColor: '#000000',
  });
  const [linkDialog, setLinkDialog] = useState<LinkDialogState>({
    isOpen: false,
    url: '',
    text: '',
    isEdit: false,
  });
  const [imageDialog, setImageDialog] = useState<ImageDialogState>({
    isOpen: false,
    url: '',
    alt: '',
    width: '',
  });
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showFontSize, setShowFontSize] = useState<boolean>(false);
  const [wordCount, setWordCount] = useState<number>(0);
  const [charCount, setCharCount] = useState<number>(0);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [isEmpty, setIsEmpty] = useState<boolean>(!initialContent);

  useEffect(() => {
    if (editorRef.current && initialContent) {
      editorRef.current.innerHTML = initialContent;
      updateCounts();
    }
  }, []);

  const updateFormatState = useCallback(() => {
    setFormatState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikethrough: document.queryCommandState('strikethrough'),
      orderedList: document.queryCommandState('insertOrderedList'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      heading: document.queryCommandValue('formatBlock') || 'p',
      alignment: document.queryCommandValue('justifyLeft')
        ? 'left'
        : document.queryCommandValue('justifyCenter')
          ? 'center'
          : document.queryCommandValue('justifyRight')
            ? 'right'
            : 'left',
      foreColor: document.queryCommandValue('foreColor') || '#000000',
    });
  }, []);

  const updateCounts = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const words = text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    setWordCount(words.length);
    setCharCount(text.length);
    setIsEmpty(text.trim().length === 0);
  }, []);

  const handleInput = useCallback(() => {
    updateFormatState();
    updateCounts();
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange, updateFormatState, updateCounts]);

  const saveToUndoStack = useCallback(() => {
    if (editorRef.current) {
      setUndoStack((prev) => [...prev.slice(-50), editorRef.current!.innerHTML]);
      setRedoStack([]);
    }
  }, []);

  const execCommand = useCallback(
    (command: string, value?: string) => {
      saveToUndoStack();
      document.execCommand(command, false, value);
      editorRef.current?.focus();
      updateFormatState();
      handleInput();
    },
    [saveToUndoStack, updateFormatState, handleInput],
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    if (editorRef.current) {
      setRedoStack((r) => [...r, editorRef.current!.innerHTML]);
      editorRef.current.innerHTML = prev;
      setUndoStack((u) => u.slice(0, -1));
      handleInput();
    }
  }, [undoStack, handleInput]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    if (editorRef.current) {
      setUndoStack((u) => [...u, editorRef.current!.innerHTML]);
      editorRef.current.innerHTML = next;
      setRedoStack((r) => r.slice(0, -1));
      handleInput();
    }
  }, [redoStack, handleInput]);

  const handleInsertLink = useCallback(() => {
    if (!linkDialog.url) return;
    saveToUndoStack();
    if (linkDialog.text) {
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${linkDialog.url}" target="_blank">${linkDialog.text}</a>`,
      );
    } else {
      document.execCommand('createLink', false, linkDialog.url);
    }
    setLinkDialog({ isOpen: false, url: '', text: '', isEdit: false });
    editorRef.current?.focus();
    handleInput();
  }, [linkDialog, saveToUndoStack, handleInput]);

  const handleInsertImage = useCallback(async () => {
    if (imageDialog.url) {
      saveToUndoStack();
      const widthAttr = imageDialog.width ? ` width="${imageDialog.width}"` : '';
      const altAttr = imageDialog.alt ? ` alt="${imageDialog.alt}"` : '';
      document.execCommand(
        'insertHTML',
        false,
        `<img src="${imageDialog.url}"${altAttr}${widthAttr} style="max-width:100%" />`,
      );
      setImageDialog({ isOpen: false, url: '', alt: '', width: '' });
      editorRef.current?.focus();
      handleInput();
    }
  }, [imageDialog, saveToUndoStack, handleInput]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      if (onImageInsert) {
        const url = await onImageInsert(file);
        saveToUndoStack();
        document.execCommand(
          'insertHTML',
          false,
          `<img src="${url}" alt="${file.name}" style="max-width:100%" />`,
        );
        handleInput();
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          saveToUndoStack();
          document.execCommand(
            'insertHTML',
            false,
            `<img src="${reader.result}" alt="${file.name}" style="max-width:100%" />`,
          );
          handleInput();
        };
        reader.readAsDataURL(file);
      }
    },
    [onImageInsert, saveToUndoStack, handleInput],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              saveToUndoStack();
              document.execCommand(
                'insertHTML',
                false,
                `<img src="${reader.result}" style="max-width:100%" />`,
              );
              handleInput();
            };
            reader.readAsDataURL(file);
          }
          return;
        }
      }
      // Allow normal text paste
    },
    [saveToUndoStack, handleInput],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            execCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            execCommand('italic');
            break;
          case 'u':
            e.preventDefault();
            execCommand('underline');
            break;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) handleRedo();
            else handleUndo();
            break;
          case 'y':
            e.preventDefault();
            handleRedo();
            break;
          case 'k':
            e.preventDefault();
            setLinkDialog({ isOpen: true, url: '', text: '', isEdit: false });
            break;
        }
      }
    },
    [execCommand, handleUndo, handleRedo],
  );

  if (readOnly) {
    return (
      <div
        className="rich-text-readonly"
        dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(initialContent) }}
      />
    );
  }

  return (
    <div className="rich-text-editor">
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
            className="toolbar-btn"
          >
            &#x21B6;
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Y)"
            className="toolbar-btn"
          >
            &#x21B7;
          </button>
        </div>
        <div className="toolbar-divider"></div>
        <div className="toolbar-group">
          <select
            value={formatState.heading}
            onChange={(e) => execCommand('formatBlock', e.target.value)}
            className="heading-select"
          >
            {HEADINGS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-divider"></div>
        <div className="toolbar-group">
          <button
            onClick={() => execCommand('bold')}
            className={`toolbar-btn ${formatState.bold ? 'active' : ''}`}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </button>
          <button
            onClick={() => execCommand('italic')}
            className={`toolbar-btn ${formatState.italic ? 'active' : ''}`}
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </button>
          <button
            onClick={() => execCommand('underline')}
            className={`toolbar-btn ${formatState.underline ? 'active' : ''}`}
            title="Underline (Ctrl+U)"
          >
            <u>U</u>
          </button>
          <button
            onClick={() => execCommand('strikethrough')}
            className={`toolbar-btn ${formatState.strikethrough ? 'active' : ''}`}
            title="Strikethrough"
          >
            <s>S</s>
          </button>
        </div>
        <div className="toolbar-divider"></div>
        <div className="toolbar-group">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="toolbar-btn color-btn"
            title="Text Color"
          >
            <span style={{ borderBottom: `3px solid ${formatState.foreColor}` }}>A</span>
          </button>
          {showColorPicker && (
            <div className="color-picker-dropdown">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    execCommand('foreColor', color);
                    setShowColorPicker(false);
                  }}
                  className="color-swatch"
                  style={{ backgroundColor: color }}
                ></button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowFontSize(!showFontSize)}
            className="toolbar-btn"
            title="Font Size"
          >
            T&#x2195;
          </button>
          {showFontSize && (
            <div className="font-size-dropdown">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    execCommand('fontSize', '3');
                    setShowFontSize(false);
                  }}
                  className="size-option"
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="toolbar-divider"></div>
        <div className="toolbar-group">
          <button
            onClick={() => execCommand('insertOrderedList')}
            className={`toolbar-btn ${formatState.orderedList ? 'active' : ''}`}
            title="Numbered List"
          >
            1.
          </button>
          <button
            onClick={() => execCommand('insertUnorderedList')}
            className={`toolbar-btn ${formatState.unorderedList ? 'active' : ''}`}
            title="Bullet List"
          >
            &#8226;
          </button>
          <button onClick={() => execCommand('indent')} className="toolbar-btn" title="Indent">
            &#x21E5;
          </button>
          <button onClick={() => execCommand('outdent')} className="toolbar-btn" title="Outdent">
            &#x21E4;
          </button>
        </div>
        <div className="toolbar-divider"></div>
        <div className="toolbar-group">
          <button
            onClick={() => execCommand('justifyLeft')}
            className="toolbar-btn"
            title="Align Left"
          >
            &#x2261;
          </button>
          <button
            onClick={() => execCommand('justifyCenter')}
            className="toolbar-btn"
            title="Align Center"
          >
            &#x2261;
          </button>
          <button
            onClick={() => execCommand('justifyRight')}
            className="toolbar-btn"
            title="Align Right"
          >
            &#x2261;
          </button>
        </div>
        <div className="toolbar-divider"></div>
        <div className="toolbar-group">
          <button
            onClick={() => setLinkDialog({ isOpen: true, url: '', text: '', isEdit: false })}
            className="toolbar-btn"
            title="Insert Link (Ctrl+K)"
          >
            &#x1F517;
          </button>
          <button
            onClick={() => setImageDialog({ isOpen: true, url: '', alt: '', width: '' })}
            className="toolbar-btn"
            title="Insert Image"
          >
            &#x1F5BC;
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="toolbar-btn"
            title="Upload Image"
          >
            &#x2B06;
          </button>
          <button
            onClick={() => execCommand('insertHorizontalRule')}
            className="toolbar-btn"
            title="Horizontal Line"
          >
            &#x2500;
          </button>
          <button
            onClick={() => execCommand('formatBlock', 'blockquote')}
            className="toolbar-btn"
            title="Blockquote"
          >
            &#x201C;
          </button>
          <button
            onClick={() => execCommand('insertHTML', '<pre><code></code></pre>')}
            className="toolbar-btn"
            title="Code Block"
          >
            &lt;/&gt;
          </button>
        </div>
        <div className="toolbar-divider"></div>
        <div className="toolbar-group">
          <button
            onClick={() => {
              if (editorRef.current) {
                saveToUndoStack();
                editorRef.current.innerHTML = '';
                handleInput();
              }
            }}
            className="toolbar-btn"
            title="Clear Formatting"
          >
            &#x2715;
          </button>
        </div>
      </div>

      <div
        ref={editorRef}
        className={`editor-content ${isEmpty ? 'show-placeholder' : ''}`}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseUp={updateFormatState}
        onKeyUp={updateFormatState}
        data-placeholder={placeholder}
        style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px`, overflowY: 'auto' }}
      />

      <div className="editor-footer">
        <span className="word-count">{wordCount} words</span>
        <span className="char-count">{charCount} characters</span>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileUpload} />

      {linkDialog.isOpen && (
        <div className="editor-dialog link-dialog">
          <h4>Insert Link</h4>
          <div className="dialog-field">
            <label>URL</label>
            <input
              type="url"
              value={linkDialog.url}
              onChange={(e) => setLinkDialog((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://..."
              autoFocus
            />
          </div>
          <div className="dialog-field">
            <label>Display Text (optional)</label>
            <input
              type="text"
              value={linkDialog.text}
              onChange={(e) => setLinkDialog((p) => ({ ...p, text: e.target.value }))}
              placeholder="Link text"
            />
          </div>
          <div className="dialog-actions">
            <button onClick={() => setLinkDialog((p) => ({ ...p, isOpen: false }))}>Cancel</button>
            <button onClick={handleInsertLink} disabled={!linkDialog.url}>
              Insert
            </button>
          </div>
        </div>
      )}

      {imageDialog.isOpen && (
        <div className="editor-dialog image-dialog">
          <h4>Insert Image</h4>
          <div className="dialog-field">
            <label>Image URL</label>
            <input
              type="url"
              value={imageDialog.url}
              onChange={(e) => setImageDialog((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://..."
              autoFocus
            />
          </div>
          <div className="dialog-field">
            <label>Alt Text</label>
            <input
              type="text"
              value={imageDialog.alt}
              onChange={(e) => setImageDialog((p) => ({ ...p, alt: e.target.value }))}
              placeholder="Image description"
            />
          </div>
          <div className="dialog-field">
            <label>Width (optional)</label>
            <input
              type="text"
              value={imageDialog.width}
              onChange={(e) => setImageDialog((p) => ({ ...p, width: e.target.value }))}
              placeholder="e.g., 400px or 100%"
            />
          </div>
          <div className="dialog-actions">
            <button onClick={() => setImageDialog((p) => ({ ...p, isOpen: false }))}>Cancel</button>
            <button onClick={handleInsertImage} disabled={!imageDialog.url}>
              Insert
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RichTextEditor;
