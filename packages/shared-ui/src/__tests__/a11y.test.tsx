// @vitest-environment jsdom
// ============================================================================
// Shared UI - Accessibility Tests
// Custom a11y checker validating common WCAG 2.1 violations
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  runA11yAudit,
  checkImagesHaveAlt,
  checkInputsHaveLabels,
  checkInteractiveRoles,
  checkColorContrast,
  checkHeadingHierarchy,
  checkAriaAttributes,
  checkButtonsHaveNames,
  checkFormLabelAssociation,
} from './a11y-utils';

describe('A11y: Images must have alt text', () => {
  it('detects images without alt attribute', () => {
    const { container } = render(
      <div>
        <img src="photo.png" />
        <img src="logo.svg" />
      </div>,
    );
    const violations = checkImagesHaveAlt(container);
    expect(violations).toHaveLength(2);
    expect(violations[0]!.rule).toBe('image-alt');
    expect(violations[0]!.impact).toBe('critical');
  });

  it('passes when all images have alt attributes', () => {
    const { container } = render(
      <div>
        <img src="photo.png" alt="A beautiful landscape" />
        <img src="decorative.svg" alt="" />
      </div>,
    );
    const violations = checkImagesHaveAlt(container);
    expect(violations).toHaveLength(0);
  });
});

describe('A11y: Form inputs must have labels', () => {
  it('detects inputs without labels', () => {
    const { container } = render(
      <div>
        <input type="text" />
        <textarea></textarea>
      </div>,
    );
    const violations = checkInputsHaveLabels(container);
    expect(violations).toHaveLength(2);
    expect(violations[0]!.rule).toBe('input-label');
  });

  it('passes when inputs have aria-label', () => {
    const { container } = render(
      <div>
        <input type="text" aria-label="Username" />
        <textarea aria-label="Message"></textarea>
      </div>,
    );
    const violations = checkInputsHaveLabels(container);
    expect(violations).toHaveLength(0);
  });

  it('passes when inputs are wrapped in labels', () => {
    const { container } = render(
      <div>
        <label>
          Username
          <input type="text" />
        </label>
      </div>,
    );
    const violations = checkInputsHaveLabels(container);
    expect(violations).toHaveLength(0);
  });
});

describe('A11y: Interactive elements must have roles', () => {
  it('detects clickable divs without role', () => {
    const { container } = render(
      <div>
        <div onClick={() => {}} tabIndex={0}>
          Click me
        </div>
        <span onClick={() => {}} tabIndex={0}>
          Another
        </span>
      </div>,
    );
    const violations = checkInteractiveRoles(container);
    expect(violations).toHaveLength(2);
    expect(violations[0]!.rule).toBe('interactive-role');
  });

  it('passes when interactive elements have roles', () => {
    const { container } = render(
      <div>
        <div onClick={() => {}} tabIndex={0} role="button">
          Click me
        </div>
      </div>,
    );
    const violations = checkInteractiveRoles(container);
    expect(violations).toHaveLength(0);
  });
});

describe('A11y: Color contrast', () => {
  it('detects low contrast text', () => {
    const { container } = render(
      <div>
        <p style={{ color: 'white' }}>Invisible text on white</p>
        <span style={{ color: 'white' }}>Also invisible</span>
      </div>,
    );
    const violations = checkColorContrast(container);
    expect(violations).toHaveLength(2);
    expect(violations[0]!.rule).toBe('color-contrast');
  });

  it('passes when dark background is provided for light text', () => {
    const { container } = render(
      <div>
        <p style={{ color: 'white', backgroundColor: 'black' }}>Good contrast</p>
      </div>,
    );
    const violations = checkColorContrast(container);
    expect(violations).toHaveLength(0);
  });
});

describe('A11y: Heading hierarchy', () => {
  it('detects skipped heading levels', () => {
    const { container } = render(
      <div>
        <h1>Title</h1>
        <h3>Skipped h2</h3>
        <h6>Skipped h4 and h5</h6>
      </div>,
    );
    const violations = checkHeadingHierarchy(container);
    expect(violations).toHaveLength(2);
    expect(violations[0]!.rule).toBe('heading-hierarchy');
    expect(violations[0]!.message).toContain('h3 after h1');
  });

  it('passes with proper heading order', () => {
    const { container } = render(
      <div>
        <h1>Title</h1>
        <h2>Section</h2>
        <h3>Subsection</h3>
      </div>,
    );
    const violations = checkHeadingHierarchy(container);
    expect(violations).toHaveLength(0);
  });
});

describe('A11y: ARIA attributes validity', () => {
  it('detects invalid ARIA attributes', () => {
    const { container } = render(
      <div>
        <button aria-badattr="true">Bad</button>
        <div aria-fakeprop="yes">Invalid</div>
      </div>,
    );
    const violations = checkAriaAttributes(container);
    expect(violations).toHaveLength(2);
    expect(violations[0]!.rule).toBe('aria-valid-attr');
  });

  it('passes with valid ARIA attributes', () => {
    const { container } = render(
      <div>
        <button aria-label="Close" aria-expanded="false">
          X
        </button>
        <div aria-hidden="true">Hidden</div>
      </div>,
    );
    const violations = checkAriaAttributes(container);
    expect(violations).toHaveLength(0);
  });
});

describe('A11y: Buttons must have accessible names', () => {
  it('detects buttons without accessible names', () => {
    const { container } = render(
      <div>
        <button></button>
        <div role="button"></div>
      </div>,
    );
    const violations = checkButtonsHaveNames(container);
    expect(violations).toHaveLength(2);
    expect(violations[0]!.rule).toBe('button-name');
    expect(violations[0]!.impact).toBe('critical');
  });

  it('passes when buttons have text content or aria-label', () => {
    const { container } = render(
      <div>
        <button>Submit</button>
        <button aria-label="Close dialog"></button>
        <button title="Menu"></button>
      </div>,
    );
    const violations = checkButtonsHaveNames(container);
    expect(violations).toHaveLength(0);
  });
});

describe('A11y: Form label association', () => {
  it('detects form inputs without label association', () => {
    const { container } = render(
      <form>
        <input type="text" id="name" />
        <input type="email" id="email" />
        <label htmlFor="other">Other</label>
      </form>,
    );
    const violations = checkFormLabelAssociation(container);
    expect(violations).toHaveLength(2);
    expect(violations[0]!.rule).toBe('form-label-association');
  });

  it('passes when form inputs have proper label associations', () => {
    const { container } = render(
      <form>
        <label htmlFor="name">Name</label>
        <input type="text" id="name" />
        <label htmlFor="email">Email</label>
        <input type="email" id="email" />
      </form>,
    );
    const violations = checkFormLabelAssociation(container);
    expect(violations).toHaveLength(0);
  });
});

describe('A11y: Full audit integration', () => {
  it('runs all checks and aggregates violations', () => {
    const { container } = render(
      <div>
        <img src="test.png" />
        <input type="text" />
        <button></button>
      </div>,
    );
    const result = runA11yAudit(container);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some((v) => v.rule === 'image-alt')).toBe(true);
    expect(result.violations.some((v) => v.rule === 'input-label')).toBe(true);
    expect(result.violations.some((v) => v.rule === 'button-name')).toBe(true);
  });

  it('returns zero violations for accessible markup', () => {
    const { container } = render(
      <div>
        <h1>Page Title</h1>
        <h2>Section</h2>
        <img src="photo.png" alt="Description" />
        <button aria-label="Close">X</button>
        <label htmlFor="search">Search</label>
        <input id="search" type="text" />
      </div>,
    );
    const result = runA11yAudit(container);
    expect(result.violations).toHaveLength(0);
  });
});
