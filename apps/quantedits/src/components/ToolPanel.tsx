// ============================================================================
// QuantEdits - Tool Panel Component
// Editing tools: crop, resize, filters, text, shapes
// ============================================================================

interface ToolPanelProps {
  activeTool: string;
  onSelectTool: (tool: string) => void;
  onToolAction: (action: string, params: Record<string, unknown>) => void;
}

interface Tool {
  id: string;
  name: string;
  icon: string;
  shortcut: string;
  group: string;
}

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

export function ToolPanel({
  activeTool,
  onSelectTool,
  // TODO: wire up handler
  onToolAction: _onToolAction,
}: ToolPanelProps) {
  const groups = [...new Set(TOOLS.map((t) => t.group))];

  return (
    <nav className="flex flex-col gap-1 p-2 bg-gray-900 text-white" aria-label="Editing tools">
      {groups.map((group) => (
        <div key={group} className="flex flex-col" role="group" aria-label={`${group} tools`}>
          <div className="h-px bg-gray-700 my-1" aria-hidden="true" />
          {TOOLS.filter((t) => t.group === group).map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelectTool(tool.id)}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded ${
                tool.id === activeTool
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-700 text-gray-300'
              }`}
              title={`${tool.name} (${tool.shortcut})`}
              aria-label={`${tool.name} tool`}
              aria-pressed={tool.id === activeTool}
            >
              <span className="text-sm" aria-hidden="true">
                {tool.shortcut}
              </span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default ToolPanel;
