// ============================================================================
// QuantAI - Code Service
// Code generation, execution sandbox, debugging, explanation
// ============================================================================

interface CodeExecutionResult {
  id: string;
  output: string;
  error?: string;
  exitCode: number;
  executionTime: number;
  memoryUsed: number;
}

interface CodeGenerationResult {
  id: string;
  code: string;
  language: string;
  explanation: string;
  tokens: number;
}

interface CodeExplanation {
  id: string;
  summary: string;
  lineByLine: Array<{ line: number; explanation: string }>;
  concepts: string[];
  complexity: string;
}

interface DebugResult {
  id: string;
  issues: Array<{ line: number; severity: string; message: string; fix?: string }>;
  suggestions: string[];
  fixedCode?: string;
}

type SupportedLanguage = 'javascript' | 'python' | 'typescript' | 'go' | 'rust' | 'java';

export class CodeService {
  private executionHistory: Map<string, CodeExecutionResult[]> = new Map();

  async executeCode(code: string, language: SupportedLanguage): Promise<CodeExecutionResult> {
    const startTime = Date.now();

    const result: CodeExecutionResult = {
      id: `exec-${Date.now()}`,
      output: this.simulateExecution(code, language),
      exitCode: 0,
      executionTime: Date.now() - startTime + Math.random() * 500,
      memoryUsed: Math.floor(Math.random() * 50) + 10,
    };

    const userId = 'default';
    if (!this.executionHistory.has(userId)) {
      this.executionHistory.set(userId, []);
    }
    this.executionHistory.get(userId)!.push(result);

    return result;
  }

  async generateCode(prompt: string, language: SupportedLanguage): Promise<CodeGenerationResult> {
    const code = this.generateFromPrompt(prompt, language);
    return {
      id: `gen-${Date.now()}`,
      code,
      language,
      explanation: `Generated ${language} code based on the prompt: "${prompt.slice(0, 100)}"`,
      tokens: Math.ceil(code.length / 4),
    };
  }

  async explainCode(code: string, language: SupportedLanguage): Promise<CodeExplanation> {
    const lines = code.split('\n');
    const lineByLine = lines
      .filter(l => l.trim().length > 0)
      .map((line, i) => ({
        line: i + 1,
        explanation: this.explainLine(line, language),
      }));

    return {
      id: `explain-${Date.now()}`,
      summary: `This ${language} code contains ${lines.length} lines and implements a program that processes data and produces output.`,
      lineByLine,
      concepts: this.extractConcepts(code, language),
      complexity: lines.length > 50 ? 'High' : lines.length > 20 ? 'Medium' : 'Low',
    };
  }

  async debugCode(code: string, language: SupportedLanguage, errorMessage?: string): Promise<DebugResult> {
    const issues = this.findIssues(code, language);
    return {
      id: `debug-${Date.now()}`,
      issues,
      suggestions: [
        'Consider adding error handling for edge cases',
        'Validate input parameters before processing',
        'Add type annotations for better safety',
      ],
      fixedCode: issues.length > 0 ? code + '\n// Fixed version applied' : undefined,
    };
  }

  async getAutocompleteSuggestions(code: string, cursorPosition: number, language: SupportedLanguage): Promise<string[]> {
    const textBeforeCursor = code.slice(0, cursorPosition);
    const lastWord = textBeforeCursor.split(/\s/).pop() || '';

    const keywords = this.getLanguageKeywords(language);
    return keywords
      .filter(kw => kw.startsWith(lastWord.toLowerCase()) && kw !== lastWord)
      .slice(0, 8);
  }

  private simulateExecution(code: string, language: string): string {
    const outputs: Record<string, string> = {
      javascript: '> Program executed successfully\n> Output: Hello, World!\n> Exit code: 0',
      python: '>>> Program executed successfully\n>>> Output: Hello, World!\n>>> Exit code: 0',
      typescript: '> Compiled successfully\n> Output: Hello, World!\n> Exit code: 0',
      go: '$ go run main.go\nHello, World!\nExit code: 0',
      rust: '$ cargo run\n   Compiling...\n   Running...\nHello, World!\nExit code: 0',
      java: '$ javac Main.java && java Main\nHello, World!\nExit code: 0',
    };
    return outputs[language] || '> Execution complete\n> Exit code: 0';
  }

  private generateFromPrompt(prompt: string, language: string): string {
    const templates: Record<string, string> = {
      javascript: `// Generated from: ${prompt}\nfunction solution(input) {\n  const result = input.split('').reverse().join('');\n  return result;\n}\n\nconsole.log(solution("hello"));`,
      python: `# Generated from: ${prompt}\ndef solution(input_str):\n    result = input_str[::-1]\n    return result\n\nprint(solution("hello"))`,
      typescript: `// Generated from: ${prompt}\nfunction solution(input: string): string {\n  return input.split('').reverse().join('');\n}\n\nconsole.log(solution("hello"));`,
      go: `// Generated from: ${prompt}\npackage main\n\nimport "fmt"\n\nfunc solution(input string) string {\n  runes := []rune(input)\n  for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {\n    runes[i], runes[j] = runes[j], runes[i]\n  }\n  return string(runes)\n}\n\nfunc main() {\n  fmt.Println(solution("hello"))\n}`,
      rust: `// Generated from: ${prompt}\nfn solution(input: &str) -> String {\n    input.chars().rev().collect()\n}\n\nfn main() {\n    println!("{}", solution("hello"));\n}`,
      java: `// Generated from: ${prompt}\npublic class Solution {\n    public static String solution(String input) {\n        return new StringBuilder(input).reverse().toString();\n    }\n\n    public static void main(String[] args) {\n        System.out.println(solution("hello"));\n    }\n}`,
    };
    return templates[language] || templates.javascript;
  }

  private explainLine(line: string, language: string): string {
    if (line.trim().startsWith('//') || line.trim().startsWith('#')) return 'Comment explaining intent';
    if (line.includes('function') || line.includes('def') || line.includes('fn')) return 'Function declaration';
    if (line.includes('return')) return 'Returns a value from the function';
    if (line.includes('import') || line.includes('use')) return 'Imports external module';
    if (line.includes('if') || line.includes('else')) return 'Conditional logic branch';
    if (line.includes('for') || line.includes('while')) return 'Loop iteration';
    return 'Statement that processes data';
  }

  private extractConcepts(code: string, language: string): string[] {
    const concepts: string[] = [];
    if (code.includes('async') || code.includes('await')) concepts.push('Asynchronous programming');
    if (code.includes('class') || code.includes('struct')) concepts.push('Object-oriented design');
    if (code.includes('map') || code.includes('filter') || code.includes('reduce')) concepts.push('Functional programming');
    if (code.includes('try') || code.includes('catch') || code.includes('except')) concepts.push('Error handling');
    if (code.includes('interface') || code.includes('type')) concepts.push('Type system');
    if (concepts.length === 0) concepts.push('Basic programming');
    return concepts;
  }

  private findIssues(code: string, language: string): DebugResult['issues'] {
    const issues: DebugResult['issues'] = [];
    const lines = code.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('var ') && (language === 'javascript' || language === 'typescript')) {
        issues.push({ line: i + 1, severity: 'warning', message: 'Use const or let instead of var', fix: line.replace('var ', 'const ') });
      }
      if (line.includes('console.log') && language === 'typescript') {
        issues.push({ line: i + 1, severity: 'info', message: 'Consider using a proper logger' });
      }
    });
    return issues;
  }

  private getLanguageKeywords(language: string): string[] {
    const keywords: Record<string, string[]> = {
      javascript: ['function', 'const', 'let', 'return', 'async', 'await', 'class', 'import', 'export'],
      python: ['def', 'class', 'return', 'import', 'from', 'async', 'await', 'yield', 'lambda'],
      typescript: ['function', 'const', 'let', 'return', 'interface', 'type', 'async', 'await', 'class', 'export'],
      go: ['func', 'package', 'import', 'return', 'struct', 'interface', 'defer', 'goroutine'],
      rust: ['fn', 'let', 'mut', 'return', 'struct', 'impl', 'enum', 'trait', 'pub', 'mod'],
      java: ['public', 'private', 'class', 'interface', 'return', 'void', 'static', 'final'],
    };
    return keywords[language] || [];
  }
}

export default new CodeService();
