// ============================================================================
// QuantDrive Document Editor — Core Block Editor Component
// 100% Notion Parity: Slash Menu, Rich Blocks, Drag Handles, Keyboard Navigation
// Gate N-G2: Zero commercial Pro dependencies, 100% MIT native React block engine
// ============================================================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { BlockType, EditorBlock, DocumentCollaborator } from './types';
import { SlashMenu } from './SlashMenu';
import { FormattingToolbar } from './FormattingToolbar';
import { showToast } from '../../../../components/InboxToast';

function createId(): string {
  return 'b_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
}

interface BlockEditorProps {
  blocks: EditorBlock[];
  onChange: (blocks: EditorBlock[] | ((prev: EditorBlock[]) => EditorBlock[])) => void;
  collaborators?: DocumentCollaborator[];
  onCursorMove?: (blockId?: string) => void;
  fullWidth?: boolean;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({
  blocks,
  onChange,
  collaborators = [],
  onCursorMove,
  fullWidth = false,
}) => {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [blockMenuId, setBlockMenuId] = useState<string | null>(null);

  // Slash command state
  const [slashActive, setSlashActive] = useState<boolean>(false);
  const [slashQuery, setSlashQuery] = useState<string>('');
  const [slashPosition, setSlashPosition] = useState<{ top: number; left: number } | undefined>(
    undefined,
  );

  // Selection / formatting toolbar state
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState<boolean>(false);

  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Set focus on a given block
  const focusBlock = useCallback((id: string, cursorAtEnd = true) => {
    requestAnimationFrame(() => {
      const el = blockRefs.current.get(id);
      if (el) {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.focus();
          if (cursorAtEnd) {
            el.setSelectionRange(el.value.length, el.value.length);
          }
        } else {
          el.focus();
        }
      }
    });
  }, []);

  // Update a single block's content
  const updateBlockContent = useCallback(
    (id: string, newContent: string) => {
      onChange((prev) => prev.map((b) => (b.id === id ? { ...b, content: newContent } : b)));

      // Check for slash command trigger
      if (newContent.startsWith('/') || newContent.includes(' /')) {
        const lastSlashIndex = newContent.lastIndexOf('/');
        const query = newContent.slice(lastSlashIndex + 1);
        setSlashQuery(query);
        setSlashActive(true);

        const el = blockRefs.current.get(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          setSlashPosition({
            top: rect.bottom + window.scrollY + 4,
            left: Math.max(rect.left, 24),
          });
        }
      } else {
        setSlashActive(false);
      }
    },
    [onChange],
  );

  // Insert a new block below the specified block
  const insertBlockBelow = useCallback(
    (afterId: string, type: BlockType = 'paragraph', initialContent = '') => {
      const newId = createId();
      const newBlock: EditorBlock = {
        id: newId,
        type,
        content: initialContent,
        tableData:
          type === 'table'
            ? [
                ['Column 1', 'Column 2', 'Column 3'],
                ['', '', ''],
                ['', '', ''],
              ]
            : undefined,
        calloutIcon: type === 'callout' ? '💡' : undefined,
        language: type === 'code' ? 'typescript' : undefined,
      };

      onChange((prev) => {
        const idx = prev.findIndex((b) => b.id === afterId);
        if (idx === -1) return [...prev, newBlock];
        const next = [...prev];
        next.splice(idx + 1, 0, newBlock);
        return next;
      });

      setActiveBlockId(newId);
      focusBlock(newId);
      setSlashActive(false);
    },
    [onChange, focusBlock],
  );

  // Delete a block
  const deleteBlock = useCallback(
    (id: string) => {
      onChange((prev) => {
        if (prev.length <= 1) {
          // Keep at least one empty block
          return [{ id: createId(), type: 'paragraph', content: '' }];
        }
        const idx = prev.findIndex((b) => b.id === id);
        const next = prev.filter((b) => b.id !== id);
        const focusTargetId = idx > 0 ? prev[idx - 1].id : next[0]?.id;
        if (focusTargetId) {
          focusBlock(focusTargetId);
        }
        return next;
      });
      setSlashActive(false);
    },
    [onChange, focusBlock],
  );

  // Duplicate a block
  const duplicateBlock = useCallback(
    (id: string) => {
      onChange((prev) => {
        const idx = prev.findIndex((b) => b.id === id);
        if (idx === -1) return prev;
        const target = prev[idx];
        const cloned: EditorBlock = {
          ...target,
          id: createId(),
        };
        const next = [...prev];
        next.splice(idx + 1, 0, cloned);
        return next;
      });
    },
    [onChange],
  );

  // Convert block type
  const convertBlockType = useCallback(
    (id: string, newType: BlockType) => {
      onChange((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          // Clean leading slash from content if converting from slash command
          const cleanContent = b.content.replace(/^\/[a-zA-Z0-9]*\s*/, '').trim();
          return {
            ...b,
            type: newType,
            content: cleanContent,
            tableData:
              newType === 'table' && !b.tableData
                ? [
                    ['Header 1', 'Header 2', 'Header 3'],
                    ['', '', ''],
                  ]
                : b.tableData,
            calloutIcon: newType === 'callout' && !b.calloutIcon ? '💡' : b.calloutIcon,
            language: newType === 'code' && !b.language ? 'typescript' : b.language,
          };
        }),
      );
      setSlashActive(false);
      focusBlock(id);
    },
    [onChange, focusBlock],
  );

  // Move block up or down
  const moveBlock = useCallback(
    (id: string, direction: 'up' | 'down') => {
      onChange((prev) => {
        const idx = prev.findIndex((b) => b.id === id);
        if (idx === -1) return prev;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= prev.length) return prev;
        const next = [...prev];
        const [removed] = next.splice(idx, 1);
        next.splice(targetIdx, 0, removed);
        return next;
      });
    },
    [onChange],
  );

  // Handle keyboard interaction on standard blocks
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    block: EditorBlock,
    index: number,
  ) => {
    // If slash menu is active, SlashMenu listens globally for Enter, ArrowUp, ArrowDown, Escape
    if (slashActive && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // On empty list block, convert to paragraph
      if (['todo', 'bullet', 'numbered'].includes(block.type) && !block.content.trim()) {
        convertBlockType(block.id, 'paragraph');
        return;
      }
      // Otherwise insert next block
      const nextType = ['bullet', 'numbered', 'todo'].includes(block.type)
        ? block.type
        : 'paragraph';
      insertBlockBelow(block.id, nextType);
    } else if (e.key === 'Backspace' && !block.content) {
      e.preventDefault();
      if (block.type !== 'paragraph') {
        convertBlockType(block.id, 'paragraph');
      } else {
        deleteBlock(block.id);
      }
    } else if (e.key === 'ArrowUp') {
      const input = e.currentTarget;
      if (input.selectionStart === 0 && index > 0) {
        e.preventDefault();
        const prevBlock = blocks[index - 1];
        if (prevBlock) focusBlock(prevBlock.id);
      }
    } else if (e.key === 'ArrowDown') {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length && index < blocks.length - 1) {
        e.preventDefault();
        const nextBlock = blocks[index + 1];
        if (nextBlock) focusBlock(nextBlock.id);
      }
    }
  };

  // Text formatting wrapper for selection
  const handleFormatText = (format: 'bold' | 'italic' | 'strike' | 'code' | 'link') => {
    if (!activeBlockId) return;
    const block = blocks.find((b) => b.id === activeBlockId);
    if (!block) return;

    let wrapLeft = '';
    let wrapRight = '';
    switch (format) {
      case 'bold':
        wrapLeft = '**';
        wrapRight = '**';
        break;
      case 'italic':
        wrapLeft = '*';
        wrapRight = '*';
        break;
      case 'strike':
        wrapLeft = '~~';
        wrapRight = '~~';
        break;
      case 'code':
        wrapLeft = '`';
        wrapRight = '`';
        break;
      case 'link':
        wrapLeft = '[';
        wrapRight = '](https://)';
        break;
    }

    if (selectionRange && selectionRange.start !== selectionRange.end) {
      const before = block.content.slice(0, selectionRange.start);
      const selected = block.content.slice(selectionRange.start, selectionRange.end);
      const after = block.content.slice(selectionRange.end);
      updateBlockContent(activeBlockId, `${before}${wrapLeft}${selected}${wrapRight}${after}`);
    } else {
      updateBlockContent(activeBlockId, `${block.content} ${wrapLeft}text${wrapRight}`);
    }
  };

  // Copy code helper
  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast({ text: 'Code copied to clipboard', type: 'success', subject: 'copy-code' });
    } catch {
      showToast({ text: 'Failed to copy code', type: 'error', subject: 'copy-code' });
    }
  };

  return (
    <div
      className={`mx-auto pb-32 pt-8 px-4 sm:px-12 transition-all ${
        fullWidth ? 'max-w-full' : 'max-w-4xl'
      }`}
    >
      {/* Floating formatting toolbar */}
      {toolbarVisible && activeBlockId && (
        <div className="sticky top-16 z-30 mb-4 flex justify-center">
          <FormattingToolbar
            currentType={blocks.find((b) => b.id === activeBlockId)?.type || 'paragraph'}
            onConvertType={(type) => convertBlockType(activeBlockId, type)}
            onFormatText={handleFormatText}
          />
        </div>
      )}

      {/* Blocks List */}
      <div className="space-y-1">
        {blocks.map((block, index) => {
          const isActive = activeBlockId === block.id;
          const isHovered = hoveredBlockId === block.id;
          const remoteCollab = collaborators.find((c) => c.cursorBlockId === block.id);

          return (
            <div
              key={block.id}
              onMouseEnter={() => setHoveredBlockId(block.id)}
              onMouseLeave={() => {
                setHoveredBlockId(null);
                if (blockMenuId === block.id) setBlockMenuId(null);
              }}
              className={`group relative flex items-start -mx-4 px-4 py-1 rounded-lg transition-colors ${
                remoteCollab ? 'border-l-2' : ''
              }`}
              style={{
                borderLeftColor: remoteCollab ? remoteCollab.color : undefined,
              }}
            >
              {/* Remote collaborator name tag */}
              {remoteCollab && (
                <span
                  className="absolute -top-3 left-4 text-[10px] font-bold px-1.5 py-0.2 rounded text-white shadow-sm z-20"
                  style={{ backgroundColor: remoteCollab.color }}
                >
                  {remoteCollab.name}
                </span>
              )}

              {/* Left Hover Gutter: Drag handle and Add button */}
              <div
                className={`absolute -left-3 sm:-left-7 top-1.5 flex items-center gap-0.5 transition-opacity ${
                  isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <button
                  type="button"
                  onClick={() => insertBlockBelow(block.id)}
                  title="Add block below"
                  className="w-5 h-5 rounded flex items-center justify-center text-[#8B949E] hover:text-[#FF8C42] hover:bg-[#21262D] text-xs transition-colors"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setBlockMenuId(blockMenuId === block.id ? null : block.id)}
                  title="Block settings"
                  className="w-5 h-5 rounded flex items-center justify-center text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D] text-xs transition-colors"
                >
                  ⠿
                </button>

                {/* Block actions popover */}
                {blockMenuId === block.id && (
                  <div className="absolute left-6 top-0 w-44 rounded-xl border border-[#30363D] bg-[#161B22] p-1 shadow-2xl z-50 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        duplicateBlock(block.id);
                        setBlockMenuId(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#C9D1D9] hover:bg-[#21262D] hover:text-[#F0F6FC]"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        moveBlock(block.id, 'up');
                        setBlockMenuId(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#C9D1D9] hover:bg-[#21262D] hover:text-[#F0F6FC]"
                    >
                      Move Up
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        moveBlock(block.id, 'down');
                        setBlockMenuId(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#C9D1D9] hover:bg-[#21262D] hover:text-[#F0F6FC]"
                    >
                      Move Down
                    </button>
                    <div className="border-t border-[#21262D] pt-0.5 mt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          deleteBlock(block.id);
                          setBlockMenuId(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#F85149] hover:bg-[#F85149]/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Block Content Rendering based on type */}
              <div className="flex-1 min-w-0">
                {block.type === 'h1' && (
                  <input
                    ref={(el) => {
                      if (el) blockRefs.current.set(block.id, el);
                      else blockRefs.current.delete(block.id);
                    }}
                    type="text"
                    placeholder="Heading 1"
                    value={block.content}
                    onChange={(e) => updateBlockContent(block.id, e.target.value)}
                    onFocus={() => {
                      setActiveBlockId(block.id);
                      setToolbarVisible(true);
                      onCursorMove?.(block.id);
                    }}
                    onBlur={() => onCursorMove?.(undefined)}
                    onKeyDown={(e) => handleKeyDown(e, block, index)}
                    className="w-full bg-transparent border-none text-2xl sm:text-3xl font-extrabold text-[#F0F6FC] placeholder-[#484F58] focus:outline-none focus:ring-0 leading-tight py-1"
                  />
                )}

                {block.type === 'h2' && (
                  <input
                    ref={(el) => {
                      if (el) blockRefs.current.set(block.id, el);
                      else blockRefs.current.delete(block.id);
                    }}
                    type="text"
                    placeholder="Heading 2"
                    value={block.content}
                    onChange={(e) => updateBlockContent(block.id, e.target.value)}
                    onFocus={() => {
                      setActiveBlockId(block.id);
                      setToolbarVisible(true);
                      onCursorMove?.(block.id);
                    }}
                    onBlur={() => onCursorMove?.(undefined)}
                    onKeyDown={(e) => handleKeyDown(e, block, index)}
                    className="w-full bg-transparent border-none text-xl sm:text-2xl font-bold text-[#F0F6FC] placeholder-[#484F58] focus:outline-none focus:ring-0 leading-snug py-1"
                  />
                )}

                {block.type === 'h3' && (
                  <input
                    ref={(el) => {
                      if (el) blockRefs.current.set(block.id, el);
                      else blockRefs.current.delete(block.id);
                    }}
                    type="text"
                    placeholder="Heading 3"
                    value={block.content}
                    onChange={(e) => updateBlockContent(block.id, e.target.value)}
                    onFocus={() => {
                      setActiveBlockId(block.id);
                      setToolbarVisible(true);
                      onCursorMove?.(block.id);
                    }}
                    onBlur={() => onCursorMove?.(undefined)}
                    onKeyDown={(e) => handleKeyDown(e, block, index)}
                    className="w-full bg-transparent border-none text-lg sm:text-xl font-semibold text-[#F0F6FC] placeholder-[#484F58] focus:outline-none focus:ring-0 leading-normal py-1"
                  />
                )}

                {block.type === 'paragraph' && (
                  <textarea
                    ref={(el) => {
                      if (el) blockRefs.current.set(block.id, el);
                      else blockRefs.current.delete(block.id);
                    }}
                    rows={1}
                    placeholder="Type '/' for commands..."
                    value={block.content}
                    onChange={(e) => {
                      updateBlockContent(block.id, e.target.value);
                      // Auto expand height
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    onSelect={(e) => {
                      const target = e.currentTarget;
                      setSelectionRange({ start: target.selectionStart, end: target.selectionEnd });
                    }}
                    onFocus={() => {
                      setActiveBlockId(block.id);
                      setToolbarVisible(true);
                      onCursorMove?.(block.id);
                    }}
                    onBlur={() => onCursorMove?.(undefined)}
                    onKeyDown={(e) => handleKeyDown(e, block, index)}
                    className="w-full bg-transparent border-none text-base text-[#C9D1D9] placeholder-[#484F58] focus:outline-none focus:ring-0 leading-relaxed py-0.5 resize-none overflow-hidden"
                  />
                )}

                {block.type === 'todo' && (
                  <div className="flex items-start gap-2.5 py-0.5">
                    <input
                      type="checkbox"
                      checked={Boolean(block.checked)}
                      onChange={(e) => {
                        onChange((prev) =>
                          prev.map((b) =>
                            b.id === block.id ? { ...b, checked: e.target.checked } : b,
                          ),
                        );
                      }}
                      className="mt-1 w-4 h-4 rounded border-[#30363D] bg-[#0D1117] text-[#FF8C42] focus:ring-0 accent-[#FF8C42] cursor-pointer"
                    />
                    <input
                      ref={(el) => {
                        if (el) blockRefs.current.set(block.id, el);
                        else blockRefs.current.delete(block.id);
                      }}
                      type="text"
                      placeholder="To-do item"
                      value={block.content}
                      onChange={(e) => updateBlockContent(block.id, e.target.value)}
                      onFocus={() => {
                        setActiveBlockId(block.id);
                        setToolbarVisible(true);
                        onCursorMove?.(block.id);
                      }}
                      onBlur={() => onCursorMove?.(undefined)}
                      onKeyDown={(e) => handleKeyDown(e, block, index)}
                      className={`flex-1 bg-transparent border-none text-base focus:outline-none focus:ring-0 leading-relaxed ${
                        block.checked
                          ? 'line-through text-[#6E7681]'
                          : 'text-[#C9D1D9] placeholder-[#484F58]'
                      }`}
                    />
                  </div>
                )}

                {block.type === 'bullet' && (
                  <div className="flex items-start gap-2.5 py-0.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#FF8C42] shrink-0" />
                    <input
                      ref={(el) => {
                        if (el) blockRefs.current.set(block.id, el);
                        else blockRefs.current.delete(block.id);
                      }}
                      type="text"
                      placeholder="List item"
                      value={block.content}
                      onChange={(e) => updateBlockContent(block.id, e.target.value)}
                      onFocus={() => {
                        setActiveBlockId(block.id);
                        setToolbarVisible(true);
                        onCursorMove?.(block.id);
                      }}
                      onBlur={() => onCursorMove?.(undefined)}
                      onKeyDown={(e) => handleKeyDown(e, block, index)}
                      className="flex-1 bg-transparent border-none text-base text-[#C9D1D9] placeholder-[#484F58] focus:outline-none focus:ring-0 leading-relaxed"
                    />
                  </div>
                )}

                {block.type === 'numbered' && (
                  <div className="flex items-start gap-2.5 py-0.5">
                    <span className="mt-0.5 text-xs font-mono font-semibold text-[#FF8C42] shrink-0 min-w-[18px]">
                      {index + 1}.
                    </span>
                    <input
                      ref={(el) => {
                        if (el) blockRefs.current.set(block.id, el);
                        else blockRefs.current.delete(block.id);
                      }}
                      type="text"
                      placeholder="List item"
                      value={block.content}
                      onChange={(e) => updateBlockContent(block.id, e.target.value)}
                      onFocus={() => {
                        setActiveBlockId(block.id);
                        setToolbarVisible(true);
                        onCursorMove?.(block.id);
                      }}
                      onBlur={() => onCursorMove?.(undefined)}
                      onKeyDown={(e) => handleKeyDown(e, block, index)}
                      className="flex-1 bg-transparent border-none text-base text-[#C9D1D9] placeholder-[#484F58] focus:outline-none focus:ring-0 leading-relaxed"
                    />
                  </div>
                )}

                {block.type === 'quote' && (
                  <div className="border-l-4 border-[#FF8C42] pl-3 py-1 bg-[#FF8C42]/5 rounded-r-lg my-1">
                    <textarea
                      ref={(el) => {
                        if (el) blockRefs.current.set(block.id, el);
                        else blockRefs.current.delete(block.id);
                      }}
                      rows={1}
                      placeholder="Empty quote"
                      value={block.content}
                      onChange={(e) => {
                        updateBlockContent(block.id, e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      onFocus={() => {
                        setActiveBlockId(block.id);
                        setToolbarVisible(true);
                        onCursorMove?.(block.id);
                      }}
                      onBlur={() => onCursorMove?.(undefined)}
                      onKeyDown={(e) => handleKeyDown(e, block, index)}
                      className="w-full bg-transparent border-none italic text-base text-[#C9D1D9] placeholder-[#484F58] focus:outline-none focus:ring-0 leading-relaxed resize-none overflow-hidden"
                    />
                  </div>
                )}

                {block.type === 'callout' && (
                  <div className="flex items-start gap-3 p-3.5 rounded-xl border border-[#30363D] bg-[#161B22] my-1 shadow-sm">
                    <span className="text-xl select-none leading-none shrink-0">
                      {block.calloutIcon || '💡'}
                    </span>
                    <textarea
                      ref={(el) => {
                        if (el) blockRefs.current.set(block.id, el);
                        else blockRefs.current.delete(block.id);
                      }}
                      rows={1}
                      placeholder="Highlight important note..."
                      value={block.content}
                      onChange={(e) => {
                        updateBlockContent(block.id, e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      onFocus={() => {
                        setActiveBlockId(block.id);
                        setToolbarVisible(true);
                        onCursorMove?.(block.id);
                      }}
                      onBlur={() => onCursorMove?.(undefined)}
                      onKeyDown={(e) => handleKeyDown(e, block, index)}
                      className="flex-1 bg-transparent border-none text-sm text-[#F0F6FC] placeholder-[#484F58] focus:outline-none focus:ring-0 leading-relaxed resize-none overflow-hidden"
                    />
                  </div>
                )}

                {block.type === 'divider' && (
                  <div className="py-3 my-1">
                    <hr className="border-t border-[#30363D]" />
                  </div>
                )}

                {block.type === 'code' && (
                  <div className="rounded-xl border border-[#30363D] bg-[#0D1117] overflow-hidden my-2 shadow-sm font-mono text-sm">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[#161B22] border-b border-[#30363D] text-xs">
                      <select
                        value={block.language || 'typescript'}
                        onChange={(e) => {
                          const lang = e.target.value;
                          onChange((prev) =>
                            prev.map((b) => (b.id === block.id ? { ...b, language: lang } : b)),
                          );
                        }}
                        className="bg-transparent border-none text-xs text-[#8B949E] focus:outline-none cursor-pointer"
                      >
                        <option value="typescript">TypeScript</option>
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="sql">SQL</option>
                        <option value="json">JSON</option>
                        <option value="bash">Bash</option>
                        <option value="html">HTML</option>
                        <option value="css">CSS</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(block.content)}
                        className="text-[11px] text-[#8B949E] hover:text-[#F0F6FC] transition-colors"
                      >
                        Copy code
                      </button>
                    </div>
                    <textarea
                      ref={(el) => {
                        if (el) blockRefs.current.set(block.id, el);
                        else blockRefs.current.delete(block.id);
                      }}
                      rows={Math.max(2, block.content.split('\n').length || 1)}
                      placeholder="// Type code here..."
                      value={block.content}
                      onChange={(e) => updateBlockContent(block.id, e.target.value)}
                      onFocus={() => {
                        setActiveBlockId(block.id);
                        onCursorMove?.(block.id);
                      }}
                      onBlur={() => onCursorMove?.(undefined)}
                      className="w-full bg-[#0D1117] p-3 text-xs font-mono text-[#58A6FF] placeholder-[#484F58] focus:outline-none leading-relaxed resize-y border-none"
                    />
                  </div>
                )}

                {block.type === 'table' && (
                  <div className="overflow-x-auto my-2 rounded-xl border border-[#30363D] bg-[#0D1117]">
                    <table className="w-full text-left text-xs border-collapse">
                      <tbody>
                        {(
                          block.tableData || [
                            ['Header 1', 'Header 2'],
                            ['', ''],
                          ]
                        ).map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={
                              rIdx === 0 ? 'bg-[#161B22] font-semibold text-[#F0F6FC]' : ''
                            }
                          >
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className="border border-[#30363D] p-1.5 focus-within:bg-[#FF8C42]/10"
                              >
                                <input
                                  type="text"
                                  value={cell}
                                  placeholder={rIdx === 0 ? `Header ${cIdx + 1}` : ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    onChange((prev) =>
                                      prev.map((b) => {
                                        if (b.id !== block.id) return b;
                                        const nextData = (b.tableData || []).map((r) => [...r]);
                                        if (nextData[rIdx]) {
                                          nextData[rIdx][cIdx] = val;
                                        }
                                        return { ...b, tableData: nextData };
                                      }),
                                    );
                                  }}
                                  className="w-full bg-transparent border-none text-xs text-[#C9D1D9] focus:outline-none"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center gap-2 p-2 bg-[#161B22]/50 border-t border-[#30363D] text-[11px] text-[#8B949E]">
                      <button
                        type="button"
                        onClick={() => {
                          onChange((prev) =>
                            prev.map((b) => {
                              if (b.id !== block.id) return b;
                              const currentData = b.tableData || [['', '']];
                              const cols = currentData[0]?.length || 2;
                              const newRow = new Array(cols).fill('');
                              return { ...b, tableData: [...currentData, newRow] };
                            }),
                          );
                        }}
                        className="hover:text-[#FF8C42] transition-colors"
                      >
                        + Add Row
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => {
                          onChange((prev) =>
                            prev.map((b) => {
                              if (b.id !== block.id) return b;
                              const currentData = (b.tableData || [['']]).map((r) => [...r, '']);
                              return { ...b, tableData: currentData };
                            }),
                          );
                        }}
                        className="hover:text-[#FF8C42] transition-colors"
                      >
                        + Add Column
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* In-House Slash Command Menu */}
      {slashActive && activeBlockId && (
        <SlashMenu
          query={slashQuery}
          onSelect={(type) => convertBlockType(activeBlockId, type)}
          onClose={() => setSlashActive(false)}
          position={slashPosition}
        />
      )}
    </div>
  );
};
