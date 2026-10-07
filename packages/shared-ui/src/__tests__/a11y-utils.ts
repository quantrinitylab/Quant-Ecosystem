// ============================================================================
// Lightweight A11y Checker - Custom accessibility validation utilities
// Checks for common WCAG 2.1 violations without external dependencies
// ============================================================================

export interface A11yViolation {
  rule: string;
  element: string;
  message: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
}

export interface A11yResult {
  violations: A11yViolation[];
  passes: number;
  incomplete: number;
}

/**
 * Check for images missing alt attribute
 */
export function checkImagesHaveAlt(container: Element): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const images = container.querySelectorAll('img');

  images.forEach((img) => {
    const alt = img.getAttribute('alt');
    if (alt === null) {
      violations.push({
        rule: 'image-alt',
        element: img.outerHTML.slice(0, 80),
        message: 'Images must have an alt attribute for screen readers',
        impact: 'critical',
      });
    }
  });

  return violations;
}

/**
 * Check for inputs missing associated labels
 */
export function checkInputsHaveLabels(container: Element): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const inputs = container.querySelectorAll('input, textarea, select');

  inputs.forEach((input) => {
    const id = input.getAttribute('id');
    const ariaLabel = input.getAttribute('aria-label');
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    const title = input.getAttribute('title');
    const type = input.getAttribute('type');

    // Hidden inputs don't need labels
    if (type === 'hidden') return;

    // Check if there's a label association
    const hasLabel =
      ariaLabel || ariaLabelledBy || title || (id && container.querySelector(`label[for="${id}"]`));

    // Check if wrapped in a label
    const parentLabel = input.closest('label');

    if (!hasLabel && !parentLabel) {
      violations.push({
        rule: 'input-label',
        element: input.outerHTML.slice(0, 80),
        message: 'Form inputs must have an associated label, aria-label, or aria-labelledby',
        impact: 'critical',
      });
    }
  });

  return violations;
}

/**
 * Check for interactive elements missing role attributes
 */
export function checkInteractiveRoles(container: Element): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const interactiveElements = container.querySelectorAll(
    'div[onclick], span[onclick], div[tabindex], span[tabindex]',
  );

  interactiveElements.forEach((el) => {
    const role = el.getAttribute('role');
    const tabindex = el.getAttribute('tabindex');

    // Elements with tabindex="-1" are not interactive by keyboard
    if (tabindex === '-1') return;

    if (!role) {
      violations.push({
        rule: 'interactive-role',
        element: el.outerHTML.slice(0, 80),
        message: 'Interactive elements must have an explicit ARIA role',
        impact: 'serious',
      });
    }
  });

  return violations;
}

/**
 * Basic color contrast check (checks for known bad combinations)
 * Returns violations for elements with inline styles that have insufficient contrast
 */
export function checkColorContrast(container: Element): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const elements = container.querySelectorAll('[style]');

  // Very light text colors that are problematic on white backgrounds
  const lowContrastColors = [
    'color: #fff',
    'color: white',
    'color: #ffffff',
    'color: #eee',
    'color: #ddd',
    'color: #ccc',
    'color: lightgray',
    'color: lightgrey',
  ];

  elements.forEach((el) => {
    const style = el.getAttribute('style') || '';
    const styleLower = style.toLowerCase().replace(/\s/g, '');

    // Check for white text without explicit dark background
    const hasLowContrastText = lowContrastColors.some((c) =>
      styleLower.includes(c.replace(/\s/g, '')),
    );
    const hasDarkBackground =
      styleLower.includes('background-color:#0') ||
      styleLower.includes('background-color:#1') ||
      styleLower.includes('background-color:#2') ||
      styleLower.includes('background-color:#3') ||
      styleLower.includes('background:black') ||
      styleLower.includes('background-color:black');

    if (hasLowContrastText && !hasDarkBackground) {
      violations.push({
        rule: 'color-contrast',
        element: el.outerHTML.slice(0, 80),
        message: 'Text must have sufficient color contrast against its background (WCAG 2.1 AA)',
        impact: 'serious',
      });
    }
  });

  return violations;
}

/**
 * Check for proper heading hierarchy (h1-h6 should not skip levels)
 */
export function checkHeadingHierarchy(container: Element): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');

  let lastLevel = 0;

  headings.forEach((heading) => {
    const level = parseInt(heading.tagName[1]!, 10);

    if (lastLevel > 0 && level > lastLevel + 1) {
      violations.push({
        rule: 'heading-hierarchy',
        element: heading.outerHTML.slice(0, 80),
        message: `Heading levels should not skip (found h${level} after h${lastLevel})`,
        impact: 'moderate',
      });
    }

    lastLevel = level;
  });

  return violations;
}

/**
 * Check for valid ARIA attributes
 */
export function checkAriaAttributes(container: Element): A11yViolation[] {
  const violations: A11yViolation[] = [];

  const validAriaAttributes = new Set([
    'aria-activedescendant',
    'aria-atomic',
    'aria-autocomplete',
    'aria-busy',
    'aria-checked',
    'aria-colcount',
    'aria-colindex',
    'aria-colspan',
    'aria-controls',
    'aria-current',
    'aria-describedby',
    'aria-details',
    'aria-disabled',
    'aria-dropeffect',
    'aria-errormessage',
    'aria-expanded',
    'aria-flowto',
    'aria-grabbed',
    'aria-haspopup',
    'aria-hidden',
    'aria-invalid',
    'aria-keyshortcuts',
    'aria-label',
    'aria-labelledby',
    'aria-level',
    'aria-live',
    'aria-modal',
    'aria-multiline',
    'aria-multiselectable',
    'aria-orientation',
    'aria-owns',
    'aria-placeholder',
    'aria-posinset',
    'aria-pressed',
    'aria-readonly',
    'aria-relevant',
    'aria-required',
    'aria-roledescription',
    'aria-rowcount',
    'aria-rowindex',
    'aria-rowspan',
    'aria-selected',
    'aria-setsize',
    'aria-sort',
    'aria-valuemax',
    'aria-valuemin',
    'aria-valuenow',
    'aria-valuetext',
  ]);

  const allElements = container.querySelectorAll('*');
  allElements.forEach((el) => {
    const attrs = el.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i]!;
      if (attr.name.startsWith('aria-') && !validAriaAttributes.has(attr.name)) {
        violations.push({
          rule: 'aria-valid-attr',
          element: el.outerHTML.slice(0, 80),
          message: `Invalid ARIA attribute: ${attr.name}`,
          impact: 'critical',
        });
      }
    }
  });

  return violations;
}

/**
 * Check for buttons without accessible names
 */
export function checkButtonsHaveNames(container: Element): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const buttons = container.querySelectorAll('button, [role="button"]');

  buttons.forEach((button) => {
    const textContent = button.textContent?.trim();
    const ariaLabel = button.getAttribute('aria-label');
    const ariaLabelledBy = button.getAttribute('aria-labelledby');
    const title = button.getAttribute('title');
    const hasImage = button.querySelector('img[alt]');
    const hasSvgTitle = button.querySelector('svg title');

    if (!textContent && !ariaLabel && !ariaLabelledBy && !title && !hasImage && !hasSvgTitle) {
      violations.push({
        rule: 'button-name',
        element: button.outerHTML.slice(0, 80),
        message: 'Buttons must have an accessible name (text content, aria-label, or title)',
        impact: 'critical',
      });
    }
  });

  return violations;
}

/**
 * Check for forms with inputs that lack label associations
 */
export function checkFormLabelAssociation(container: Element): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const forms = container.querySelectorAll('form');

  forms.forEach((form) => {
    const inputs = form.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
    );
    const labels = form.querySelectorAll('label');

    inputs.forEach((input) => {
      const id = input.getAttribute('id');
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledBy = input.getAttribute('aria-labelledby');
      const parentLabel = input.closest('label');

      if (ariaLabel || ariaLabelledBy || parentLabel) return;

      if (!id) {
        violations.push({
          rule: 'form-label-association',
          element: input.outerHTML.slice(0, 80),
          message: 'Form inputs must have an id to associate with a label element',
          impact: 'serious',
        });
        return;
      }

      const hasMatchingLabel = Array.from(labels).some((label) => label.getAttribute('for') === id);

      if (!hasMatchingLabel) {
        violations.push({
          rule: 'form-label-association',
          element: input.outerHTML.slice(0, 80),
          message: `Input with id="${id}" has no associated label[for="${id}"]`,
          impact: 'serious',
        });
      }
    });
  });

  return violations;
}

/**
 * Run all accessibility checks on a container element
 */
export function runA11yAudit(container: Element): A11yResult {
  const allViolations: A11yViolation[] = [
    ...checkImagesHaveAlt(container),
    ...checkInputsHaveLabels(container),
    ...checkInteractiveRoles(container),
    ...checkColorContrast(container),
    ...checkHeadingHierarchy(container),
    ...checkAriaAttributes(container),
    ...checkButtonsHaveNames(container),
    ...checkFormLabelAssociation(container),
  ];

  return {
    violations: allViolations,
    passes: 8 - (allViolations.length > 0 ? 1 : 0),
    incomplete: 0,
  };
}
