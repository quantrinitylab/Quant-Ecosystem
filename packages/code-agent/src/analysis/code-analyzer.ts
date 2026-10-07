import { FileTree, RepoAnalysis } from '../types.js';

const EXT_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.js': 'JavaScript',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.cpp': 'C++',
  '.c': 'C',
};
const FRAMEWORK_FILES: Record<string, string> = {
  'package.json': 'Node.js',
  'vitest.config.ts': 'vitest',
  'jest.config.ts': 'jest',
  'next.config.js': 'Next.js',
  'angular.json': 'Angular',
  'Cargo.toml': 'Rust/Cargo',
  'go.mod': 'Go modules',
  'requirements.txt': 'Python/pip',
};
const BUILD_FILES: Record<string, string> = {
  Makefile: 'make',
  'turbo.json': 'turborepo',
  'webpack.config.js': 'webpack',
  'vite.config.ts': 'vite',
  'Cargo.toml': 'cargo',
  'build.gradle': 'gradle',
};

export class CodeAnalyzer {
  parseFileTree(paths: string[]): FileTree {
    const root: FileTree = { path: '/', type: 'dir', children: [] };
    for (const p of paths) {
      const parts = p.split('/').filter(Boolean);
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        const existing = node.children?.find((c) => c.path === parts[i]);
        if (existing) {
          node = existing;
        } else {
          const child: FileTree = {
            path: parts[i]!,
            type: isLast ? 'file' : 'dir',
            children: isLast ? undefined : [],
          };
          node.children = node.children ?? [];
          node.children.push(child);
          node = child;
        }
      }
    }
    return root;
  }
  detectLanguages(paths: string[]): string[] {
    const langs = new Set<string>();
    for (const p of paths) {
      const ext = '.' + p.split('.').pop();
      if (EXT_MAP[ext]) langs.add(EXT_MAP[ext]!);
    }
    return [...langs];
  }
  detectFrameworks(paths: string[]): string[] {
    const fws = new Set<string>();
    for (const p of paths) {
      const name = p.split('/').pop()!;
      if (FRAMEWORK_FILES[name]) fws.add(FRAMEWORK_FILES[name]!);
    }
    return [...fws];
  }
  detectBuildSystem(paths: string[]): string | null {
    for (const p of paths) {
      const name = p.split('/').pop()!;
      if (BUILD_FILES[name]) return BUILD_FILES[name]!;
    }
    return null;
  }
  identifyEntryPoints(paths: string[]): string[] {
    return paths.filter((p) => /(?:index|main|app)\.[tj]sx?$/.test(p));
  }
  identifyTestFiles(paths: string[]): string[] {
    return paths.filter((p) => /\.(test|spec)\.[tj]sx?$/.test(p));
  }
  generateRepoModel(paths: string[]): RepoAnalysis {
    return {
      languages: this.detectLanguages(paths),
      frameworks: this.detectFrameworks(paths),
      buildSystem: this.detectBuildSystem(paths),
      entryPoints: this.identifyEntryPoints(paths),
      testFiles: this.identifyTestFiles(paths),
      configFiles: paths.filter((p) => /\.(json|ya?ml|toml|config\.[tj]s)$/.test(p)),
      summary: `Detected ${this.detectLanguages(paths).length} language(s), ${this.detectFrameworks(paths).length} framework(s)`,
    };
  }
}
