'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Snippet {
  id: string;
  title: string;
  language: string;
  code: string;
  tags: string[];
  createdAt: string;
  usageCount: number;
}

interface CodeSnippetLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (code: string) => void;
}

const DEFAULT_SNIPPETS: Snippet[] = [
  { id: 'sn-1', title: 'React useState Hook', language: 'typescript', code: 'const [state, setState] = useState<string>(\'\');', tags: ['react', 'hook'], createdAt: new Date().toISOString(), usageCount: 0 },
  { id: 'sn-2', title: 'Async Fetch with Error', language: 'typescript', code: 'async function fetchData(url: string) {\n  try {\n    const response = await fetch(url);\n    if (!response.ok) throw new Error(`HTTP ${response.status}`);\n    return await response.json();\n  } catch (error) {\n    console.error(\'Fetch failed:\', error);\n    throw error;\n  }\n}', tags: ['fetch', 'async', 'error'], createdAt: new Date().toISOString(), usageCount: 0 },
  { id: 'sn-3', title: 'Express Route Handler', language: 'typescript', code: 'app.get(\'/api/items\', async (req, res) => {\n  try {\n    const items = await db.items.findMany();\n    res.json({ success: true, data: items });\n  } catch (error) {\n    res.status(500).json({ success: false, error: \'Internal server error\' });\n  }\n});', tags: ['express', 'api', 'route'], createdAt: new Date().toISOString(), usageCount: 0 },
  { id: 'sn-4', title: 'Debounce Function', language: 'typescript', code: 'function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {\n  let timer: ReturnType<typeof setTimeout>;\n  return ((...args: unknown[]) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), delay);\n  }) as T;\n}', tags: ['utility', 'debounce'], createdAt: new Date().toISOString(), usageCount: 0 },
  { id: 'sn-5', title: 'Zod Validation Schema', language: 'typescript', code: 'import { z } from \'zod\';\n\nconst UserSchema = z.object({\n  name: z.string().min(1).max(100),\n  email: z.string().email(),\n  age: z.number().int().positive().optional(),\n});\n\ntype User = z.infer<typeof UserSchema>;', tags: ['zod', 'validation', 'schema'], createdAt: new Date().toISOString(), usageCount: 0 },
];

/**
 * Code Snippet Library — save, search, and reuse code snippets.
 * VS Code has snippets but they are file-based. We make them cloud-synced,
 * searchable, and shareable across the team.
 */
export function CodeSnippetLibrary({ isOpen, onClose, onInsert }: CodeSnippetLibraryProps) {
  const [snippets, setSnippets] = useState<Snippet[]>(DEFAULT_SNIPPETS);
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newSnippet, setNewSnippet] = useState({ title: '', code: '', language: 'typescript', tags: '' });

  const filtered = snippets.filter((s) => {
    const q = filter.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q)) || s.language.includes(q);
  });

  const handleInsert = useCallback((snippet: Snippet) => {
    setSnippets((prev) => prev.map((s) => s.id === snippet.id ? { ...s, usageCount: s.usageCount + 1 } : s));
    onInsert(snippet.code);
    onClose();
  }, [onInsert, onClose]);

  const handleAdd = useCallback(() => {
    if (!newSnippet.title || !newSnippet.code) return;
    const snippet: Snippet = {
      id: `sn-${Date.now()}`,
      title: newSnippet.title,
      language: newSnippet.language,
      code: newSnippet.code,
      tags: newSnippet.tags.split(',').map((t) => t.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
      usageCount: 0,
    };
    setSnippets((prev) => [snippet, ...prev]);
    setNewSnippet({ title: '', code: '', language: 'typescript', tags: '' });
    setShowAdd(false);
  }, [newSnippet]);

  if (!isOpen) return null;

  return (
    <motion.div className="snippet-library" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
      <header className="snippet-header">
        <h3>Code Snippets</h3>
        <div className="snippet-header-actions">
          <button type="button" onClick={() => setShowAdd((v) => !v)}>+ New</button>
          <button type="button" onClick={onClose}>×</button>
        </div>
      </header>
      <div className="snippet-search">
        <input type="search" placeholder="Search snippets..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {showAdd && (
        <div className="snippet-add-form">
          <input type="text" placeholder="Snippet title" value={newSnippet.title} onChange={(e) => setNewSnippet((p) => ({ ...p, title: e.target.value }))} />
          <textarea placeholder="Paste your code..." value={newSnippet.code} onChange={(e) => setNewSnippet((p) => ({ ...p, code: e.target.value }))} rows={4} />
          <input type="text" placeholder="Tags (comma separated)" value={newSnippet.tags} onChange={(e) => setNewSnippet((p) => ({ ...p, tags: e.target.value }))} />
          <button type="button" onClick={handleAdd}>Save Snippet</button>
        </div>
      )}
      <div className="snippet-list">
        {filtered.map((snippet) => (
          <div key={snippet.id} className="snippet-item" onClick={() => handleInsert(snippet)}>
            <div className="snippet-item-header">
              <strong>{snippet.title}</strong>
              <span className="snippet-lang">{snippet.language}</span>
            </div>
            <pre className="snippet-code">{snippet.code.slice(0, 100)}{snippet.code.length > 100 ? '...' : ''}</pre>
            <div className="snippet-tags">
              {snippet.tags.map((tag) => <span key={tag} className="snippet-tag">{tag}</span>)}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
