export interface CodexVoiceResult {
  success: boolean;
  action: string;
  spokenResponse: string;
  project?: { id: string; name: string; status: string };
}

interface ProjectEntry {
  id: string;
  name: string;
  status: string;
}

export class CodexVoiceBridge {
  private projects: ProjectEntry[] = [];

  async handleBuildCommand(transcript: string): Promise<CodexVoiceResult> {
    const lower = transcript.toLowerCase().trim();

    const buildMatch = lower.match(
      /(?:build|create|make)\s+(?:a\s+)?(?:game|app|tool)\s+(?:called|named)?\s*(.+)/,
    );
    if (buildMatch) {
      // Extract name from original transcript to preserve case
      const originalMatch = transcript
        .trim()
        .match(/(?:build|create|make)\s+(?:a\s+)?(?:game|app|tool)\s+(?:called|named)?\s*(.+)/i);
      const name = originalMatch?.[1]?.trim() ?? buildMatch[1]?.trim() ?? 'untitled';
      const id = `proj-${Date.now()}`;
      const project: ProjectEntry = { id, name, status: 'building' };
      this.projects.push(project);
      return {
        success: true,
        action: 'build',
        spokenResponse: `Starting build for ${name}. I will let you know when it is ready.`,
        project,
      };
    }

    return {
      success: false,
      action: 'unknown',
      spokenResponse: 'I did not understand that build command.',
    };
  }

  getProjectStatus(projectName?: string): CodexVoiceResult {
    if (projectName) {
      const project = this.projects.find((p) => p.name.toLowerCase() === projectName.toLowerCase());
      if (project) {
        return {
          success: true,
          action: 'status',
          spokenResponse: `Project ${project.name} is currently ${project.status}.`,
          project,
        };
      }
      return {
        success: false,
        action: 'status',
        spokenResponse: `I could not find a project named ${projectName}.`,
      };
    }

    if (this.projects.length === 0) {
      return {
        success: true,
        action: 'status',
        spokenResponse: 'You have no active projects.',
      };
    }

    const latest = this.projects[this.projects.length - 1]!;
    return {
      success: true,
      action: 'status',
      spokenResponse: `Your latest project ${latest.name} is ${latest.status}.`,
      project: latest,
    };
  }

  async handleDeployCommand(transcript: string): Promise<CodexVoiceResult> {
    const lower = transcript.toLowerCase().trim();

    const deployMatch = lower.match(
      /(?:deploy|ship|launch|publish)\s+(?:my\s+)?(?:project\s+)?(.+)?/,
    );
    if (deployMatch) {
      const name = deployMatch[1]?.trim();
      const project = name
        ? this.projects.find((p) => p.name.toLowerCase() === name.toLowerCase())
        : this.projects[this.projects.length - 1];

      if (project) {
        project.status = 'deploying';
        return {
          success: true,
          action: 'deploy',
          spokenResponse: `Deploying ${project.name}. This may take a moment.`,
          project,
        };
      }

      return {
        success: false,
        action: 'deploy',
        spokenResponse: 'No project found to deploy.',
      };
    }

    return {
      success: false,
      action: 'unknown',
      spokenResponse: 'I did not understand that deploy command.',
    };
  }

  async handleScaffoldCommand(transcript: string): Promise<CodexVoiceResult> {
    const lower = transcript.toLowerCase().trim();

    const scaffoldMatch = lower.match(
      /(?:scaffold|create|new)\s+(?:a\s+)?(?:new\s+)?(\w+)\s+(?:called|named)?\s*(.+)?/,
    );
    if (scaffoldMatch) {
      const type = scaffoldMatch[1] ?? 'app';
      // Preserve case from original
      const originalMatch = transcript
        .trim()
        .match(/(?:scaffold|create|new)\s+(?:a\s+)?(?:new\s+)?(\w+)\s+(?:called|named)?\s*(.+)?/i);
      const name = originalMatch?.[2]?.trim() ?? scaffoldMatch[2]?.trim() ?? `new-${type}`;
      const id = `proj-${Date.now()}`;
      const project: ProjectEntry = { id, name, status: 'scaffolding' };
      this.projects.push(project);
      return {
        success: true,
        action: 'scaffold',
        spokenResponse: `Scaffolding a new ${type} called ${name}.`,
        project,
      };
    }

    return {
      success: false,
      action: 'unknown',
      spokenResponse: 'I did not understand that scaffold command.',
    };
  }
}
