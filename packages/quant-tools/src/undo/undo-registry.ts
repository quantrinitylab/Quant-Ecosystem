import type { UndoAction, UndoRecipe } from '../types.js';

export class UndoRegistry {
  private actions: Map<string, UndoAction> = new Map();

  recordAction(executionId: string, recipe: UndoRecipe): void {
    const now = Date.now();
    this.actions.set(executionId, {
      executionId,
      recipe,
      createdAt: now,
      expiresAt: now + recipe.ttlMs,
      executed: false,
    });
  }

  canUndo(executionId: string): boolean {
    const action = this.actions.get(executionId);
    if (!action) return false;
    if (action.executed) return false;
    if (Date.now() > action.expiresAt) return false;
    return true;
  }

  executeUndo(executionId: string): UndoAction | null {
    const action = this.actions.get(executionId);
    if (!action) return null;
    if (action.executed) return null;
    if (Date.now() > action.expiresAt) return null;

    action.executed = true;
    return { ...action };
  }

  getHistory(): UndoAction[] {
    return [...this.actions.values()];
  }
}
