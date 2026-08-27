'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { IconSparkle } from './icons';

interface SearchResult {
  file: string;
  line: number;
  content: string;
  matchType: 'exact' | 'semantic' | 'regex';
}

interface AICodeSearchProps {
  onNavigateToResult: (file: string, line: number) => void;
}

/**
 * AI Code Search — semantic search across the entire codebase.
 * GitHub has text search. We have SEMANTIC search — find code by meaning, not just text.
 * "Find where we validate user input" → finds validation logic even without keyword match.
 */
export function AICodeSearch({ onNavigateToResult }: AICodeSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'semantic' | 'text' | 'regex'>('semantic');

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    await new Promise((r) => setTimeout(r, 600));

    // Simulate search results — in production calls backend
    const mockResults: SearchResult[] = [
      {
        file: 'src/services/auth.ts',
        line: 42,
        content: 'function validateCredentials(email: string, password: string)',
        matchType: 'semantic',
      },
      {
        file: 'src/middleware/validation.ts',
        line: 15,
        content: 'const schema = z.object({ email: z.string().email() })',
        matchType: 'semantic',
      },
      {
        file: 'src/routes/users.ts',
        line: 88,
        content: 'if (!isValidEmail(req.body.email)) throw new ValidationError()',
        matchType: 'exact',
      },
      {
        file: 'src/utils/validators.ts',
        line: 3,
        content: 'export function isValidEmail(email: string): boolean',
        matchType: 'exact',
      },
    ];
    setResults(mockResults);
    setIsSearching(false);
  }, [query]);

  return (
    <div className="ai-code-search">
      <div className="code-search-bar">
        <div className="code-search-modes">
          {(['semantic', 'text', 'regex'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`inline-flex items-center gap-1 ${searchMode === mode ? 'is-active' : ''}`}
              onClick={() => setSearchMode(mode)}
            >
              {mode === 'semantic' ? <IconSparkle size={11} /> : mode === 'regex' ? '.*' : 'Aa'}{' '}
              {mode}
            </button>
          ))}
        </div>
        <div className="code-search-input-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={
              searchMode === 'semantic'
                ? "Describe what you're looking for..."
                : searchMode === 'regex'
                  ? 'Enter regex pattern...'
                  : 'Search text...'
            }
          />
          <button
            type="button"
            className="code-search-btn"
            onClick={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? '...' : '⌘'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            className="code-search-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="code-search-count">{results.length} results</p>
            {results.map((result, idx) => (
              <button
                key={idx}
                type="button"
                className="code-search-result"
                onClick={() => onNavigateToResult(result.file, result.line)}
              >
                <div className="search-result-header">
                  <span className="search-result-file">{result.file}</span>
                  <span className="search-result-line">:{result.line}</span>
                  <span className={`search-result-badge search-result-badge--${result.matchType}`}>
                    {result.matchType}
                  </span>
                </div>
                <pre className="search-result-content">{result.content}</pre>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
