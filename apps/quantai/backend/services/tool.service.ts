import { createAppError } from '@quant/server-core';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Safe math expression evaluator that parses and evaluates arithmetic
 * expressions token-by-token without using Function() or eval().
 * Supports: numbers, +, -, *, /, parentheses, unary minus.
 */
function evaluateMathExpression(expr: string): number {
  const tokens = tokenize(expr);
  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }

  function consume(): string {
    return tokens[pos++]!;
  }

  function parseExpression(): number {
    let result = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parseFactor();
      if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        result = result / right;
      } else {
        result = result * right;
      }
    }
    return result;
  }

  function parseFactor(): number {
    // Handle unary minus
    if (peek() === '-') {
      consume();
      return -parseFactor();
    }
    // Handle unary plus
    if (peek() === '+') {
      consume();
      return parseFactor();
    }
    // Handle parentheses
    if (peek() === '(') {
      consume(); // consume '('
      const result = parseExpression();
      if (peek() !== ')') {
        throw new Error('Invalid math expression');
      }
      consume(); // consume ')'
      return result;
    }
    // Handle number
    const token = peek();
    if (token && /^\d+(\.\d+)?$/.test(token)) {
      consume();
      return parseFloat(token);
    }
    throw new Error('Invalid math expression');
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error('Invalid math expression');
  }
  return result;
}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Number (integer or decimal)
    if (/\d/.test(ch) || (ch === '.' && i + 1 < expr.length && /\d/.test(expr[i + 1]!))) {
      let num = '';
      while (i < expr.length && (/\d/.test(expr[i]!) || expr[i] === '.')) {
        num += expr[i]!;
        i++;
      }
      tokens.push(num);
      continue;
    }
    // Operators and parentheses
    if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }
    // Any other character is invalid
    throw new Error('Invalid math expression');
  }
  return tokens;
}

export class ToolService {
  private registry: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerBuiltInTools();
  }

  private registerBuiltInTools(): void {
    this.registerTool({
      name: 'calculator',
      description: 'Evaluate basic math expressions',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Math expression to evaluate' },
        },
        required: ['expression'],
      },
      handler: async (args) => {
        const expression = args['expression'] as string;
        // Only allow basic math characters for safety
        if (!/^[\d\s+\-*/().]+$/.test(expression)) {
          throw new Error('Invalid math expression');
        }
        const result = evaluateMathExpression(expression);
        return String(result);
      },
    });

    this.registerTool({
      name: 'current_time',
      description: 'Get the current date and time',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'Timezone (default: UTC)' },
        },
      },
      handler: async (args) => {
        const timezone = (args['timezone'] as string) || 'UTC';
        return new Date().toLocaleString('en-US', { timeZone: timezone });
      },
    });

    this.registerTool({
      name: 'echo',
      description: 'Echo back the provided text',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to echo' },
        },
        required: ['text'],
      },
      handler: async (args) => {
        return args['text'] as string;
      },
    });
  }

  registerTool(toolDef: ToolDefinition): void {
    this.registry.set(toolDef.name, toolDef);
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    _userId: string,
  ): Promise<string> {
    const tool = this.registry.get(toolName);

    if (!tool) {
      throw createAppError(`Tool '${toolName}' not found`, 404, 'TOOL_NOT_FOUND');
    }

    return tool.handler(args);
  }

  listTools(_userId: string): ToolInfo[] {
    const tools: ToolInfo[] = [];
    for (const [, tool] of this.registry) {
      tools.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      });
    }
    return tools;
  }
}
