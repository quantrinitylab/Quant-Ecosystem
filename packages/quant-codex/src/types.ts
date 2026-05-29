export type ProjectType = 'game' | 'app' | 'tool' | 'agent' | 'lens';
export type ProjectStatus =
  | 'scaffolding'
  | 'building'
  | 'testing'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'idle';
export type DeployStage = 'validate' | 'build' | 'test' | 'package' | 'publish';

export interface ProjectTemplate {
  id: string;
  name: string;
  type: ProjectType;
  description: string;
  files: TemplateFile[];
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
}

export interface TemplateFile {
  path: string;
  content: string;
}

export interface CodexProject {
  id: string;
  name: string;
  templateId: string;
  type: ProjectType;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  files: TemplateFile[];
  agents: AgentTask[];
  logs: ProjectLog[];
  artifacts: string[];
}

export interface AgentTask {
  id: string;
  projectId: string;
  description: string;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
  assignedAgent: string | null;
  result: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface ProjectLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  source: string;
}

export interface BuildResult {
  success: boolean;
  projectId: string;
  duration: number;
  artifacts: string[];
  errors: string[];
}

export interface DeployResult {
  success: boolean;
  projectId: string;
  stage: DeployStage;
  url: string | null;
  error: string | null;
}

export interface ScaffoldResult {
  success: boolean;
  projectId: string;
  filesCreated: string[];
  templateUsed: string;
  files?: TemplateFile[];
}

export interface CodexCommand {
  type: 'scaffold' | 'build' | 'deploy' | 'status' | 'list' | 'delete';
  projectName?: string;
  templateType?: ProjectType;
  target?: string;
  options?: Record<string, unknown>;
}
