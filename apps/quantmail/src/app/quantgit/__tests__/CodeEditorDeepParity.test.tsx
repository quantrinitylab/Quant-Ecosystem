import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  tokenizeLine,
  renderSyntaxHighlightedLine,
  computeLineDiff,
  getMockBlame,
  getMockFileHistory,
} from '../components/CodeTab';

describe('CodeEditorDeepParity Unit Tests', () => {
  it('detects language correctly across all file extensions', () => {
    expect(detectLanguage('index.ts')).toBe('typescript');
    expect(detectLanguage('App.tsx')).toBe('typescript');
    expect(detectLanguage('main.js')).toBe('javascript');
    expect(detectLanguage('component.jsx')).toBe('javascript');
    expect(detectLanguage('script.py')).toBe('python');
    expect(detectLanguage('config.json')).toBe('json');
    expect(detectLanguage('README.md')).toBe('markdown');
    expect(detectLanguage('index.html')).toBe('html');
    expect(detectLanguage('styles.css')).toBe('css');
    expect(detectLanguage('query.sql')).toBe('sql');
    expect(detectLanguage('lib.rs')).toBe('rust');
    expect(detectLanguage('main.go')).toBe('go');
    expect(detectLanguage('deploy.sh')).toBe('shell');
    expect(detectLanguage('unknown.xyz')).toBe('plaintext');
  });

  it('tokenizes code lines for syntax highlighting (TypeScript, Python, SQL, Rust, Go, Shell)', () => {
    const tsTokens = tokenizeLine('const sovereign = true;', 'typescript');
    expect(tsTokens.length).toBeGreaterThan(0);
    expect(tsTokens.some((t) => t.type === 'keyword' && t.text === 'const')).toBe(true);

    const pyTokens = tokenizeLine('def run_task():', 'python');
    expect(pyTokens.some((t) => t.type === 'keyword' && t.text === 'def')).toBe(true);
    expect(pyTokens.some((t) => t.type === 'function' && t.text === 'run_task')).toBe(true);

    const sqlTokens = tokenizeLine('SELECT * FROM users;', 'sql');
    expect(sqlTokens.some((t) => t.type === 'keyword' && t.text.toLowerCase() === 'select')).toBe(
      true,
    );

    const rustTokens = tokenizeLine('fn main() {}', 'rust');
    expect(rustTokens.some((t) => t.type === 'keyword' && t.text === 'fn')).toBe(true);

    const goTokens = tokenizeLine('func main() {}', 'go');
    expect(goTokens.some((t) => t.type === 'keyword' && t.text === 'func')).toBe(true);

    const shellTokens = tokenizeLine('echo "hello"', 'shell');
    expect(shellTokens.some((t) => t.type === 'keyword' && t.text === 'echo')).toBe(true);
  });

  it('renders syntax highlighted React nodes for github-dark and github-light themes', () => {
    const darkNode = renderSyntaxHighlightedLine(
      'const x = 42; // comment',
      'typescript',
      'github-dark',
    );
    expect(darkNode).toBeDefined();

    const lightNode = renderSyntaxHighlightedLine(
      'const x = 42; // comment',
      'typescript',
      'github-light',
    );
    expect(lightNode).toBeDefined();
  });

  it('computes line diff additions and removals correctly', () => {
    const original = 'line 1\nline 2\nline 3';
    const current = 'line 1\nline 2 modified\nline 3\nline 4 added';
    const diff = computeLineDiff(original, current);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.some((d) => d.type === 'added')).toBe(true);
    expect(diff.some((d) => d.type === 'unchanged')).toBe(true);
  });

  it('provides mock git blame and file commit history', () => {
    const blame1 = getMockBlame(1, 'src/index.ts');
    const blame2 = getMockBlame(2, 'src/index.ts');
    expect(blame1.sha).toBeDefined();
    expect(blame1.author).toBeDefined();
    expect(blame2.sha).toBeDefined();

    const history = getMockFileHistory('src/index.ts');
    expect(history.length).toBe(4);
    expect(history[0].message).toContain('sovereign in-browser IDE parity');
  });
});
