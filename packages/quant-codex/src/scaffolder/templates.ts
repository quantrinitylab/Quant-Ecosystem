import type { ProjectTemplate } from '../types.js';

export const gameTemplate: ProjectTemplate = {
  id: 'game-template',
  name: 'HTML5 Canvas Game',
  type: 'game',
  description: 'HTML5 canvas game with game loop, sprite rendering, and input handling',
  files: [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Game</title>
  <style>
    body { margin: 0; overflow: hidden; background: #111; }
    canvas { display: block; margin: 0 auto; }
  </style>
</head>
<body>
  <canvas id="game-canvas" width="800" height="600"></canvas>
  <script type="module" src="./game.ts"></script>
</body>
</html>`,
    },
    {
      path: 'game.ts',
      content: `import { GameState, Entity, InputState } from './types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const state: GameState = {
  entities: [],
  score: 0,
  running: true,
  lastTime: 0,
  deltaTime: 0,
};

const input: InputState = { keys: new Set(), mouseX: 0, mouseY: 0, mouseDown: false };

function createPlayer(): Entity {
  return { id: 'player', x: 400, y: 500, width: 40, height: 40, speed: 300, type: 'player' };
}

function update(dt: number): void {
  for (const entity of state.entities) {
    if (entity.type === 'player') {
      if (input.keys.has('ArrowLeft')) entity.x -= entity.speed * dt;
      if (input.keys.has('ArrowRight')) entity.x += entity.speed * dt;
      entity.x = Math.max(0, Math.min(canvas.width - entity.width, entity.x));
    }
  }
}

function render(): void {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const entity of state.entities) {
    ctx.fillStyle = entity.type === 'player' ? '#0f0' : '#f00';
    ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
  }
  ctx.fillStyle = '#fff';
  ctx.font = '16px monospace';
  ctx.fillText('Score: ' + state.score, 10, 24);
}

function gameLoop(timestamp: number): void {
  state.deltaTime = (timestamp - state.lastTime) / 1000;
  state.lastTime = timestamp;
  if (state.running) {
    update(state.deltaTime);
    render();
  }
  requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => input.keys.add(e.key));
document.addEventListener('keyup', (e) => input.keys.delete(e.key));

state.entities.push(createPlayer());
requestAnimationFrame(gameLoop);
`,
    },
    {
      path: 'types.ts',
      content: `export interface Entity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  type: 'player' | 'enemy' | 'projectile' | 'powerup';
}

export interface GameState {
  entities: Entity[];
  score: number;
  running: boolean;
  lastTime: number;
  deltaTime: number;
}

export interface InputState {
  keys: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
}
`,
    },
    {
      path: 'README.md',
      content: `# Game Project

An HTML5 canvas game built with TypeScript.

## Running

\`\`\`bash
npm run dev
\`\`\`

## Controls

- Arrow keys to move
- Space to shoot
`,
    },
  ],
  dependencies: {
    typescript: '^5.5.0',
    vite: '^5.0.0',
  },
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  },
};

export const appTemplate: ProjectTemplate = {
  id: 'app-template',
  name: 'React SPA',
  type: 'app',
  description: 'React single-page application with TypeScript and Vite',
  files: [
    {
      path: 'App.tsx',
      content: `import React, { useState } from 'react';
import type { AppState } from './types';

const initialState: AppState = {
  theme: 'light',
  user: null,
  loading: false,
};

export function App(): React.ReactElement {
  const [state, setState] = useState<AppState>(initialState);

  const toggleTheme = () => {
    setState((prev) => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light',
    }));
  };

  return (
    <div className={\`app \${state.theme}\`}>
      <header>
        <h1>Quant App</h1>
        <button onClick={toggleTheme}>Toggle Theme</button>
      </header>
      <main>
        {state.loading ? <p>Loading...</p> : <p>Welcome to your app!</p>}
      </main>
    </div>
  );
}
`,
    },
    {
      path: 'index.tsx',
      content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
`,
    },
    {
      path: 'types.ts',
      content: `export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AppState {
  theme: 'light' | 'dark';
  user: User | null;
  loading: boolean;
}
`,
    },
    {
      path: 'package.json',
      content: `{
  "name": "quant-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
`,
    },
  ],
  dependencies: {
    react: '^18.3.0',
    'react-dom': '^18.3.0',
    typescript: '^5.5.0',
    vite: '^5.0.0',
    '@vitejs/plugin-react': '^4.0.0',
  },
  scripts: {
    dev: 'vite',
    build: 'tsc && vite build',
    preview: 'vite preview',
  },
};

export const toolTemplate: ProjectTemplate = {
  id: 'tool-template',
  name: 'CLI Tool',
  type: 'tool',
  description: 'Command-line tool with argument parsing and structured output',
  files: [
    {
      path: 'cli.ts',
      content: `import { CliConfig, ParsedArgs, Command } from './types';

const commands: Map<string, Command> = new Map();

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { command: '', flags: {}, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        args.flags[key] = next;
        i++;
      } else {
        args.flags[key] = 'true';
      }
    } else if (arg.startsWith('-')) {
      args.flags[arg.slice(1)] = 'true';
    } else if (!args.command) {
      args.command = arg;
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

function registerCommand(name: string, cmd: Command): void {
  commands.set(name, cmd);
}

function run(config: CliConfig): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === 'help') {
    console.log(config.name + ' v' + config.version);
    console.log('Commands: ' + Array.from(commands.keys()).join(', '));
    return;
  }
  const cmd = commands.get(args.command);
  if (!cmd) {
    console.error('Unknown command: ' + args.command);
    process.exit(1);
  }
  cmd.handler(args);
}

registerCommand('version', {
  name: 'version',
  description: 'Print version',
  handler: () => console.log('1.0.0'),
});

export { parseArgs, registerCommand, run };
`,
    },
    {
      path: 'index.ts',
      content: `export { parseArgs, registerCommand, run } from './cli';
export type { CliConfig, ParsedArgs, Command } from './types';
`,
    },
    {
      path: 'types.ts',
      content: `export interface CliConfig {
  name: string;
  version: string;
  description: string;
}

export interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
  positional: string[];
}

export interface Command {
  name: string;
  description: string;
  handler: (args: ParsedArgs) => void;
}
`,
    },
  ],
  dependencies: {
    typescript: '^5.5.0',
    tsx: '^4.0.0',
  },
  scripts: {
    start: 'tsx index.ts',
    build: 'tsc',
    dev: 'tsx watch index.ts',
  },
};

export const agentTemplate: ProjectTemplate = {
  id: 'agent-template',
  name: 'AI Agent',
  type: 'agent',
  description: 'AI agent with message handling, tool use, and configurable behavior',
  files: [
    {
      path: 'agent.ts',
      content: `import { AgentConfig, AgentMessage, AgentResponse, AgentState } from './config';
import { ToolDefinition, executeTool } from './tools';

export class Agent {
  private config: AgentConfig;
  private state: AgentState;
  private tools: Map<string, ToolDefinition>;

  constructor(config: AgentConfig) {
    this.config = config;
    this.state = { conversationHistory: [], turnCount: 0, active: true };
    this.tools = new Map();
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  async handleMessage(message: AgentMessage): Promise<AgentResponse> {
    this.state.conversationHistory.push(message);
    this.state.turnCount++;

    const toolCalls = this.detectToolCalls(message.content);
    const toolResults: string[] = [];

    for (const call of toolCalls) {
      const tool = this.tools.get(call);
      if (tool) {
        const result = await executeTool(tool, {});
        toolResults.push(result);
      }
    }

    return {
      content: this.generateResponse(message, toolResults),
      toolsUsed: toolCalls,
      confidence: 0.85,
    };
  }

  private detectToolCalls(content: string): string[] {
    const calls: string[] = [];
    for (const [name] of this.tools) {
      if (content.toLowerCase().includes(name.toLowerCase())) {
        calls.push(name);
      }
    }
    return calls;
  }

  private generateResponse(message: AgentMessage, toolResults: string[]): string {
    const prefix = this.config.systemPrompt ? '[' + this.config.name + '] ' : '';
    if (toolResults.length > 0) {
      return prefix + 'Executed tools: ' + toolResults.join(', ');
    }
    return prefix + 'Processed: ' + message.content;
  }

  getState(): AgentState {
    return { ...this.state };
  }
}
`,
    },
    {
      path: 'tools.ts',
      content: `export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; required: boolean }>;
}

export async function executeTool(tool: ToolDefinition, params: Record<string, unknown>): Promise<string> {
  // Simulate tool execution
  return tool.name + ':success:' + JSON.stringify(params);
}

export const defaultTools: ToolDefinition[] = [
  {
    name: 'search',
    description: 'Search the knowledge base',
    parameters: { query: { type: 'string', required: true } },
  },
  {
    name: 'calculate',
    description: 'Perform mathematical calculations',
    parameters: { expression: { type: 'string', required: true } },
  },
  {
    name: 'summarize',
    description: 'Summarize a piece of text',
    parameters: { text: { type: 'string', required: true } },
  },
];
`,
    },
    {
      path: 'config.ts',
      content: `export interface AgentConfig {
  name: string;
  model: string;
  systemPrompt: string;
  maxTurns: number;
  temperature: number;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AgentResponse {
  content: string;
  toolsUsed: string[];
  confidence: number;
}

export interface AgentState {
  conversationHistory: AgentMessage[];
  turnCount: number;
  active: boolean;
}

export const defaultConfig: AgentConfig = {
  name: 'QuantAgent',
  model: 'quant-v1',
  systemPrompt: 'You are a helpful AI assistant.',
  maxTurns: 50,
  temperature: 0.7,
};
`,
    },
  ],
  dependencies: {
    typescript: '^5.5.0',
    tsx: '^4.0.0',
  },
  scripts: {
    start: 'tsx agent.ts',
    build: 'tsc',
    dev: 'tsx watch agent.ts',
  },
};

export const lensTemplate: ProjectTemplate = {
  id: 'lens-template',
  name: 'AR/Visual Lens',
  type: 'lens',
  description: 'AR lens with camera access, overlay rendering, and gesture recognition',
  files: [
    {
      path: 'lens.ts',
      content: `import { LensConfig, CameraFrame, Overlay, GestureEvent } from './types';
import { Renderer } from './renderer';

export class Lens {
  private config: LensConfig;
  private renderer: Renderer;
  private overlays: Overlay[] = [];
  private active = false;

  constructor(config: LensConfig) {
    this.config = config;
    this.renderer = new Renderer(config.width, config.height);
  }

  async start(): Promise<void> {
    this.active = true;
    this.renderer.initialize();
  }

  stop(): void {
    this.active = false;
    this.renderer.dispose();
  }

  processFrame(frame: CameraFrame): Overlay[] {
    if (!this.active) return [];
    const detected = this.detectFeatures(frame);
    this.overlays = detected.map((feature) => ({
      id: crypto.randomUUID(),
      x: feature.x,
      y: feature.y,
      width: feature.width,
      height: feature.height,
      type: this.config.overlayType,
      opacity: this.config.opacity,
    }));
    this.renderer.render(this.overlays);
    return this.overlays;
  }

  handleGesture(event: GestureEvent): void {
    if (event.type === 'pinch') {
      this.config.opacity = Math.max(0, Math.min(1, this.config.opacity + event.delta * 0.01));
    } else if (event.type === 'swipe') {
      this.overlays = [];
    }
  }

  private detectFeatures(frame: CameraFrame): Array<{ x: number; y: number; width: number; height: number }> {
    // Simulated feature detection based on frame data
    const features: Array<{ x: number; y: number; width: number; height: number }> = [];
    const gridSize = 4;
    const cellW = frame.width / gridSize;
    const cellH = frame.height / gridSize;
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        if (Math.random() > 0.7) {
          features.push({ x: i * cellW, y: j * cellH, width: cellW, height: cellH });
        }
      }
    }
    return features;
  }

  getConfig(): LensConfig {
    return { ...this.config };
  }

  isActive(): boolean {
    return this.active;
  }
}
`,
    },
    {
      path: 'renderer.ts',
      content: `import { Overlay } from './types';

export class Renderer {
  private width: number;
  private height: number;
  private initialized = false;
  private frameCount = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  initialize(): void {
    this.initialized = true;
    this.frameCount = 0;
  }

  render(overlays: Overlay[]): void {
    if (!this.initialized) return;
    this.frameCount++;
    for (const overlay of overlays) {
      this.drawOverlay(overlay);
    }
  }

  private drawOverlay(overlay: Overlay): void {
    // Simulate rendering an overlay at position
    const _normalized = {
      x: overlay.x / this.width,
      y: overlay.y / this.height,
      w: overlay.width / this.width,
      h: overlay.height / this.height,
      opacity: overlay.opacity,
    };
    // In a real implementation, this would draw to a canvas or GL context
    void _normalized;
  }

  dispose(): void {
    this.initialized = false;
    this.frameCount = 0;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
`,
    },
    {
      path: 'types.ts',
      content: `export interface LensConfig {
  name: string;
  width: number;
  height: number;
  overlayType: 'box' | 'mask' | 'filter' | 'text';
  opacity: number;
  fps: number;
}

export interface CameraFrame {
  width: number;
  height: number;
  data: Uint8Array;
  timestamp: number;
}

export interface Overlay {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'box' | 'mask' | 'filter' | 'text';
  opacity: number;
}

export interface GestureEvent {
  type: 'tap' | 'swipe' | 'pinch' | 'rotate';
  x: number;
  y: number;
  delta: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}
`,
    },
  ],
  dependencies: {
    typescript: '^5.5.0',
    vite: '^5.0.0',
  },
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  },
};

export const builtinTemplates: ProjectTemplate[] = [
  gameTemplate,
  appTemplate,
  toolTemplate,
  agentTemplate,
  lensTemplate,
];
