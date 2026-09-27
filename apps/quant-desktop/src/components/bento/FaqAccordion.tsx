import React, { useState, useId } from 'react';
import type { FaqItem } from '../../types';

export interface FaqAccordionProps {
  items: FaqItem[];
  title?: string;
  subtitle?: string;
  categories?: string[];
  allowMultipleOpen?: boolean;
  searchPlaceholder?: string;
  className?: string;
}

/**
 * Filters FAQ items by search query (matching question or answer)
 * and active category filter.
 */
export function filterFaqItems(
  items: FaqItem[],
  searchQuery: string,
  activeCategory?: string,
): FaqItem[] {
  const query = (searchQuery || '').trim().toLowerCase();
  const category = (activeCategory || '').trim().toLowerCase();

  return items.filter((item) => {
    const matchesCategory =
      !category ||
      category === 'all' ||
      (item.category && item.category.trim().toLowerCase() === category);

    if (!matchesCategory) {
      return false;
    }

    if (!query) {
      return true;
    }

    const questionMatch = item.question.toLowerCase().includes(query);
    const answerMatch = item.answer.toLowerCase().includes(query);
    return questionMatch || answerMatch;
  });
}

export const FaqAccordion: React.FC<FaqAccordionProps> = ({
  items,
  title = 'Frequently Asked Questions',
  subtitle = 'Find quick answers to common questions about our sovereign platform and workflows.',
  categories,
  allowMultipleOpen = false,
  searchPlaceholder = 'Search questions or keywords...',
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const searchInputId = useId();

  const availableCategories =
    categories && categories.length > 0
      ? categories
      : Array.from(
          new Set(['All', ...items.map((i) => i.category).filter((c): c is string => Boolean(c))]),
        );

  const toggleItem = (id: string) => {
    setOpenIds((prev) => {
      if (allowMultipleOpen) {
        return {
          ...prev,
          [id]: !prev[id],
        };
      }
      return {
        [id]: !prev[id],
      };
    });
  };

  const filteredItems = filterFaqItems(items, searchQuery, activeCategory);

  return (
    <div className={`faq-accordion-container ${className}`} data-testid="faq-accordion">
      {/* Header */}
      <div className="faq-header">
        {title && <h2 className="faq-title">{title}</h2>}
        {subtitle && <p className="faq-subtitle">{subtitle}</p>}
      </div>

      {/* Search Input Bar */}
      <div className="faq-search-wrapper">
        <label htmlFor={searchInputId} className="sr-only">
          Search questions
        </label>
        <span className="faq-search-icon">🔍</span>
        <input
          id={searchInputId}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="faq-search-input"
          data-testid="faq-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="faq-search-clear"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Filter Pills */}
      {availableCategories.length > 1 && (
        <div className="faq-category-pills" data-testid="faq-category-pills">
          {availableCategories.map((category) => {
            const isActive = activeCategory.toLowerCase() === category.toLowerCase();
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`faq-cat-pill ${isActive ? 'faq-cat-pill-active' : ''}`}
                data-testid={`faq-category-${category.toLowerCase()}`}
              >
                {category}
              </button>
            );
          })}
        </div>
      )}

      {/* FAQ Accordion Item List */}
      <div className="faq-items-list" data-testid="faq-items-container">
        {filteredItems.length === 0 ? (
          <div className="faq-empty-state">
            <p>No questions found matching your search.</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('All');
                }}
                className="faq-reset-filter-btn"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          filteredItems.map((item) => {
            const isOpen = Boolean(openIds[item.id]);

            return (
              <div
                key={item.id}
                className={`faq-item-card ${isOpen ? 'faq-item-card-open' : ''}`}
                data-testid={`faq-item-${item.id}`}
              >
                {/* Question Trigger */}
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${item.id}`}
                  className="faq-question-btn"
                  data-testid={`faq-question-${item.id}`}
                >
                  <div className="faq-question-text-row">
                    <span className="faq-question-text">{item.question}</span>
                    {item.category && <span className="faq-question-cat-tag">{item.category}</span>}
                  </div>

                  <span
                    className={`faq-toggle-icon ${isOpen ? 'faq-toggle-icon-open' : ''}`}
                    data-testid={`faq-toggle-icon-${item.id}`}
                  >
                    <span>{isOpen ? '−' : '+'}</span>
                  </span>
                </button>

                {/* Collapsible Answer */}
                <div
                  id={`faq-answer-${item.id}`}
                  role="region"
                  aria-labelledby={`faq-question-${item.id}`}
                  className={`faq-answer-content ${isOpen ? 'faq-answer-visible' : 'faq-answer-hidden'}`}
                  data-testid={`faq-answer-${item.id}`}
                >
                  {item.answer}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
