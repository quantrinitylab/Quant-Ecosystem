'use client';

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { FileTypeIcon, IconChevronRight } from './icons';

interface FileTreeProps {
  paths: string[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const path of paths) {
    const parts = path.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');
      const isFolder = i < parts.length - 1 || path.endsWith('/');

      let existing = current.find((n) => n.name === name && n.isFolder === isFolder);
      if (!existing) {
        existing = { name, path: isFolder ? `${fullPath}/` : fullPath, isFolder, children: [] };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  // Sort: folders first, then files, alphabetical within each group
  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
    return nodes;
  }

  return sortNodes(root);
}

function FileTreeNode({
  node,
  depth,
  selectedFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedFile === node.path;

  return (
    <>
      <button
        type="button"
        className={`file-tree-item ${isSelected ? 'is-selected' : ''}`}
        onClick={() => {
          if (node.isFolder) onToggleFolder(node.path);
          else onSelectFile(node.path);
        }}
        aria-expanded={node.isFolder ? isExpanded : undefined}
      >
        {Array.from({ length: depth }, (_, i) => (
          <span key={i} className="file-tree-guide" />
        ))}
        {node.isFolder ? (
          <span className={`file-tree-chevron ${isExpanded ? 'is-open' : ''}`}>
            <IconChevronRight size={12} />
          </span>
        ) : (
          <span className="file-tree-spacer" />
        )}
        <span className="file-tree-icon">
          <FileTypeIcon
            name={node.name}
            isFolder={node.isFolder}
            isExpanded={isExpanded}
            size={14}
          />
        </span>
        <span className="file-tree-name">{node.name}</span>
      </button>
      <AnimatePresence>
        {node.isFolder && isExpanded && node.children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Hierarchical file tree with folder expand/collapse.
 * Replaces the flat path list with a proper GitHub-style tree navigator.
 * Supports: nested folders, file type icons, keyboard navigation, selected state.
 */
export function FileTree({ paths, selectedFile, onSelectFile }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const tree = useMemo(() => buildTree(paths), [paths]);

  const onToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Expand all on first render if tree is small
  useMemo(() => {
    if (paths.length <= 20) {
      const allFolders = paths.filter((p) => p.endsWith('/')).map((p) => p);
      // Also infer folder paths from file paths
      for (const path of paths) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
          allFolders.push(parts.slice(0, i).join('/') + '/');
        }
      }
      setExpandedFolders(new Set(allFolders));
    }
  }, [paths]);

  const filteredTree = useMemo(() => {
    if (!filter.trim()) return tree;
    // For filtered view, show matching files only (flat)
    const q = filter.toLowerCase();
    return paths
      .filter((p) => !p.endsWith('/') && p.toLowerCase().includes(q))
      .map((p) => ({ name: p.split('/').pop() || p, path: p, isFolder: false, children: [] }));
  }, [tree, filter, paths]);

  return (
    <div className="file-tree">
      <div className="file-tree-search">
        <input
          type="search"
          placeholder="Filter files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="file-tree-filter"
        />
      </div>
      <div className="file-tree-list">
        {filteredTree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedFile={selectedFile}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    </div>
  );
}
