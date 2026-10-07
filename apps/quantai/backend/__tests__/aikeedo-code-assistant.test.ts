// ============================================================================
// QuantAI — Aikeedo AI v3.9.0-Grade AI Code Assistant & Automated Refactoring Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  calculateCyclomaticComplexity,
  countLinesOfCode,
  analyzeCode,
  scaffoldTestBlock,
  refactorCode,
  codeAssistantService,
} from '../services/code-assistant.service';

describe('Aikeedo AI Code Assistant & Refactoring Engine', () => {
  describe('Language Detection', () => {
    it('should detect TypeScript snippets accurately', () => {
      const tsCode = `
        export interface UserProfile {
          id: string;
          username: string;
          isActive: boolean;
        }

        export function getUserProfile(id: string): Promise<UserProfile> {
          return Promise.resolve({ id, username: 'quant', isActive: true });
        }
      `;
      expect(detectLanguage(tsCode)).toBe('typescript');
    });

    it('should detect Python snippets accurately', () => {
      const pyCode = `
        def calculate_compound_interest(principal, rate, time):
            """Calculates compound interest over time."""
            if rate <= 0 or principal <= 0:
                return 0
            amount = principal * ((1 + rate / 100) ** time)
            return amount - principal

        print(calculate_compound_interest(1000, 5, 2))
      `;
      expect(detectLanguage(pyCode)).toBe('python');
    });

    it('should detect SQL snippets accurately', () => {
      const sqlCode = `
        SELECT u.id, u.email, COUNT(o.id) as total_orders
        FROM users u
        INNER JOIN orders o ON u.id = o.user_id
        WHERE u.status = 'active'
        GROUP BY u.id, u.email
        ORDER BY total_orders DESC;
      `;
      expect(detectLanguage(sqlCode)).toBe('sql');
    });

    it('should detect Go snippets accurately', () => {
      const goCode = `
        package main

        import "fmt"

        func main() {
            message := "Quant Ecosystem"
            fmt.Println(message)
        }
      `;
      expect(detectLanguage(goCode)).toBe('go');
    });

    it('should detect Rust snippets accurately', () => {
      const rustCode = `
        use std::collections::HashMap;

        pub fn count_words(text: &str) -> HashMap<String, usize> {
            let mut map = HashMap::new();
            for word in text.split_whitespace() {
                *map.entry(word.to_string()).or_insert(0) += 1;
            }
            map
        }
      `;
      expect(detectLanguage(rustCode)).toBe('rust');
    });

    it('should detect HTML snippets accurately', () => {
      const htmlCode = `
        <!DOCTYPE html>
        <html lang="en">
          <head><title>QuantAI</title></head>
          <body><div class="container"><h1>Hello Quant</h1></div></body>
        </html>
      `;
      expect(detectLanguage(htmlCode)).toBe('html');
    });
  });

  describe('Code Analysis (Lines of Code & Cyclomatic Complexity)', () => {
    it('calculates lines of code correctly ignoring empty lines', () => {
      const snippet = `
        // First line

        function greet(name) {

          return 'Hello ' + name;

        }
      `;
      // Non-empty lines: // First line, function greet(name) {, return 'Hello ' + name;, } -> 4 lines
      const loc = countLinesOfCode(snippet);
      expect(loc).toBe(4);
    });

    it('calculates cyclomatic complexity heuristic accurately', () => {
      const complexCode = `
        function evaluateScore(score: number, isVip: boolean) {
          if (score > 90) {
            return 'A';
          } else if (score > 80) {
            if (isVip && score > 85) {
              return 'A-';
            }
            return 'B';
          } else {
            return 'C';
          }
        }
      `;
      // Keywords counted:
      // if (2), else (2, including else if), elif (0), && (1) -> 5 decisions
      // Base cyclomatic complexity = 1 + 5 = 6
      const cc = calculateCyclomaticComplexity(complexCode);
      expect(cc).toBeGreaterThanOrEqual(5);

      const analysis = analyzeCode(complexCode, 'typescript');
      expect(analysis.cyclomaticComplexity).toBe(cc);
      expect(analysis.linesOfCode).toBeGreaterThan(5);
      expect(analysis.cognitiveScore).toBeGreaterThanOrEqual(1);
      expect(analysis.cognitiveScore).toBeLessThanOrEqual(100);
      expect(analysis.suggestedRefactorings).toContain('optimize');
    });

    it('handles empty code gracefully', () => {
      const analysis = analyzeCode('');
      expect(analysis.linesOfCode).toBe(0);
      expect(analysis.cyclomaticComplexity).toBe(0);
      expect(analysis.cognitiveScore).toBe(100);
    });
  });

  describe('Refactoring: generate_tests', () => {
    it('produces valid test structure with Vitest scaffold for TypeScript functions', () => {
      const sourceCode = `
        export function calculateDiscount(price, discountPercent) {
          return price - (price * discountPercent / 100);
        }

        export const formatCurrency = (amount) => {
          return '$' + amount.toFixed(2);
        };
      `;

      const result = refactorCode({
        sourceCode,
        language: 'typescript',
        action: 'generate_tests',
      });

      expect(result.refactoredCode).toContain(
        "import { describe, it, expect, beforeEach } from 'vitest';",
      );
      expect(result.refactoredCode).toContain("describe('calculateDiscount', () => {");
      expect(result.refactoredCode).toContain("describe('formatCurrency', () => {");
      expect(result.refactoredCode).toContain('expect(result).toBeDefined();');
      expect(result.explanation).toContain('Scaffolded comprehensive test suite');
      expect(result.complexityDiff).toBe(0);
    });

    it('produces valid PyTest test structure for Python functions', () => {
      const pyCode = `
        def fetch_market_depth(pair):
            return {"pair": pair, "bids": [], "asks": []}
      `;

      const result = refactorCode({
        sourceCode: pyCode,
        language: 'python',
        action: 'generate_tests',
      });

      expect(result.refactoredCode).toContain('import pytest');
      expect(result.refactoredCode).toContain('class TestFetchMarketDepth:');
      expect(result.refactoredCode).toContain('def test_fetch_market_depth_success(self):');
      expect(result.refactoredCode).toContain('assert result is not None');
    });

    it('scaffolds individual test block for any supported language', () => {
      const goTest = scaffoldTestBlock('ProcessPayment', 'go');
      expect(goTest).toContain('func TestProcessPayment(t *testing.T)');

      const rustTest = scaffoldTestBlock('verify_signature', 'rust');
      expect(rustTest).toContain('#[cfg(test)]');
      expect(rustTest).toContain('fn test_verify_signature_success()');
    });
  });

  describe('Refactoring: add_types', () => {
    it('annotates types and produces interface for untyped functions', () => {
      const jsCode = `
function createOrder(orderId, customerName, totalAmount, options) {
  return {
    orderId,
    customerName,
    totalAmount,
    status: 'pending',
  };
}
      `.trim();

      const result = refactorCode({
        sourceCode: jsCode,
        language: 'javascript',
        action: 'add_types',
      });

      // 1. Must produce at least one interface
      expect(result.refactoredCode).toContain('export interface CreateOrderOptions');
      expect(result.refactoredCode).toMatch(/orderId\??:\s*string/);
      expect(result.refactoredCode).toMatch(/totalAmount\??:\s*number/);

      // 2. Must annotate parameters in function signature
      expect(result.refactoredCode).toContain('function createOrder(');
      expect(result.refactoredCode).toMatch(/orderId:\s*string/);
      expect(result.refactoredCode).toMatch(/totalAmount:\s*number/);

      // 3. Explanation and complexity diff
      expect(result.explanation).toContain('Added explicit TypeScript interfaces');
      expect(result.complexityDiff).toBe(0);
    });
  });

  describe('Refactoring: optimize', () => {
    it('reports negative complexity diff on optimization and simplifies redundant conditions', () => {
      const redundantCode = `
function validateUserAccess(user, resource) {
  if (user.isActive === true) {
    if (user.isVerified === true) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}
      `.trim();

      const originalCC = calculateCyclomaticComplexity(redundantCode);
      expect(originalCC).toBeGreaterThan(3);

      const result = refactorCode({
        sourceCode: redundantCode,
        language: 'typescript',
        action: 'optimize',
      });

      // Complexity diff must be negative indicating reduction
      expect(result.complexityDiff).toBeLessThan(0);
      expect(result.refactoredCode).not.toContain('=== true');
      expect(result.explanation).toContain('Cyclomatic complexity reduced');
    });

    it('simplifies traditional index loops to for..of loops', () => {
      const loopCode = `
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  console.log(item);
}
      `.trim();

      const result = refactorCode({
        sourceCode: loopCode,
        language: 'typescript',
        action: 'optimize',
      });

      expect(result.refactoredCode).toContain('for (const item of items) {');
    });
  });

  describe('Refactoring: explain & convert_language', () => {
    it('generates comprehensive architectural explanation breakdown', () => {
      const code = `
        export async function fetchUserBalance(userId: string): Promise<number> {
          if (!userId) throw new Error('userId is required');
          return 4200.50;
        }
      `;

      const result = refactorCode({
        sourceCode: code,
        language: 'typescript',
        action: 'explain',
      });

      expect(result.explanation).toContain('Architectural Breakdown & Code Analysis');
      expect(result.explanation).toContain('TYPESCRIPT');
      expect(result.explanation).toContain('Complexity Profile');
      expect(result.refactoredCode).toBe(code);
      expect(result.complexityDiff).toBe(0);
    });

    it('converts code between languages', () => {
      const code = `function calculateMetric(data) { return data.length; }`;
      const result = refactorCode({
        sourceCode: code,
        language: 'javascript',
        action: 'convert_language',
        targetLanguage: 'python',
      });

      expect(result.refactoredCode).toContain('def calculateMetric');
      expect(result.explanation).toContain('Converted syntax logic from javascript to python');
    });
  });

  describe('CodeAssistantService class wrapper', () => {
    it('service instance delegates methods properly', () => {
      expect(codeAssistantService.detectLanguage('SELECT 1;')).toBe('sql');
      const analysis = codeAssistantService.analyzeCode('const a = 1;');
      expect(analysis.linesOfCode).toBe(1);

      const testScaffold = codeAssistantService.scaffoldTestBlock('runJob', 'typescript');
      expect(testScaffold).toContain("describe('runJob'");

      const refactored = codeAssistantService.refactorCode({
        sourceCode: 'function test() {}',
        language: 'javascript',
        action: 'generate_tests',
      });
      expect(refactored.refactoredCode).toContain("describe('test'");
    });
  });
});
