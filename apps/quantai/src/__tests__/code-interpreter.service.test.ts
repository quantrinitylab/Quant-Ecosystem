import { describe, it, expect, beforeEach } from 'vitest';
import { CodeInterpreterService } from '../services/code-interpreter.service';

describe('CodeInterpreterService', () => {
  let service: CodeInterpreterService;

  beforeEach(() => {
    service = new CodeInterpreterService();
  });

  describe('execute', () => {
    it('should execute valid code successfully', () => {
      const result = service.execute('console.log("hello")', 'javascript');
      expect(result.success).toBe(true);
      expect(result.output).toContain('javascript');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should fail for empty code', () => {
      const result = service.execute('', 'javascript');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty code block');
    });

    it('should fail for mismatched brackets', () => {
      const result = service.execute('function test() {', 'javascript');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Mismatched brackets');
    });

    it('should detect python brace usage', () => {
      const result = service.execute('def hello() { print("hi") }', 'python');
      expect(result.success).toBe(false);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return list of supported languages', () => {
      const languages = service.getSupportedLanguages();
      expect(languages.length).toBeGreaterThan(0);
      const names = languages.map((l) => l.language);
      expect(names).toContain('javascript');
      expect(names).toContain('typescript');
      expect(names).toContain('python');
    });

    it('should include version info', () => {
      const languages = service.getSupportedLanguages();
      for (const lang of languages) {
        expect(lang.version).toBeDefined();
      }
    });
  });

  describe('createSandbox / destroySandbox', () => {
    it('should create a sandbox', () => {
      const sandbox = service.createSandbox('javascript');
      expect(sandbox.id).toBeDefined();
      expect(sandbox.language).toBe('javascript');
      expect(sandbox.files.size).toBe(0);
    });

    it('should destroy a sandbox', () => {
      const sandbox = service.createSandbox('python');
      expect(service.destroySandbox(sandbox.id)).toBe(true);
    });

    it('should return false for non-existent sandbox', () => {
      expect(service.destroySandbox('fake')).toBe(false);
    });
  });

  describe('addFile', () => {
    it('should add a file to a sandbox', () => {
      const sandbox = service.createSandbox('javascript');
      expect(service.addFile(sandbox.id, 'index.js', 'console.log("hi")')).toBe(true);
    });

    it('should return false for non-existent sandbox', () => {
      expect(service.addFile('fake', 'file.js', 'code')).toBe(false);
    });
  });

  describe('getExecutionHistory', () => {
    it('should return execution history', () => {
      service.execute('console.log(1)', 'javascript');
      service.execute('print(2)', 'python');
      const history = service.getExecutionHistory(10);
      expect(history).toHaveLength(2);
    });

    it('should respect limit', () => {
      service.execute('a', 'javascript');
      service.execute('b', 'javascript');
      service.execute('c', 'javascript');
      const history = service.getExecutionHistory(2);
      expect(history).toHaveLength(2);
    });

    it('should return empty array initially', () => {
      expect(service.getExecutionHistory(10)).toHaveLength(0);
    });
  });

  describe('validateSyntax', () => {
    it('should validate correct code', () => {
      const result = service.validateSyntax('const x = 1;', 'javascript');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect empty code', () => {
      const result = service.validateSyntax('   ', 'javascript');
      expect(result.valid).toBe(false);
    });

    it('should detect mismatched brackets', () => {
      const result = service.validateSyntax('(()', 'javascript');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mismatched brackets');
    });
  });
});
