// ============================================================================
// QuantAI - Workflow Builder Component
// Visual automation workflow designer
// ============================================================================

import type { AutomationTriggerConfig, AutomationAction } from '../types';

interface WorkflowBuilderProps { trigger: AutomationTriggerConfig | null; actions: AutomationAction[]; onSetTrigger: (trigger: AutomationTriggerConfig) => void; onAddAction: (action: AutomationAction) => void; onRemoveAction: (id: string) => void; onReorderActions: (ids: string[]) => void; }

export function WorkflowBuilder({ trigger, actions, onSetTrigger, onAddAction, onRemoveAction, onReorderActions }: WorkflowBuilderProps) {
  return { type: 'div', className: 'workflow-builder', children: [
    { type: 'div', className: 'workflow-canvas', children: [
      // Trigger node
      { type: 'div', className: `workflow-node trigger ${trigger ? 'configured' : 'empty'}`, children: [
        { type: 'span', className: 'node-icon', text: 'T' },
        { type: 'span', text: trigger ? `When: ${trigger.type}` : 'Add Trigger' },
      ]},
      // Connection line
      { type: 'div', className: 'connector' },
      // Action nodes
      ...actions.map((action, i) => ({
        type: 'div', className: 'workflow-node action', children: [
          { type: 'span', className: 'node-number', text: String(i + 1) },
          { type: 'span', text: `${action.type}${action.app ? ` (${action.app})` : ''}` },
          { type: 'button', text: 'X', onClick: () => onRemoveAction(action.id), className: 'remove-btn' },
          i < actions.length - 1 ? { type: 'div', className: 'connector' } : null,
        ],
      })),
      // Add action button
      { type: 'div', className: 'connector' },
      { type: 'button', className: 'add-action-btn', text: '+ Add Action' },
    ]},
  ]};
}

export default WorkflowBuilder;
