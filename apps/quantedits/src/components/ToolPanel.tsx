// ============================================================================
// QuantEdits - Tool Panel Component
// Editing tools: crop, resize, filters, text, shapes
// ============================================================================

interface ToolPanelProps {
  activeTool: string;
  onSelectTool: (tool: string) => void;
  onToolAction: (action: string, params: Record<string, unknown>) => void;
}

interface Tool { id: string; name: string; icon: string; shortcut: string; group: string; }

const TOOLS: Tool[] = [
  { id: 'select', name: 'Select', icon: 'cursor', shortcut: 'V', group: 'basic' },
  { id: 'move', name: 'Move', icon: 'move', shortcut: 'M', group: 'basic' },
  { id: 'text', name: 'Text', icon: 'type', shortcut: 'T', group: 'create' },
  { id: 'shape', name: 'Shape', icon: 'square', shortcut: 'U', group: 'create' },
  { id: 'pen', name: 'Pen', icon: 'pen', shortcut: 'P', group: 'create' },
  { id: 'brush', name: 'Brush', icon: 'brush', shortcut: 'B', group: 'paint' },
  { id: 'eraser', name: 'Eraser', icon: 'eraser', shortcut: 'E', group: 'paint' },
  { id: 'crop', name: 'Crop', icon: 'crop', shortcut: 'C', group: 'transform' },
  { id: 'resize', name: 'Resize', icon: 'maximize', shortcut: 'R', group: 'transform' },
  { id: 'hand', name: 'Hand', icon: 'hand', shortcut: 'H', group: 'navigate' },
  { id: 'zoom', name: 'Zoom', icon: 'zoom', shortcut: 'Z', group: 'navigate' },
  { id: 'eyedropper', name: 'Eyedropper', icon: 'eyedropper', shortcut: 'I', group: 'utility' },
];

export function ToolPanel({ activeTool, onSelectTool, onToolAction }: ToolPanelProps) {
  const groups = [...new Set(TOOLS.map(t => t.group))];

  return {
    type: 'div',
    className: 'tool-panel',
    children: groups.map(group => ({
      type: 'div',
      className: 'tool-group',
      children: [
        { type: 'div', className: 'group-divider' },
        ...TOOLS.filter(t => t.group === group).map(tool => ({
          type: 'button',
          className: `tool-btn ${tool.id === activeTool ? 'active' : ''}`,
          title: `${tool.name} (${tool.shortcut})`,
          onClick: () => onSelectTool(tool.id),
          children: [{ type: 'span', className: `icon icon-${tool.icon}` }],
        })),
      ],
    })),
  };
}

export default ToolPanel;
