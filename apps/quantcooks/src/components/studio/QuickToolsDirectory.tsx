// ============================================================================
// QuantCooks Studio — Quick Tools directory (spec §8.1, checklist #58)
//
// The Apps pattern: a searchable, category-chipped directory of
// one-click tools. Only tools whose flow is BUILT get a card — a card
// for an unbuilt flow would be a dead door — and every card on this
// page names a tool QuantAI can call (the G-13 rule: if QuantAI can't
// call it, it doesn't ship here). Each card carries the catalogue's
// real availability fact: every twin in this batch is registered but
// its provider is not configured yet, stated on the card, not hidden.
// ============================================================================

import React, { useState } from 'react';
import {
  QUICK_TOOLS,
  TOOL_CATEGORIES,
  filterTools,
  toolCardPrice,
  type QuickTool,
  type ToolCategoryId,
} from '../../lib/studio/tools';

export interface QuickToolsDirectoryProps {
  /** Shell search, when the page wires it; internal state otherwise. */
  query?: string;
  initialCategory?: ToolCategoryId | 'all';
}

const ToolCard: React.FC<{ tool: QuickTool }> = ({ tool }) => (
  <article className="studio-tools-card" data-testid={`tool-card-${tool.id}`}>
    <h3>{tool.name}</h3>
    <p className="studio-tools-card-job">{tool.jobLine}</p>
    <p className="studio-tools-card-price" data-testid={`tool-card-price-${tool.id}`}>
      {toolCardPrice(tool)}
    </p>
    <p className="studio-tools-card-twin">QuantAI twin: {tool.tool}</p>
    <p className="studio-tools-card-availability" data-testid={`tool-card-availability-${tool.id}`} role="note">
      Not available yet — {tool.availabilityNote}
    </p>
    <a className="studio-tools-card-open" href={`/tools/${tool.id}`}>
      Try now
    </a>
  </article>
);

export const QuickToolsDirectory: React.FC<QuickToolsDirectoryProps> = ({
  query,
  initialCategory = 'all',
}) => {
  const [category, setCategory] = useState<ToolCategoryId | 'all'>(initialCategory);
  const [internalQuery, setInternalQuery] = useState('');
  const effectiveQuery = query ?? internalQuery;

  const visible = filterTools(category, effectiveQuery);
  const searching = effectiveQuery.trim() !== '';

  return (
    <section className="studio-tools-directory" data-testid="tools-directory">
      <header className="studio-tools-hero">
        <h1><span className="studio-title-accent">Quick</span> Tools</h1>
        <p>One-tap tools for food creators — one job each, priced before they run.</p>
      </header>

      {query === undefined && (
        <label className="studio-tools-search">
          <span className="sr-only">Search Quick Tools</span>
          <input
            type="search"
            data-testid="tools-search"
            placeholder="Search tools — try “photo” or “score”…"
            value={internalQuery}
            onChange={(e) => setInternalQuery(e.target.value)}
          />
        </label>
      )}

      <div className="studio-tools-chips" role="group" aria-label="Categories">
        <button
          type="button"
          data-testid="tools-chip-all"
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
        >
          All
        </button>
        {TOOL_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            data-testid={`tools-chip-${c.id}`}
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="studio-tools-empty" data-testid="tools-empty" role="note">
          <p>
            {searching
              ? `No Quick Tool matches “${effectiveQuery.trim()}” yet.`
              : 'No Quick Tools live in this category yet.'}
          </p>
          <p>Closest places to look:</p>
          <ul>
            {TOOL_CATEGORIES.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setCategory(c.id)}>
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : category === 'all' && !searching ? (
        TOOL_CATEGORIES.map((c) => {
          const inCategory = QUICK_TOOLS.filter((t) => t.category === c.id);
          if (inCategory.length === 0) return null;
          return (
            <div key={c.id} className="studio-tools-row" data-testid={`tools-row-${c.id}`}>
              <h2>{c.label}</h2>
              <div className="studio-tools-grid">
                {inCategory.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            </div>
          );
        })
      ) : (
        <div className="studio-tools-grid" data-testid="tools-filtered-grid">
          {visible.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </section>
  );
};

export default QuickToolsDirectory;
