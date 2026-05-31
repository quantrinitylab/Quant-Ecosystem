'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { Card, SearchInput, Badge, EmptyState, Skeleton } from '@quant/shared-ui';
import { useDocuments, type DocSummary } from '../hooks/useDocuments';

interface DocListProps {
  filter?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', ...spring.gentle },
  },
};

export function DocList({ filter }: DocListProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { data: documents, isLoading, error } = useDocuments({ filter, search });

  if (isLoading) {
    return (
      <div className="p-6" role="status" aria-label="Loading documents">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-500" role="alert">
        <p>Failed to load documents. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1 w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search documents..."
            aria-label="Search documents"
          />
        </div>
        <div
          className="flex rounded-lg border border-[var(--quant-border)] overflow-hidden"
          role="group"
          aria-label="View mode"
        >
          <button
            onClick={() => setViewMode('grid')}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
              viewMode === 'grid'
                ? 'bg-[var(--brand-app-color)] text-white'
                : 'hover:bg-[var(--quant-muted)]'
            }`}
            aria-pressed={viewMode === 'grid'}
            aria-label="Grid view"
          >
            &#9638;
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
              viewMode === 'list'
                ? 'bg-[var(--brand-app-color)] text-white'
                : 'hover:bg-[var(--quant-muted)]'
            }`}
            aria-pressed={viewMode === 'list'}
            aria-label="List view"
          >
            &#9776;
          </button>
        </div>
      </div>

      {!documents || documents.length === 0 ? (
        <EmptyState
          title="No documents found"
          description="Create a new document to get started."
        />
      ) : viewMode === 'grid' ? (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          role="list"
          aria-label="Documents grid"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {documents.map((doc: DocSummary) => (
            <motion.div key={doc.id} variants={itemVariants}>
              <DocCard doc={doc} />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <motion.div
          className="space-y-2"
          role="list"
          aria-label="Documents list"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {documents.map((doc: DocSummary) => (
            <motion.div key={doc.id} variants={itemVariants}>
              <DocListItem doc={doc} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function DocCard({ doc }: { doc: DocSummary }) {
  return (
    <a href={`/doc/${doc.id}`} role="listitem" className="block min-h-[44px]">
      <Card hoverable clickable variant="outlined" padding="md">
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <h3 className="font-medium text-sm truncate flex-1">{doc.title}</h3>
            {doc.isStarred && (
              <span className="text-yellow-500 ml-2" aria-label="Starred">
                &#9733;
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--quant-muted-foreground)]">
            Last edited {new Date(doc.updatedAt).toLocaleDateString()}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--quant-muted-foreground)]">{doc.owner}</span>
            {doc.sharedWith.length > 0 && (
              <Badge variant="info">+{doc.sharedWith.length} shared</Badge>
            )}
          </div>
        </div>
      </Card>
    </a>
  );
}

function DocListItem({ doc }: { doc: DocSummary }) {
  return (
    <a href={`/doc/${doc.id}`} role="listitem" className="block min-h-[44px]">
      <Card hoverable clickable variant="flat" padding="sm">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm truncate">{doc.title}</h3>
              {doc.isStarred && (
                <span className="text-yellow-500" aria-label="Starred">
                  &#9733;
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap">
            {doc.owner}
          </span>
          <span className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap">
            {new Date(doc.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </Card>
    </a>
  );
}
