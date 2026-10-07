// ============================================================================
// QuantMail - Search Results Component
// Full-text search across emails/repos
// ============================================================================

import React, { useState } from 'react';
import type { Email, Repository, Issue, PullRequest } from '../types';

export type SearchResultType = 'email' | 'repo' | 'issue' | 'pull_request' | 'file' | 'contact';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  date: Date;
  metadata?: Record<string, unknown>;
}

export interface SearchResultsProps {
  query: string;
  results: SearchResult[];
  totalCount: number;
  isLoading: boolean;
  activeFilter: SearchResultType | 'all';
  onFilterChange: (filter: SearchResultType | 'all') => void;
  onResultClick: (result: SearchResult) => void;
  onSearch: (query: string) => void;
  onClear: () => void;
  suggestions?: string[];
}

const filterLabels: Record<SearchResultType | 'all', string> = {
  all: 'All',
  email: 'Emails',
  repo: 'Repositories',
  issue: 'Issues',
  pull_request: 'Pull Requests',
  file: 'Files',
  contact: 'Contacts',
};

const typeIcons: Record<SearchResultType, string> = {
  email: 'mail',
  repo: 'code',
  issue: 'alert',
  pull_request: 'merge',
  file: 'file',
  contact: 'user',
};

export function SearchResults(props: SearchResultsProps): React.ReactElement {
  const { query, results, totalCount, isLoading, activeFilter, onFilterChange, onResultClick, onSearch, onClear, suggestions } = props;

  const [localQuery, setLocalQuery] = useState(query);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    from: '', to: '', dateFrom: '', dateTo: '', hasAttachment: false,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    let searchQuery = localQuery;
    if (advancedFilters.from) searchQuery += ` from:${advancedFilters.from}`;
    if (advancedFilters.to) searchQuery += ` to:${advancedFilters.to}`;
    if (advancedFilters.hasAttachment) searchQuery += ' has:attachment';
    onSearch(searchQuery);
  };

  const highlightMatch = (text: string, query: string): React.ReactElement => {
    if (!query) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase()
            ? <mark key={i} className="search-highlight">{part}</mark>
            : <span key={i}>{part}</span>
        )}
      </span>
    );
  };

  const formatDate = (date: Date): string => {
    const d = new Date(date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const getResultCounts = (): Record<SearchResultType | 'all', number> => {
    const counts: Record<string, number> = { all: totalCount };
    for (const result of results) {
      counts[result.type] = (counts[result.type] || 0) + 1;
    }
    return counts as Record<SearchResultType | 'all', number>;
  };

  const counts = getResultCounts();

  return (
    <div className="search-results">
      {/* Search Bar */}
      <form className="search-header" onSubmit={handleSearch}>
        <div className="search-input-container">
          <input
            type="search"
            className="search-input"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search emails, repos, issues, contacts..."
            autoFocus
          />
          {localQuery && (
            <button type="button" className="btn-icon clear-btn" onClick={() => { setLocalQuery(''); onClear(); }}>X</button>
          )}
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
        <button type="button" className="btn btn-outline" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? 'Simple' : 'Advanced'}
        </button>
      </form>

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && !results.length && (
        <div className="search-suggestions">
          <p>Suggestions:</p>
          {suggestions.map((s, i) => (
            <button key={i} className="suggestion-chip" onClick={() => { setLocalQuery(s); onSearch(s); }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="advanced-filters">
          <div className="filter-row">
            <div className="form-group"><label>From</label><input type="text" value={advancedFilters.from} onChange={(e) => setAdvancedFilters({ ...advancedFilters, from: e.target.value })} placeholder="sender@email.com" /></div>
            <div className="form-group"><label>To</label><input type="text" value={advancedFilters.to} onChange={(e) => setAdvancedFilters({ ...advancedFilters, to: e.target.value })} placeholder="recipient@email.com" /></div>
            <div className="form-group"><label>From date</label><input type="date" value={advancedFilters.dateFrom} onChange={(e) => setAdvancedFilters({ ...advancedFilters, dateFrom: e.target.value })} /></div>
            <div className="form-group"><label>To date</label><input type="date" value={advancedFilters.dateTo} onChange={(e) => setAdvancedFilters({ ...advancedFilters, dateTo: e.target.value })} /></div>
            <label className="checkbox-label"><input type="checkbox" checked={advancedFilters.hasAttachment} onChange={(e) => setAdvancedFilters({ ...advancedFilters, hasAttachment: e.target.checked })} /> Has attachment</label>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="filter-tabs">
        {(Object.keys(filterLabels) as Array<SearchResultType | 'all'>).map((filter) => (
          <button
            key={filter}
            className={`filter-tab ${activeFilter === filter ? 'active' : ''}`}
            onClick={() => onFilterChange(filter)}
          >
            {filterLabels[filter]}
            {counts[filter] !== undefined && <span className="filter-count">{counts[filter] || 0}</span>}
          </button>
        ))}
      </div>

      {/* Results List */}
      <div className="results-list">
        {isLoading && <div className="loading-indicator">Searching...</div>}
        {!isLoading && results.length === 0 && query && (
          <div className="empty-state">
            <h3>No results found</h3>
            <p>No matches for "{query}". Try different keywords or filters.</p>
          </div>
        )}
        {results.map((result) => (
          <div key={`${result.type}-${result.id}`} className="result-item" onClick={() => onResultClick(result)}>
            <div className="result-type">
              <span className={`type-icon type-${result.type}`}>{typeIcons[result.type]}</span>
            </div>
            <div className="result-content">
              <div className="result-title">
                {highlightMatch(result.title, query)}
              </div>
              <div className="result-subtitle">{result.subtitle}</div>
              <div className="result-snippet">
                {highlightMatch(result.snippet, query)}
              </div>
            </div>
            <div className="result-meta">
              <span className="result-date">{formatDate(result.date)}</span>
              <span className={`result-type-badge type-${result.type}`}>{filterLabels[result.type]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination info */}
      {results.length > 0 && (
        <div className="results-footer">
          <span>Showing {results.length} of {totalCount} results for "{query}"</span>
        </div>
      )}
    </div>
  );
}

export default SearchResults;
