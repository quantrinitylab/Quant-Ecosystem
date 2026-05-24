// ============================================================================
// QuantEdits - Collaboration Controller
// Business logic for real-time collaboration features
// ============================================================================

import type { Collaborator, Comment } from '../../src/types';

export class CollaborationController {
  canEdit(collaborator: Collaborator): boolean {
    return collaborator.role === 'owner' || collaborator.role === 'editor';
  }

  canComment(collaborator: Collaborator): boolean {
    return collaborator.role !== 'viewer';
  }

  validateInvite(email: string, role: Collaborator['role']): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!email || !email.includes('@')) errors.push('Valid email required');
    if (!['owner', 'editor', 'viewer', 'commenter'].includes(role)) errors.push('Invalid role');
    return { valid: errors.length === 0, errors };
  }
}

export const collaborationController = new CollaborationController();
