# @quant/agentic

The brain of the Quant Ecosystem — A full Agentic AI Operating System.

## Features

- **Personal AI Agents** — Every user gets their own dedicated agent
- **Specialized Agents** — QuantMail, QuantChat, QuantAI, QuantDrive, QuantMeet, QuantSync
- **Unified Memory** — Shared memory across all agents and apps
- **Autonomous Workflows** — Multi-agent task execution
- **Cross-App Coordination** — Agents working together across the ecosystem
- **QuantOrchestrator** — Central brain managing all agents

## Usage

```typescript
import { orchestrator } from '@quant/agentic';

// Run a specific agent
const result = await orchestrator.runAgent('quantai-agent', 'Help me plan my week');

// Create and execute a workflow
const workflow = await workflowEngine.createWorkflow(
  userId,
  'Weekly Planning',
  'Plan my week across email, chat, and calendar',
);
const results = await workflowEngine.executeWorkflow(workflow.id);
```

## Architecture

- `Agent` — Base agent with memory, tools, planning, execution
- `MemoryStore` + `UnifiedMemorySystem` — Persistent memory
- `ToolRegistry` — Plugin system for capabilities
- `Planner` + `Executor` — Autonomous planning and execution
- `QuantOrchestrator` — Manages all agents
- `WorkflowEngine` — Complex multi-agent workflows

## Status

Production-ready foundation for the world's most advanced agentic AI ecosystem.
