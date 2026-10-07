// @vitest-environment jsdom
import { renderToString } from 'react-dom/server';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import {
  FaqAccordion,
  filterFaqItems,
  FaqItem,
  TestimonialShowcase,
  calculateNextTestimonialIndex,
  TestimonialItem,
} from '../bento';

describe('Nexsas Animated FAQ Accordion & Testimonial Showcase Suite', () => {
  const sampleFaqItems: FaqItem[] = [
    {
      id: 'faq-1',
      question: 'How does team billing and credit allocation work?',
      answer: 'Billing is consolidated across all 10 apps under unified Quant Credits.',
      category: 'Billing',
    },
    {
      id: 'faq-2',
      question: 'Can I export all Git repositories and email archives?',
      answer:
        'Yes, full 1-click sovereign export is supported for all git repositories and email mbox archives.',
      category: 'Account',
    },
    {
      id: 'faq-3',
      question: 'Is zero-knowledge encryption enabled by default?',
      answer:
        'Yes, Curve25519 prekey bundles and AES-256-GCM protect your messages and files end-to-end.',
      category: 'Security',
    },
    {
      id: 'faq-4',
      question: 'What features are included in QuantDrive and QuantGit?',
      answer:
        'QuantDrive includes AI summaries and file version rollback; QuantGit supports 3-way merge and Actions.',
      category: 'Features',
    },
  ];

  const sampleTestimonials: TestimonialItem[] = [
    {
      id: 't-1',
      quote:
        'Quant replaced five distinct SaaS subscriptions while offering unmatched speed and sovereign data ownership.',
      authorName: 'Alex Rivera',
      authorRole: 'VP of Platform Engineering',
      companyName: 'HyperScale Corp',
      rating: 5,
      verified: true,
    },
    {
      id: 't-2',
      quote:
        'The sub-5ms email search and instant Superhuman keyboard triage saved our team 2 hours every day.',
      authorName: 'Elena Rostova',
      authorRole: 'Chief Technology Officer',
      companyName: 'AeroCloud Labs',
      rating: 5,
      verified: true,
    },
    {
      id: 't-3',
      quote:
        'Deploying our repositories to QuantGit and executing streaming CI actions transformed our release cadence.',
      authorName: 'Marcus Chen',
      authorRole: 'DevOps Lead',
      companyName: 'Synthetix Dynamics',
      rating: 4,
      verified: true,
    },
  ];

  describe('1. filterFaqItems helper', () => {
    it('returns all items when search query is empty and category is "All"', () => {
      const result = filterFaqItems(sampleFaqItems, '', 'All');
      expect(result).toHaveLength(4);
    });

    it('returns all items when category is undefined or empty', () => {
      const result = filterFaqItems(sampleFaqItems, '');
      expect(result).toHaveLength(4);
    });

    it('filters items by search keyword in question', () => {
      const result = filterFaqItems(sampleFaqItems, 'encryption');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('faq-3');
    });

    it('filters items by search keyword in answer', () => {
      const result = filterFaqItems(sampleFaqItems, 'mbox archives');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('faq-2');
    });

    it('filters items strictly by category pill', () => {
      const result = filterFaqItems(sampleFaqItems, '', 'Billing');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('faq-1');

      const securityResult = filterFaqItems(sampleFaqItems, '', 'Security');
      expect(securityResult).toHaveLength(1);
      expect(securityResult[0]?.id).toBe('faq-3');
    });

    it('filters items by both category and search query combined', () => {
      const match = filterFaqItems(sampleFaqItems, 'QuantDrive', 'Features');
      expect(match).toHaveLength(1);
      expect(match[0]?.id).toBe('faq-4');

      const noMatch = filterFaqItems(sampleFaqItems, 'QuantDrive', 'Billing');
      expect(noMatch).toHaveLength(0);
    });
  });

  describe('2. calculateNextTestimonialIndex helper', () => {
    it('increments index forward on "next"', () => {
      expect(calculateNextTestimonialIndex(0, 3, 'next')).toBe(1);
      expect(calculateNextTestimonialIndex(1, 3, 'next')).toBe(2);
    });

    it('wraps around to 0 on "next" when at the last index', () => {
      expect(calculateNextTestimonialIndex(2, 3, 'next')).toBe(0);
    });

    it('decrements index backward on "prev"', () => {
      expect(calculateNextTestimonialIndex(2, 3, 'prev')).toBe(1);
      expect(calculateNextTestimonialIndex(1, 3, 'prev')).toBe(0);
    });

    it('wraps around to last index on "prev" when at index 0', () => {
      expect(calculateNextTestimonialIndex(0, 3, 'prev')).toBe(2);
    });

    it('handles single item or zero item gracefully', () => {
      expect(calculateNextTestimonialIndex(0, 1, 'next')).toBe(0);
      expect(calculateNextTestimonialIndex(0, 1, 'prev')).toBe(0);
      expect(calculateNextTestimonialIndex(0, 0, 'next')).toBe(0);
    });
  });

  describe('3. Component SSR Rendering via renderToString', () => {
    it('renderToString outputs FaqAccordion with questions, answers, title, and categories', () => {
      const html = renderToString(
        <FaqAccordion
          items={sampleFaqItems}
          title="Nexsas Help Center"
          subtitle="Frequently asked questions about Quant"
          categories={['All', 'Billing', 'Account', 'Security', 'Features']}
        />,
      );

      // Verify title & subtitle
      expect(html).toContain('Nexsas Help Center');
      expect(html).toContain('Frequently asked questions about Quant');

      // Verify questions
      expect(html).toContain('How does team billing and credit allocation work?');
      expect(html).toContain('Is zero-knowledge encryption enabled by default?');

      // Verify answers in server-rendered output
      expect(html).toContain(
        'Billing is consolidated across all 10 apps under unified Quant Credits.',
      );
      expect(html).toContain('Curve25519 prekey bundles and AES-256-GCM protect your messages');

      // Verify category pills
      expect(html).toContain('Billing');
      expect(html).toContain('Security');
      expect(html).toContain('Features');
    });

    it('renderToString outputs TestimonialShowcase with quotes, authors, roles, ratings, and company badges', () => {
      const html = renderToString(
        <TestimonialShowcase testimonials={sampleTestimonials} title="Customer Testimonials" />,
      );

      // Verify title
      expect(html).toContain('Customer Testimonials');

      // Verify first testimonial quote and author
      expect(html).toContain('Quant replaced five distinct SaaS subscriptions');
      expect(html).toContain('Alex Rivera');
      expect(html).toContain('VP of Platform Engineering');
      expect(html).toContain('HyperScale Corp');

      // Verify rating display and verified badge
      expect(html).toContain('5.0');
      expect(html).toContain('★');
      expect(html).toContain('Verified Customer');
    });
  });

  describe('4. Interactive DOM Testing', () => {
    it('FaqAccordion toggles question expansion and rotating icon symbol', () => {
      render(<FaqAccordion items={sampleFaqItems} allowMultipleOpen={false} />);

      const firstQuestionBtn = screen.getByTestId('faq-question-faq-1');
      const toggleIcon = screen.getByTestId('faq-toggle-icon-faq-1');

      // Initial state is closed
      expect(firstQuestionBtn).toHaveAttribute('aria-expanded', 'false');
      expect(toggleIcon).toHaveTextContent('+');

      // Click to open
      fireEvent.click(firstQuestionBtn);
      expect(firstQuestionBtn).toHaveAttribute('aria-expanded', 'true');
      expect(toggleIcon).toHaveTextContent('−');

      // Click to close
      fireEvent.click(firstQuestionBtn);
      expect(firstQuestionBtn).toHaveAttribute('aria-expanded', 'false');
      expect(toggleIcon).toHaveTextContent('+');
    });

    it('FaqAccordion dynamic search filters items live in DOM', () => {
      render(<FaqAccordion items={sampleFaqItems} />);

      const searchInput = screen.getByTestId('faq-search-input');
      fireEvent.change(searchInput, { target: { value: 'encryption' } });

      expect(
        screen.getByText('Is zero-knowledge encryption enabled by default?'),
      ).toBeInTheDocument();
      expect(screen.queryByText('How does team billing and credit allocation work?')).toBeNull();
    });

    it('TestimonialShowcase navigates next and prev slides and updates quote card', () => {
      render(<TestimonialShowcase testimonials={sampleTestimonials} />);

      // Initially shows Alex Rivera
      expect(screen.getByTestId('testimonial-author')).toHaveTextContent('Alex Rivera');
      expect(screen.getByTestId('testimonial-company')).toHaveTextContent('HyperScale Corp');

      // Click next button
      const nextBtn = screen.getByTestId('testimonial-next-button');
      fireEvent.click(nextBtn);

      // Shows Elena Rostova
      expect(screen.getByTestId('testimonial-author')).toHaveTextContent('Elena Rostova');
      expect(screen.getByTestId('testimonial-company')).toHaveTextContent('AeroCloud Labs');

      // Click prev button
      const prevBtn = screen.getByTestId('testimonial-prev-button');
      fireEvent.click(prevBtn);

      // Returns to Alex Rivera
      expect(screen.getByTestId('testimonial-author')).toHaveTextContent('Alex Rivera');
    });
  });
});
