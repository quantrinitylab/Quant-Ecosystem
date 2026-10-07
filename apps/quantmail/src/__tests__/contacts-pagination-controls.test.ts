import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContactsPagination } from '../components/ContactsPagination';
import type { ContactsPagination as Pagination } from '../lib/contacts-pagination';

interface NativeProps {
  children?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  onClick?: () => void;
}

function buttons(tree: ReactNode): Array<ReactElement<NativeProps>> {
  const result: Array<ReactElement<NativeProps>> = [];
  const visit = (node: ReactNode) => {
    if (!isValidElement<NativeProps>(node)) return;
    if (node.type === 'button') result.push(node);
    Children.forEach(node.props.children, visit);
  };
  Children.forEach(tree, visit);
  return result;
}

function pagination(page: number, total = 21): Pagination {
  const totalPages = Math.ceil(total / 20);
  return { total, page, pageSize: 20, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

const defaults = { isFetching: false, hasError: false, onPageChange: () => undefined };

describe('Contacts pagination controls', () => {
  it('disables Previous and enables Next on the first of several pages', () => {
    const controls = buttons(
      ContactsPagination({ ...defaults, page: 1, pagination: pagination(1) }),
    );
    expect(controls[0].props.disabled).toBe(true);
    expect(controls[1].props.disabled).toBe(false);
  });

  it('navigates to the adjacent page rather than fetching the whole book', () => {
    const calls: number[] = [];
    const first = buttons(
      ContactsPagination({
        ...defaults,
        page: 1,
        pagination: pagination(1),
        onPageChange: (page) => calls.push(page),
      }),
    );
    first[1].props.onClick?.();
    const last = buttons(
      ContactsPagination({
        ...defaults,
        page: 2,
        pagination: pagination(2),
        onPageChange: (page) => calls.push(page),
      }),
    );
    last[0].props.onClick?.();
    expect(calls).toEqual([2, 1]);
  });

  it('disables Next on the final page', () => {
    const controls = buttons(
      ContactsPagination({ ...defaults, page: 2, pagination: pagination(2) }),
    );
    expect(controls[0].props.disabled).toBe(false);
    expect(controls[1].props.disabled).toBe(true);
  });

  it('lets a failed later page return to the preceding page without metadata', () => {
    const props = { ...defaults, page: 2, hasError: true };
    const controls = buttons(ContactsPagination(props));
    expect(controls[0].props.disabled).toBe(false);
    expect(controls[1].props.disabled).toBe(true);
    expect(renderToStaticMarkup(createElement(ContactsPagination, props))).toContain(
      'Page 2 could not be loaded.',
    );
  });

  it('disables both controls and announces an in-flight page', () => {
    const props = { ...defaults, page: 2, pagination: pagination(2, 41), isFetching: true };
    const controls = buttons(ContactsPagination(props));
    expect(controls[0].props.disabled).toBe(true);
    expect(controls[1].props.disabled).toBe(true);
    const html = renderToStaticMarkup(createElement(ContactsPagination, props));
    expect(html).toContain('Loading page 2');
    expect(html).toContain('aria-busy="true"');
  });

  it('does not add a pager to an initial or known single-page book', () => {
    expect(ContactsPagination({ ...defaults, page: 1 })).toBe(null);
    expect(ContactsPagination({ ...defaults, page: 1, pagination: pagination(1, 20) })).toBe(null);
  });

  it('does not use stale metadata from a different page to enable Next', () => {
    const controls = buttons(
      ContactsPagination({ ...defaults, page: 2, pagination: pagination(1, 41) }),
    );
    expect(controls[0].props.disabled).toBe(false);
    expect(controls[1].props.disabled).toBe(true);
  });

  it('renders labelled controls, a total, a live status and the export scope', () => {
    const html = renderToStaticMarkup(
      createElement(ContactsPagination, { ...defaults, page: 1, pagination: pagination(1) }),
    );
    expect(html).toContain('aria-label="Contacts pagination"');
    expect(html).toContain('aria-label="Previous contacts page"');
    expect(html).toContain('aria-label="Next contacts page"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Page 1 of 2 · 21 contacts');
    expect(html).toContain('Letter index and export cover this page.');
  });
});
