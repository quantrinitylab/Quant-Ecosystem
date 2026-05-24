// ============================================================================
// QuantAI - Automation Workflow Builder Page
// ============================================================================

import type { Automation } from '../types';

interface AutomationPageProps { automations: Automation[]; onCreateAutomation: () => void; onEditAutomation: (id: string) => void; onDeleteAutomation: (id: string) => void; onToggleAutomation: (id: string) => void; onExecuteAutomation: (id: string) => void; }

export function AutomationPage({ automations, onCreateAutomation, onEditAutomation, onDeleteAutomation, onToggleAutomation, onExecuteAutomation }: AutomationPageProps) {
  return { type: 'div', className: 'automation-page', children: [
    { type: 'header', children: [{ type: 'h1', text: 'Automations' }, { type: 'button', text: '+ New Automation', onClick: onCreateAutomation }] },
    { type: 'div', className: 'automations-grid', children: automations.map(a => ({
      type: 'div', className: `automation-card ${a.isActive ? 'active' : 'inactive'}`, children: [
        { type: 'div', className: 'card-header', children: [{ type: 'h3', text: a.name }, { type: 'button', text: a.isActive ? 'ON' : 'OFF', onClick: () => onToggleAutomation(a.id), className: 'toggle' }] },
        { type: 'p', text: a.description },
        { type: 'div', className: 'trigger-info', text: `Trigger: ${a.trigger.type}` },
        { type: 'div', className: 'stats', children: [{ type: 'span', text: `${a.executionCount} runs` }, a.lastExecuted ? { type: 'span', text: `Last: ${new Date(a.lastExecuted).toLocaleDateString()}` } : null] },
        { type: 'div', className: 'actions', children: [
          { type: 'button', text: 'Run', onClick: () => onExecuteAutomation(a.id) },
          { type: 'button', text: 'Edit', onClick: () => onEditAutomation(a.id) },
          { type: 'button', text: 'Delete', onClick: () => onDeleteAutomation(a.id), className: 'danger' },
        ]},
      ],
    }))},
  ]};
}

export default AutomationPage;
