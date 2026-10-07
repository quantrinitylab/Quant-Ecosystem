// ============================================================================
// @quant/shared-ui - Advanced Rich Text Editor Engine
// ============================================================================

import {
  EditorState,
  EditorNode,
  NodeType,
  InlineFormat,
  EditorCommand,
  SelectionState,
  CursorPosition,
} from './types';

interface MarkdownShortcut {
  trigger: string;
  nodeType: NodeType;
  attrs?: Record<string, any>;
}

type EditorListener = (state: EditorState) => void;
type MentionSearchHandler = (query: string) => Array<{ id: string; label: string }>;

export class RichTextEditor {
  private state: EditorState;
  private listeners: Set<EditorListener> = new Set();
  private mentionHandler: MentionSearchHandler | null = null;
  private markdownShortcuts: MarkdownShortcut[];
  private nodeIdCounter: number = 0;
  private maxHistorySize: number = 100;

  constructor(initialContent?: EditorNode) {
    this.state = {
      document: initialContent || this.createDefaultDocument(),
      selection: {
        anchor: { nodeId: '', offset: 0 },
        focus: { nodeId: '', offset: 0 },
        isCollapsed: true,
      },
      history: {
        undoStack: [],
        redoStack: [],
        maxSize: this.maxHistorySize,
      },
      isComposing: false,
    };

    // Initialize first node ID in selection
    if (this.state.document.children && this.state.document.children.length > 0) {
      const firstChild = this.state.document.children[0]!;
      if (firstChild.id) {
        this.state.selection.anchor.nodeId = firstChild.id;
        this.state.selection.focus.nodeId = firstChild.id;
      }
    }

    this.markdownShortcuts = [
      { trigger: '# ', nodeType: 'heading', attrs: { level: 1 } },
      { trigger: '## ', nodeType: 'heading', attrs: { level: 2 } },
      { trigger: '### ', nodeType: 'heading', attrs: { level: 3 } },
      { trigger: '- ', nodeType: 'list', attrs: { ordered: false } },
      { trigger: '1. ', nodeType: 'list', attrs: { ordered: true } },
      { trigger: '> ', nodeType: 'blockquote' },
      { trigger: '```', nodeType: 'code-block' },
      { trigger: '---', nodeType: 'divider' },
    ];
  }

  // Create default empty document
  private createDefaultDocument(): EditorNode {
    return {
      type: 'document',
      id: this.generateId(),
      children: [
        {
          type: 'paragraph',
          id: this.generateId(),
          children: [{ type: 'text', text: '', id: this.generateId() }],
        },
      ],
    };
  }

  private generateId(): string {
    return `node_${++this.nodeIdCounter}`;
  }

  // Insert text at current selection
  insertText(text: string): void {
    const command: EditorCommand = {
      type: 'insertText',
      data: { text, position: { ...this.state.selection.anchor } },
    };

    this.pushHistory(command);
    this.applyInsertText(text);

    // Check markdown shortcuts
    this.checkMarkdownShortcuts(text);
    this.notifyListeners();
  }

  private applyInsertText(text: string): void {
    const { nodeId, offset } = this.state.selection.anchor;
    const node = this.findNode(nodeId);
    if (!node || node.type !== 'text') return;

    const currentText = node.text || '';
    node.text = currentText.slice(0, offset) + text + currentText.slice(offset);

    // Update selection
    const newOffset = offset + text.length;
    this.state.selection = {
      anchor: { nodeId, offset: newOffset },
      focus: { nodeId, offset: newOffset },
      isCollapsed: true,
    };
  }

  // Delete text at current position
  deleteText(direction: 'forward' | 'backward', count: number = 1): void {
    const { nodeId, offset } = this.state.selection.anchor;
    const node = this.findNode(nodeId);
    if (!node || node.type !== 'text') return;

    const currentText = node.text || '';
    let newText: string;
    let newOffset: number;

    if (direction === 'backward') {
      const deleteFrom = Math.max(0, offset - count);
      newText = currentText.slice(0, deleteFrom) + currentText.slice(offset);
      newOffset = deleteFrom;
    } else {
      newText = currentText.slice(0, offset) + currentText.slice(offset + count);
      newOffset = offset;
    }

    const command: EditorCommand = {
      type: 'deleteText',
      data: {
        direction,
        count,
        text: currentText.slice(
          direction === 'backward' ? offset - count : offset,
          direction === 'backward' ? offset : offset + count,
        ),
        position: { nodeId, offset },
      },
    };
    this.pushHistory(command);

    node.text = newText;
    this.state.selection = {
      anchor: { nodeId, offset: newOffset },
      focus: { nodeId, offset: newOffset },
      isCollapsed: true,
    };

    // If node is empty, potentially merge with adjacent
    if (newText === '' && direction === 'backward') {
      this.mergeWithPreviousBlock(nodeId);
    }

    this.notifyListeners();
  }

  // Toggle inline format
  toggleFormat(format: InlineFormat): void {
    const { anchor, focus, isCollapsed } = this.state.selection;
    if (isCollapsed) return; // Need selection to format

    const command: EditorCommand = {
      type: 'toggleFormat',
      data: { format, anchor: { ...anchor }, focus: { ...focus } },
    };
    this.pushHistory(command);

    // Find all text nodes in selection range and toggle format
    const textNodes = this.getTextNodesInRange(anchor, focus);
    for (const node of textNodes) {
      if (!node.format) node.format = [];
      const index = node.format.indexOf(format);
      if (index >= 0) {
        node.format.splice(index, 1);
      } else {
        node.format.push(format);
      }
    }

    this.notifyListeners();
  }

  // Check if format is active at selection
  isFormatActive(format: InlineFormat): boolean {
    const { anchor } = this.state.selection;
    const node = this.findNode(anchor.nodeId);
    if (!node) return false;
    return (node.format || []).includes(format);
  }

  // Set block type (heading, paragraph, etc.)
  setBlockType(type: NodeType, attrs?: Record<string, any>): void {
    const { nodeId } = this.state.selection.anchor;
    const block = this.findParentBlock(nodeId);
    if (!block) return;

    const command: EditorCommand = {
      type: 'setBlockType',
      data: { nodeId: block.id, fromType: block.type, toType: type, attrs },
    };
    this.pushHistory(command);

    block.type = type;
    if (attrs) block.attrs = { ...block.attrs, ...attrs };

    this.notifyListeners();
  }

  // Insert a new block after current
  insertBlock(type: NodeType, attrs?: Record<string, any>): EditorNode {
    const { nodeId } = this.state.selection.anchor;
    const parentBlock = this.findParentBlock(nodeId);
    const document = this.state.document;

    const newBlock: EditorNode = {
      type,
      id: this.generateId(),
      attrs,
      children:
        type === 'divider' ? undefined : [{ type: 'text', text: '', id: this.generateId() }],
    };

    if (document.children) {
      const blockIndex = document.children.findIndex((n) => n.id === parentBlock?.id);
      if (blockIndex >= 0) {
        document.children.splice(blockIndex + 1, 0, newBlock);
      } else {
        document.children.push(newBlock);
      }
    }

    // Move selection to new block
    if (newBlock.children && newBlock.children[0]) {
      this.state.selection = {
        anchor: { nodeId: newBlock.children[0].id!, offset: 0 },
        focus: { nodeId: newBlock.children[0].id!, offset: 0 },
        isCollapsed: true,
      };
    }

    const command: EditorCommand = { type: 'insertBlock', data: { block: newBlock } };
    this.pushHistory(command);
    this.notifyListeners();
    return newBlock;
  }

  // Insert link
  insertLink(url: string, text?: string): void {
    const linkNode: EditorNode = {
      type: 'link',
      id: this.generateId(),
      text: text || url,
      attrs: { href: url },
    };

    const { nodeId } = this.state.selection.anchor;
    const parent = this.findParentBlock(nodeId);
    if (parent && parent.children) {
      const index = parent.children.findIndex((n) => n.id === nodeId);
      if (index >= 0) {
        parent.children.splice(index + 1, 0, linkNode);
      }
    }

    this.pushHistory({ type: 'insertLink', data: { url, text } });
    this.notifyListeners();
  }

  // Insert mention
  insertMention(id: string, label: string): void {
    const mentionNode: EditorNode = {
      type: 'mention',
      id: this.generateId(),
      text: `@${label}`,
      attrs: { userId: id, label },
    };

    const { nodeId } = this.state.selection.anchor;
    const parent = this.findParentBlock(nodeId);
    if (parent && parent.children) {
      const index = parent.children.findIndex((n) => n.id === nodeId);
      if (index >= 0) {
        parent.children.splice(index + 1, 0, mentionNode);
      }
    }

    this.pushHistory({ type: 'insertMention', data: { id, label } });
    this.notifyListeners();
  }

  // Insert embed (image, video, tweet)
  insertEmbed(type: 'image' | 'video' | 'tweet', url: string, attrs?: Record<string, any>): void {
    const embedNode: EditorNode = {
      type: 'embed',
      id: this.generateId(),
      attrs: { embedType: type, url, ...attrs },
    };

    this.insertNodeAfterCurrent(embedNode);
    this.pushHistory({ type: 'insertEmbed', data: { type, url, attrs } });
    this.notifyListeners();
  }

  // Check for markdown shortcuts
  private checkMarkdownShortcuts(_insertedText: string): void {
    const { nodeId } = this.state.selection.anchor;
    const node = this.findNode(nodeId);
    if (!node || node.type !== 'text') return;

    const text = node.text || '';
    for (const shortcut of this.markdownShortcuts) {
      if (text === shortcut.trigger || text.startsWith(shortcut.trigger)) {
        // Transform block type
        const block = this.findParentBlock(nodeId);
        if (block && block.type === 'paragraph') {
          block.type = shortcut.nodeType;
          if (shortcut.attrs) block.attrs = shortcut.attrs;
          // Remove trigger text
          node.text = text.slice(shortcut.trigger.length);
          this.state.selection.anchor.offset = 0;
          this.state.selection.focus.offset = 0;
        }
        break;
      }
    }
  }

  // Undo last action
  undo(): void {
    const { undoStack, redoStack } = this.state.history;
    if (undoStack.length === 0) return;

    const command = undoStack.pop()!;
    redoStack.push(command);
    this.applyInverse(command);
    this.notifyListeners();
  }

  // Redo last undone action
  redo(): void {
    const { undoStack, redoStack } = this.state.history;
    if (redoStack.length === 0) return;

    const command = redoStack.pop()!;
    undoStack.push(command);
    this.applyCommand(command);
    this.notifyListeners();
  }

  // Push command to history
  private pushHistory(command: EditorCommand): void {
    this.state.history.undoStack.push(command);
    this.state.history.redoStack = []; // Clear redo on new action
    if (this.state.history.undoStack.length > this.maxHistorySize) {
      this.state.history.undoStack.shift();
    }
  }

  // Apply command (for redo)
  private applyCommand(command: EditorCommand): void {
    switch (command.type) {
      case 'insertText':
        this.state.selection.anchor = command.data.position;
        this.state.selection.focus = command.data.position;
        this.applyInsertText(command.data.text);
        break;
      case 'toggleFormat':
        this.state.selection = {
          anchor: command.data.anchor,
          focus: command.data.focus,
          isCollapsed: false,
        };
        this.toggleFormat(command.data.format);
        break;
    }
  }

  // Apply inverse of command (for undo)
  private applyInverse(command: EditorCommand): void {
    switch (command.type) {
      case 'insertText':
        const pos = command.data.position;
        this.state.selection.anchor = {
          nodeId: pos.nodeId,
          offset: pos.offset + command.data.text.length,
        };
        this.state.selection.focus = this.state.selection.anchor;
        this.deleteText('backward', command.data.text.length);
        break;
      case 'deleteText':
        this.state.selection.anchor = command.data.position;
        if (command.data.direction === 'backward') {
          this.state.selection.anchor.offset -= command.data.count;
        }
        this.state.selection.focus = this.state.selection.anchor;
        this.applyInsertText(command.data.text);
        break;
    }
  }

  // Serialize to JSON
  toJSON(): any {
    return JSON.parse(JSON.stringify(this.state.document));
  }

  // Serialize to Markdown
  toMarkdown(): string {
    return this.nodeToMarkdown(this.state.document);
  }

  private nodeToMarkdown(node: EditorNode): string {
    if (node.type === 'text') {
      let text = node.text || '';
      if (node.format) {
        if (node.format.includes('bold')) text = `**${text}**`;
        if (node.format.includes('italic')) text = `*${text}*`;
        if (node.format.includes('code')) text = `\`${text}\``;
        if (node.format.includes('strikethrough')) text = `~~${text}~~`;
      }
      return text;
    }

    const childrenMd = (node.children || []).map((c) => this.nodeToMarkdown(c)).join('');

    switch (node.type) {
      case 'document':
        return childrenMd;
      case 'paragraph':
        return childrenMd + '\n\n';
      case 'heading': {
        const level = node.attrs?.level || 1;
        return '#'.repeat(level) + ' ' + childrenMd + '\n\n';
      }
      case 'blockquote':
        return '> ' + childrenMd + '\n\n';
      case 'code-block':
        return '```\n' + childrenMd + '\n```\n\n';
      case 'list':
        return childrenMd;
      case 'list-item': {
        const ordered = node.attrs?.ordered;
        return (ordered ? '1. ' : '- ') + childrenMd + '\n';
      }
      case 'link':
        return `[${node.text || ''}](${node.attrs?.href || ''})`;
      case 'mention':
        return node.text || '';
      case 'divider':
        return '---\n\n';
      case 'image':
        return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})\n\n`;
      default:
        return childrenMd;
    }
  }

  // Serialize to HTML
  toHTML(): string {
    return this.nodeToHTML(this.state.document);
  }

  private nodeToHTML(node: EditorNode): string {
    if (node.type === 'text') {
      let html = this.escapeHtml(node.text || '');
      if (node.format) {
        if (node.format.includes('bold')) html = `<strong>${html}</strong>`;
        if (node.format.includes('italic')) html = `<em>${html}</em>`;
        if (node.format.includes('underline')) html = `<u>${html}</u>`;
        if (node.format.includes('strikethrough')) html = `<del>${html}</del>`;
        if (node.format.includes('code')) html = `<code>${html}</code>`;
      }
      return html;
    }

    const childrenHtml = (node.children || []).map((c) => this.nodeToHTML(c)).join('');

    switch (node.type) {
      case 'document':
        return childrenHtml;
      case 'paragraph':
        return `<p>${childrenHtml}</p>`;
      case 'heading':
        return `<h${node.attrs?.level || 1}>${childrenHtml}</h${node.attrs?.level || 1}>`;
      case 'blockquote':
        return `<blockquote>${childrenHtml}</blockquote>`;
      case 'code-block':
        return `<pre><code>${childrenHtml}</code></pre>`;
      case 'list': {
        const tag = node.attrs?.ordered ? 'ol' : 'ul';
        return `<${tag}>${childrenHtml}</${tag}>`;
      }
      case 'list-item':
        return `<li>${childrenHtml}</li>`;
      case 'link':
        return `<a href="${node.attrs?.href || ''}">${node.text || childrenHtml}</a>`;
      case 'mention':
        return `<span class="mention" data-id="${node.attrs?.userId}">${node.text}</span>`;
      case 'embed':
        return `<div class="embed" data-type="${node.attrs?.embedType}" data-url="${node.attrs?.url}"></div>`;
      case 'divider':
        return '<hr>';
      case 'image':
        return `<img src="${node.attrs?.src}" alt="${node.attrs?.alt || ''}">`;
      default:
        return childrenHtml;
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Normalize document (merge adjacent text nodes, remove empty)
  normalize(): void {
    this.normalizeNode(this.state.document);
    this.notifyListeners();
  }

  private normalizeNode(node: EditorNode): void {
    if (!node.children) return;

    // Remove empty text nodes
    node.children = node.children.filter((child) => {
      if (child.type === 'text' && (child.text === '' || child.text === undefined)) {
        // Keep at least one text node per block
        return node.children!.filter((c) => c.type === 'text').length <= 1;
      }
      return true;
    });

    // Merge adjacent text nodes with same format
    for (let i = node.children.length - 1; i > 0; i--) {
      const current = node.children[i]!;
      const previous = node.children[i - 1]!;
      if (
        current.type === 'text' &&
        previous.type === 'text' &&
        this.formatsEqual(current.format, previous.format)
      ) {
        previous.text = (previous.text || '') + (current.text || '');
        node.children.splice(i, 1);
      }
    }

    // Recurse
    for (const child of node.children) {
      this.normalizeNode(child);
    }
  }

  private formatsEqual(a?: InlineFormat[], b?: InlineFormat[]): boolean {
    const aSet = new Set(a || []);
    const bSet = new Set(b || []);
    if (aSet.size !== bSet.size) return false;
    for (const item of aSet) if (!bSet.has(item)) return false;
    return true;
  }

  // Find node by ID
  private findNode(nodeId: string, root?: EditorNode): EditorNode | null {
    const searchRoot = root || this.state.document;
    if (searchRoot.id === nodeId) return searchRoot;
    if (searchRoot.children) {
      for (const child of searchRoot.children) {
        const found = this.findNode(nodeId, child);
        if (found) return found;
      }
    }
    return null;
  }

  // Find parent block of a node
  private findParentBlock(nodeId: string): EditorNode | null {
    return this.findParentBlockRecursive(nodeId, this.state.document);
  }

  private findParentBlockRecursive(nodeId: string, parent: EditorNode): EditorNode | null {
    if (!parent.children) return null;
    for (const child of parent.children) {
      if (child.id === nodeId) return parent;
      const found = this.findParentBlockRecursive(nodeId, child);
      if (found) return found;
    }
    return null;
  }

  // Get text nodes in selection range
  private getTextNodesInRange(anchor: CursorPosition, focus: CursorPosition): EditorNode[] {
    const nodes: EditorNode[] = [];
    this.collectTextNodes(this.state.document, nodes);
    // For simplicity, return all text nodes between anchor and focus
    const anchorIdx = nodes.findIndex((n) => n.id === anchor.nodeId);
    const focusIdx = nodes.findIndex((n) => n.id === focus.nodeId);
    const start = Math.min(anchorIdx, focusIdx);
    const end = Math.max(anchorIdx, focusIdx);
    return nodes.slice(start, end + 1);
  }

  private collectTextNodes(node: EditorNode, result: EditorNode[]): void {
    if (node.type === 'text') result.push(node);
    if (node.children) {
      for (const child of node.children) this.collectTextNodes(child, result);
    }
  }

  // Insert node after current selection
  private insertNodeAfterCurrent(newNode: EditorNode): void {
    const { nodeId } = this.state.selection.anchor;
    const parent = this.findParentBlock(nodeId);
    const doc = this.state.document;
    if (doc.children) {
      const idx = doc.children.findIndex((n) => n.id === parent?.id);
      if (idx >= 0) {
        doc.children.splice(idx + 1, 0, newNode);
      } else {
        doc.children.push(newNode);
      }
    }
  }

  // Merge with previous block (on backspace at start)
  private mergeWithPreviousBlock(nodeId: string): void {
    const doc = this.state.document;
    if (!doc.children) return;
    const block = this.findParentBlock(nodeId);
    if (!block || block === doc) return;
    const blockIndex = doc.children.indexOf(block);
    if (blockIndex <= 0) return;
    // Merge not performed for simplicity in this engine
  }

  // Set mention search handler
  setMentionHandler(handler: MentionSearchHandler): void {
    this.mentionHandler = handler;
  }

  // Search mentions
  searchMentions(query: string): Array<{ id: string; label: string }> {
    if (!this.mentionHandler) return [];
    return this.mentionHandler(query);
  }

  // Get editor state
  getState(): EditorState {
    return this.state;
  }

  // Set selection
  setSelection(selection: SelectionState): void {
    this.state.selection = selection;
    this.notifyListeners();
  }

  // Subscribe to state changes
  subscribe(listener: EditorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  // Get word count
  getWordCount(): number {
    const text = this.getPlainText();
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }

  // Get plain text content
  getPlainText(): string {
    return this.extractText(this.state.document);
  }

  private extractText(node: EditorNode): string {
    if (node.type === 'text') return node.text || '';
    if (!node.children) return '';
    return node.children.map((c) => this.extractText(c)).join('');
  }

  destroy(): void {
    this.listeners.clear();
    this.mentionHandler = null;
  }
}

export default RichTextEditor;
