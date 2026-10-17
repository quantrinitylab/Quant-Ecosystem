// ============================================================================
// QuantDrive Document Editor — Markdown Serializer & Deserializer
// Converts between rich EditorBlock structures and GitHub Flavored Markdown (GFM)
// ============================================================================

import type { EditorBlock, BlockType } from './types';

function createId(): string {
  return 'b_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
}

/**
 * Serializes an array of EditorBlock objects to a GitHub Flavored Markdown string.
 */
export function blocksToMarkdown(blocks: EditorBlock[]): string {
  const lines: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const content = block.content || '';

    switch (block.type) {
      case 'h1':
        lines.push(`# ${content}`);
        break;
      case 'h2':
        lines.push(`## ${content}`);
        break;
      case 'h3':
        lines.push(`### ${content}`);
        break;
      case 'paragraph':
        lines.push(content);
        break;
      case 'todo':
        lines.push(`- [${block.checked ? 'x' : ' '}] ${content}`);
        break;
      case 'bullet':
        lines.push(`- ${content}`);
        break;
      case 'numbered':
        lines.push(`1. ${content}`);
        break;
      case 'quote':
        lines.push(`> ${content}`);
        break;
      case 'callout': {
        const icon = block.calloutIcon || '💡';
        lines.push(`> ${icon} ${content}`);
        break;
      }
      case 'divider':
        lines.push('---');
        break;
      case 'code': {
        const lang = block.language || '';
        lines.push('```' + lang);
        lines.push(content);
        lines.push('```');
        break;
      }
      case 'table': {
        const matrix = block.tableData || [
          ['Header 1', 'Header 2', 'Header 3'],
          ['Cell 1', 'Cell 2', 'Cell 3'],
        ];
        if (matrix.length > 0) {
          const header = matrix[0];
          lines.push(`| ${header.join(' | ')} |`);
          lines.push(`| ${header.map(() => '---').join(' | ')} |`);
          for (let r = 1; r < matrix.length; r++) {
            lines.push(`| ${matrix[r].join(' | ')} |`);
          }
        }
        break;
      }
      default:
        lines.push(content);
        break;
    }
    // Add empty line between blocks for standard markdown separation (except lists)
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Deserializes a Markdown string into an array of EditorBlock objects.
 */
export function markdownToBlocks(markdown: string): EditorBlock[] {
  if (!markdown || !markdown.trim()) {
    return [
      {
        id: createId(),
        type: 'paragraph',
        content: '',
      },
    ];
  }

  const rawLines = markdown.split(/\r?\n/);
  const blocks: EditorBlock[] = [];
  let inCode = false;
  let codeLang = '';
  let codeBuffer: string[] = [];

  let inTable = false;
  let tableRows: string[][] = [];

  const flushCode = () => {
    if (inCode) {
      blocks.push({
        id: createId(),
        type: 'code',
        content: codeBuffer.join('\n'),
        language: codeLang || 'typescript',
      });
      inCode = false;
      codeLang = '';
      codeBuffer = [];
    }
  };

  const flushTable = () => {
    if (inTable) {
      if (tableRows.length > 0) {
        blocks.push({
          id: createId(),
          type: 'table',
          content: '',
          tableData: tableRows,
        });
      }
      inTable = false;
      tableRows = [];
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Code block toggle
    if (trimmed.startsWith('```')) {
      if (inCode) {
        flushCode();
      } else {
        flushTable();
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        codeBuffer = [];
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Table detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Check if it's separator row like | --- | --- |
      const isSep = trimmed
        .slice(1, -1)
        .split('|')
        .every((cell) => cell.trim().match(/^:?-+:?$/));

      if (isSep) {
        continue;
      }

      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      tableRows.push(cells);
      inTable = true;
      continue;
    } else {
      flushTable();
    }

    if (!trimmed) {
      // Empty line - ignore or treat as spacer
      continue;
    }

    // Divider
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      blocks.push({
        id: createId(),
        type: 'divider',
        content: '',
      });
      continue;
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      blocks.push({
        id: createId(),
        type: 'h1',
        content: trimmed.slice(2).trim(),
      });
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({
        id: createId(),
        type: 'h2',
        content: trimmed.slice(3).trim(),
      });
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push({
        id: createId(),
        type: 'h3',
        content: trimmed.slice(4).trim(),
      });
      continue;
    }

    // Todo / Checkbox
    const todoMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.*)$/);
    if (todoMatch) {
      blocks.push({
        id: createId(),
        type: 'todo',
        checked: todoMatch[1].toLowerCase() === 'x',
        content: todoMatch[2].trim(),
      });
      continue;
    }

    // Bullet list
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({
        id: createId(),
        type: 'bullet',
        content: trimmed.slice(2).trim(),
      });
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^\d+\.\s*(.*)$/);
    if (numMatch) {
      blocks.push({
        id: createId(),
        type: 'numbered',
        content: numMatch[1].trim(),
      });
      continue;
    }

    // Callout / Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.slice(2).trim();
      // Check for emoji callout prefix
      const emojiMatch = quoteText.match(/^([\p{Emoji}\u200d]+)\s*(.*)$/u);
      if (emojiMatch) {
        blocks.push({
          id: createId(),
          type: 'callout',
          calloutIcon: emojiMatch[1],
          content: emojiMatch[2].trim(),
        });
      } else {
        blocks.push({
          id: createId(),
          type: 'quote',
          content: quoteText,
        });
      }
      continue;
    }

    // Fallback: Paragraph
    blocks.push({
      id: createId(),
      type: 'paragraph',
      content: line,
    });
  }

  flushCode();
  flushTable();

  if (blocks.length === 0) {
    blocks.push({
      id: createId(),
      type: 'paragraph',
      content: '',
    });
  }

  return blocks;
}

/**
 * Downloads text content as a file in the browser.
 */
export function downloadMarkdownFile(filename: string, content: string): void {
  if (typeof window === 'undefined') return;
  const cleanName =
    filename
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document';
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${cleanName}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
