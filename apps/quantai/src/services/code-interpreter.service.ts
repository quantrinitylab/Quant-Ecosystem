// ============================================================================
// QuantAI - Code Interpreter Service
// Simulated code execution with sandbox management
// ============================================================================

export type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'rust' | 'go';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
  memoryUsed: number;
}

export interface Sandbox {
  id: string;
  language: SupportedLanguage;
  createdAt: number;
  files: Map<string, string>;
}

interface HistoryEntry {
  code: string;
  result: ExecutionResult;
  timestamp: number;
}

export class CodeInterpreterService {
  private sandboxes: Map<string, Sandbox> = new Map();
  private history: HistoryEntry[] = [];
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `sandbox-${this.idCounter}`;
  }

  execute(code: string, language: SupportedLanguage): ExecutionResult {
    const startTime = Date.now();
    let result: ExecutionResult;

    try {
      const validation = this.validateSyntax(code, language);
      if (!validation.valid) {
        result = {
          success: false,
          output: '',
          error: validation.errors.join('\n'),
          executionTime: Date.now() - startTime,
          memoryUsed: 0,
        };
      } else {
        // Simulated execution
        result = {
          success: true,
          output: `[${language}] Execution completed successfully`,
          executionTime: Date.now() - startTime,
          memoryUsed: Math.floor(Math.random() * 1024 * 1024),
        };
      }
    } catch {
      result = {
        success: false,
        output: '',
        error: 'Internal execution error',
        executionTime: Date.now() - startTime,
        memoryUsed: 0,
      };
    }

    this.history.push({ code, result, timestamp: Date.now() });
    return result;
  }

  getSupportedLanguages(): { language: SupportedLanguage; version: string }[] {
    return [
      { language: 'javascript', version: '22.0' },
      { language: 'typescript', version: '5.5' },
      { language: 'python', version: '3.12' },
      { language: 'rust', version: '1.77' },
      { language: 'go', version: '1.22' },
    ];
  }

  createSandbox(language: SupportedLanguage): Sandbox {
    const sandbox: Sandbox = {
      id: this.generateId(),
      language,
      createdAt: Date.now(),
      files: new Map(),
    };
    this.sandboxes.set(sandbox.id, sandbox);
    return sandbox;
  }

  destroySandbox(sandboxId: string): boolean {
    return this.sandboxes.delete(sandboxId);
  }

  addFile(sandboxId: string, filename: string, content: string): boolean {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return false;
    sandbox.files.set(filename, content);
    return true;
  }

  getExecutionHistory(
    limit: number,
  ): { code: string; result: ExecutionResult; timestamp: number }[] {
    return this.history.slice(-limit);
  }

  validateSyntax(code: string, language: SupportedLanguage): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (code.trim().length === 0) {
      errors.push('Empty code block');
      return { valid: false, errors };
    }

    // Basic bracket matching
    const openBrackets = (code.match(/[{[(]/g) ?? []).length;
    const closeBrackets = (code.match(/[}\])]/g) ?? []).length;
    if (openBrackets !== closeBrackets) {
      errors.push('Mismatched brackets');
    }

    // Language-specific checks
    if (language === 'python') {
      if (code.includes('{') && code.includes('def ')) {
        errors.push('Python uses indentation, not braces');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
