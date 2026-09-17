// ============================================================================
// QuantDrive Document Editor — Types & Interfaces
// Adheres to Gates N-G1 through N-G5 in PHASE_N_COLLABORATION_MEMO.md
// ============================================================================

export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'todo'
  | 'bullet'
  | 'numbered'
  | 'code'
  | 'quote'
  | 'callout'
  | 'table'
  | 'divider';

export interface EditorBlock {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  language?: string;
  calloutIcon?: string;
  calloutTone?: 'default' | 'info' | 'warning' | 'success' | 'danger';
  tableData?: string[][]; // Row x Col matrix
}

export interface DocumentCollaborator {
  clientId: string;
  userId?: string;
  name: string;
  color: string;
  cursorBlockId?: string;
  lastActive: number;
}

export type SyncStatus = 'connected' | 'saving' | 'saved' | 'offline' | 'error';

export interface DocumentMetadata {
  icon?: string;
  coverImage?: string;
  fullWidth?: boolean;
  tags?: string[];
  blocks?: EditorBlock[];
  [key: string]: unknown;
}

export interface DocumentData {
  id: string;
  title: string;
  content: string;
  metadata: DocumentMetadata;
  userId: string;
  isPublic: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
  collaborators?: Array<{
    id: string;
    userId: string;
    role: string;
    user?: {
      id: string;
      email: string;
      displayName?: string;
    };
  }>;
}

export interface SlashCommandOption {
  id: BlockType;
  title: string;
  description: string;
  icon: string;
  badge?: string;
  keywords: string[];
}
