# M36 Web Implementation Contract

## Layout primitives

Implement shell with reusable regions: GlobalHeader/AppSwitcher, ProductNav, MainViewport, ContextRail, GlobalQuanty. Product pages supply content and product-specific navigation.

## Responsive behavior

Use CSS/container-query-friendly layout primitives. Avoid hard-coded page widths that break at intermediate sizes. Context rails collapse to drawers before primary content becomes unusably narrow.

## State handling

Loading and error states belong at the smallest useful boundary. A failed Drive context rail must not blank a Mail thread. Product data should render independently where contracts permit.

## Routing

Routes are product-owned and deep-linkable. Cross-product links carry safe object references and origin context, never internal authorization tokens.

## Performance UX

Prioritize first meaningful content, avoid blocking the shell on Quanty, and progressively load contextual/secondary data. List virtualization and cursor pagination are required for large collections.
