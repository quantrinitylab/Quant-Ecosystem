import React, { useState, useId } from 'react';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

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
  subtitle = 'Find quick answers to common questions about our platform and workflows.',
  categories,
  allowMultipleOpen = false,
  searchPlaceholder = 'Search questions or keywords...',
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const searchInputId = useId();

  // If explicit categories passed, use them; otherwise extract from items or fallback to standard SaaS list
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
    <div
      className={`w-full max-w-4xl mx-auto p-6 md:p-8 rounded-2xl bg-[#0D1117] border border-white/10 text-white shadow-2xl ${className}`}
      data-testid="faq-accordion"
    >
      {/* Header */}
      <div className="text-center mb-8">
        {title && <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">{title}</h2>}
        {subtitle && (
          <p className="text-sm md:text-base text-[#8B949E] max-w-xl mx-auto">{subtitle}</p>
        )}
      </div>

      {/* Search Input Bar */}
      <div className="relative mb-6">
        <label htmlFor={searchInputId} className="sr-only">
          Search questions
        </label>
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          id={searchInputId}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#161B22] border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF] transition-all"
          data-testid="faq-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-white"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Filter Pills */}
      {availableCategories.length > 1 && (
        <div
          className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none"
          data-testid="faq-category-pills"
        >
          {availableCategories.map((category) => {
            const isActive = activeCategory.toLowerCase() === category.toLowerCase();
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 border ${
                  isActive
                    ? 'bg-[#58A6FF]/15 border-[#58A6FF] text-[#58A6FF] shadow-[0_0_12px_rgba(88,166,255,0.2)]'
                    : 'bg-[#161B22] border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
                data-testid={`faq-category-${category.toLowerCase()}`}
              >
                {category}
              </button>
            );
          })}
        </div>
      )}

      {/* FAQ Accordion Item List */}
      <div className="space-y-3" data-testid="faq-items-container">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 rounded-xl bg-[#161B22]/50 border border-white/5">
            <p className="text-gray-400 text-sm">No questions found matching your search.</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('All');
                }}
                className="mt-3 text-xs text-[#58A6FF] hover:underline"
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
                className="rounded-xl bg-[#161B22] border border-white/10 overflow-hidden transition-all duration-300 hover:border-white/20"
                data-testid={`faq-item-${item.id}`}
              >
                {/* Question Trigger */}
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${item.id}`}
                  className="w-full flex items-center justify-between p-4 md:p-5 text-left focus:outline-none"
                  data-testid={`faq-question-${item.id}`}
                >
                  <div className="flex items-center gap-3 pr-4">
                    <span className="font-medium text-sm md:text-base text-gray-100">
                      {item.question}
                    </span>
                    {item.category && (
                      <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-gray-400 border border-white/10">
                        {item.category}
                      </span>
                    )}
                  </div>

                  {/* '+' to '−' rotating icon toggle */}
                  <span
                    className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10 transition-all duration-300 ${
                      isOpen
                        ? 'text-[#58A6FF] border-[#58A6FF]/40 rotate-180 bg-[#58A6FF]/10'
                        : 'text-gray-400'
                    }`}
                    data-testid={`faq-toggle-icon-${item.id}`}
                  >
                    <span className="text-base font-bold leading-none">{isOpen ? '−' : '+'}</span>
                  </span>
                </button>

                {/* Collapsible Answer */}
                <div
                  id={`faq-answer-${item.id}`}
                  role="region"
                  aria-labelledby={`faq-question-${item.id}`}
                  className={`px-4 md:px-5 text-sm text-[#8B949E] leading-relaxed transition-all duration-300 ease-in-out ${
                    isOpen
                      ? 'max-h-96 opacity-100 pb-5 pt-1 border-t border-white/5'
                      : 'max-h-0 opacity-0 overflow-hidden'
                  }`}
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
