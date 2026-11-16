# Accessibility

How the Website (`apps/site`) meets accessibility, and how the check is enforced. The terminal `emet` CLI has no graphical interface; it honours `NO_COLOR` and `--no-color`.

## Target

WCAG 2.2 level AA for every Website page, in the light and dark themes and at phone width.

- Text and interactive contrast meet AA in both themes. The palette ratios are computed in [docs/brand](docs/brand/README.md).
- Every control works with the keyboard alone and shows a visible focus state.
- Motion respects `prefers-reduced-motion`.
- Images have text alternatives, and pages have one `h1` and a logical heading order.

## The axe gate

Playwright runs axe-core on the key pages in the `site-quality` workflow, which runs on every PR that touches `apps/site`. Any violation at WCAG 2.2 A or AA fails the job, so a regression cannot merge. Fix the page; do not disable the rule or lower the target.

## Reporting a problem

Open an issue labelled `Type: Bug` with the page, the browser and assistive technology, and what happened. Ask for help through [SUPPORT.md](.github/SUPPORT.md).
