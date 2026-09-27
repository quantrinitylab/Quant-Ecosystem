// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { BentoFeatureGrid, KpiMetricCard, PricingPlanTable } from '../bento';

describe('Nexsas Bento & Metrics UI Components', () => {
  it('BentoFeatureGrid renders items with custom spans and titles', () => {
    const items = [
      {
        id: '1',
        title: 'Feature One',
        description: 'Description one',
        span: '2x2' as const,
        badge: 'New',
      },
      { id: '2', title: 'Feature Two', description: 'Description two', span: '1x1' as const },
    ];

    render(<BentoFeatureGrid items={items} />);

    expect(screen.getByTestId('bento-feature-grid')).toBeDefined();
    expect(screen.getByTestId('bento-item-1')).toBeDefined();
    expect(screen.getByTestId('bento-item-2')).toBeDefined();
    expect(screen.getByText('Feature One')).toBeDefined();
    expect(screen.getByText('Feature Two')).toBeDefined();
    expect(screen.getByText('New')).toBeDefined();
  });

  it('KpiMetricCard displays formatted metrics, positive/negative delta pills, and sparklines', () => {
    const sparkline = [10, 25, 18, 30, 45, 40, 60];
    const { rerender } = render(
      <KpiMetricCard
        title="Monthly Revenue"
        value="$24,850"
        change={14.2}
        timePeriod="vs last 30 days"
        sparklineData={sparkline}
      />,
    );

    expect(screen.getByText('Monthly Revenue')).toBeDefined();
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('$24,850');
    expect(screen.getByTestId('kpi-change-pill')).toHaveTextContent('+14.2%');

    // Test negative change pill
    rerender(
      <KpiMetricCard title="Churn Rate" value="3.1%" change={-3.1} timePeriod="vs last 30 days" />,
    );
    expect(screen.getByTestId('kpi-change-pill')).toHaveTextContent('-3.1%');
  });

  it('PricingPlanTable toggles between monthly and annual pricing with calculated discount values', () => {
    const tiers = [
      {
        id: 'starter',
        name: 'Free / Starter',
        description: 'For individuals',
        monthlyPrice: 0,
        features: ['1 Workspace', 'Basic Analytics'],
      },
      {
        id: 'pro',
        name: 'Pro / Creator',
        description: 'For professionals',
        monthlyPrice: 50,
        isPopular: true,
        features: ['Unlimited Workspaces', 'Advanced AI'],
      },
    ];

    const onCtaClick = vi.fn();
    render(
      <PricingPlanTable
        tiers={tiers.map((t) => (t.id === 'pro' ? { ...t, onCtaClick } : t))}
        defaultBilling="monthly"
        annualDiscountPercent={20}
      />,
    );

    expect(screen.getByTestId('pricing-plan-table')).toBeDefined();
    expect(screen.getByTestId('tier-price-pro')).toHaveTextContent('$50');

    // Toggle to Annual
    const annualBtn = screen.getByTestId('billing-annual-btn');
    fireEvent.click(annualBtn);

    // 50 * 12 * 0.8 / 12 = 40
    expect(screen.getByTestId('tier-price-pro')).toHaveTextContent('$40');

    // Click CTA
    const ctaBtn = screen.getByTestId('tier-cta-pro');
    fireEvent.click(ctaBtn);
    expect(onCtaClick).toHaveBeenCalled();
  });
});
