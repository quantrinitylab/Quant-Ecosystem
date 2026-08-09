'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface PerformanceIssue {
  type: 'render' | 'memory' | 'bundle' | 'network' | 'complexity';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  line?: number;
  suggestion: string;
}

interface AIPerformanceProfilerProps {
  code: string;
  language: string;
  filename: string;
}

/**
 * AI Performance Profiler — static analysis for performance issues.
 * Detects: unnecessary re-renders, memory leaks, bundle bloat, O(n²) algorithms.
 * No IDE has built-in AI performance profiling.
 */
export function AIPerformanceProfiler({ code, language, filename }: AIPerformanceProfilerProps) {
  const issues = useMemo(() => {
    const found: PerformanceIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // React performance issues
      if (line.includes('useState') && line.includes('[]') && code.includes('.map(')) {
        found.push({ type: 'render', severity: 'warning', message: 'Array state with .map() — consider useMemo for derived lists', line: lineNum, suggestion: 'Wrap the .map() result in useMemo to avoid recalculating on every render.' });
      }
      if (line.includes('useEffect') && lines[i + 1]?.trim() === '') {
        // Check if useEffect has no deps
        const nextLines = lines.slice(i, i + 5).join('');
        if (nextLines.includes(', [])') === false && nextLines.includes('useEffect(')) {
          found.push({ type: 'render', severity: 'info', message: 'useEffect without explicit deps array', line: lineNum, suggestion: 'Add a dependency array to prevent running on every render.' });
        }
      }
      if (line.includes('new Date()') && code.includes('render')) {
        found.push({ type: 'render', severity: 'info', message: 'new Date() in render path creates new object each render', line: lineNum, suggestion: 'Move Date creation to useMemo or outside component.' });
      }

      // O(n²) detection
      if (line.includes('.forEach(') || line.includes('.map(')) {
        const innerBlock = lines.slice(i, Math.min(i + 10, lines.length)).join('');
        if (innerBlock.includes('.find(') || innerBlock.includes('.filter(') || innerBlock.includes('.includes(')) {
          found.push({ type: 'complexity', severity: 'warning', message: 'Nested iteration detected — possible O(n²)', line: lineNum, suggestion: 'Use a Map/Set for O(1) lookups instead of nested .find()/.filter().' });
        }
      }

      // Memory leaks
      if (line.includes('addEventListener') && !code.includes('removeEventListener')) {
        found.push({ type: 'memory', severity: 'critical', message: 'addEventListener without cleanup — memory leak', line: lineNum, suggestion: 'Add removeEventListener in useEffect cleanup or component unmount.' });
      }
      if (line.includes('setInterval') && !code.includes('clearInterval')) {
        found.push({ type: 'memory', severity: 'critical', message: 'setInterval without clearInterval — memory leak', line: lineNum, suggestion: 'Store interval ID and call clearInterval in cleanup.' });
      }

      // Bundle size
      if (line.includes("import * as") || line.includes("import {") && line.includes('lodash')) {
        found.push({ type: 'bundle', severity: 'warning', message: 'Full library import may increase bundle size', line: lineNum, suggestion: 'Use tree-shakeable imports: import { specific } from "lib/specific"' });
      }
    }

    return found;
  }, [code, language]);

  if (issues.length === 0) {
    return (
      <div className="perf-profiler perf-clean">
        <span>⚡</span> No performance issues detected
      </div>
    );
  }

  const severityConfig = {
    critical: { icon: '🔴', color: '#f87171' },
    warning: { icon: '🟡', color: '#fbbf24' },
    info: { icon: '💡', color: '#60a5fa' },
  };

  return (
    <motion.div className="perf-profiler" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <header className="perf-header">
        <span>⚡ Performance</span>
        <span className="perf-count">{issues.length} issue{issues.length > 1 ? 's' : ''}</span>
      </header>
      <div className="perf-issues">
        {issues.map((issue, idx) => {
          const config = severityConfig[issue.severity];
          return (
            <div key={idx} className="perf-issue">
              <div className="perf-issue-header">
                <span>{config.icon}</span>
                <span className="perf-issue-type" style={{ color: config.color }}>{issue.type}</span>
                {issue.line && <span className="perf-issue-line">L{issue.line}</span>}
              </div>
              <p className="perf-issue-msg">{issue.message}</p>
              <p className="perf-issue-fix">💡 {issue.suggestion}</p>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
