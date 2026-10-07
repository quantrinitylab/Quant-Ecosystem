import { CodeAnalyzer } from '../analysis/code-analyzer.js';

describe('CodeAnalyzer', () => {
  const analyzer = new CodeAnalyzer();
  const paths = [
    'src/index.ts',
    'src/app.ts',
    'src/__tests__/foo.test.ts',
    'package.json',
    'turbo.json',
    'vitest.config.ts',
    'lib/utils.py',
  ];

  it('detects languages from extensions', () => {
    const langs = analyzer.detectLanguages(paths);
    expect(langs).toContain('TypeScript');
    expect(langs).toContain('Python');
  });

  it('detects frameworks from config files', () => {
    const fws = analyzer.detectFrameworks(paths);
    expect(fws).toContain('Node.js');
    expect(fws).toContain('vitest');
  });

  it('detects build system', () => {
    expect(analyzer.detectBuildSystem(paths)).toBe('turborepo');
  });

  it('identifies entry points', () => {
    const entries = analyzer.identifyEntryPoints(paths);
    expect(entries).toContain('src/index.ts');
    expect(entries).toContain('src/app.ts');
  });

  it('identifies test files', () => {
    const tests = analyzer.identifyTestFiles(paths);
    expect(tests).toEqual(['src/__tests__/foo.test.ts']);
  });

  it('generates a repo model', () => {
    const model = analyzer.generateRepoModel(paths);
    expect(model.languages.length).toBeGreaterThan(0);
    expect(model.summary).toContain('language');
  });

  it('parses file tree with nested dirs', () => {
    const tree = analyzer.parseFileTree(['src/a/b.ts', 'src/c.ts']);
    expect(tree.type).toBe('dir');
    expect(tree.children?.length).toBe(1);
    expect(tree.children?.[0]?.children?.length).toBe(2);
  });
});
