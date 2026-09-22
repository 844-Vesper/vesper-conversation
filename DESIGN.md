# Vesper visual system — Conversation

Canonical version: **Vesper 1**, approved September 2026.

The canonical CSS lives in `tokens.css` in this repository. Each Vesper application owns an independent copy, its own locally hosted font, and its own emblem asset. There is no shared runtime, package, symlink, cross-repository import, or asset host. Future token revisions should be reviewed and applied independently to both applications.

## Canonical tokens

```css
/* Vesper canonical tokens v1. Independent local copy; no cross-project imports. */
@font-face {
  font-family: "Cormorant Garamond";
  src: url("/assets/cormorant-garamond.ttf") format("truetype");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
:root {
  color-scheme: dark;
  --vesper-bg: #090908;
  --vesper-surface: #151310;
  --vesper-surface-raised: #1c1915;
  --vesper-hover: #211c16;
  --vesper-text: #e7dfce;
  --vesper-text-secondary: #a59d90;
  --vesper-text-quiet: #8b8479;
  --vesper-text-inverse: #090908;
  --vesper-umber: #352b22;
  --vesper-umber-hover: #403329;
  --vesper-accent-text: #c3b19b;
  --vesper-rule: #332d26;
  --vesper-rule-strong: #514437;
  --vesper-control-border: #82715b;
  --vesper-control-border-hover: #baa488;
  --vesper-focus: #e7dfce;
  --vesper-selected-bg: #e7dfce;
  --vesper-selected-text: #090908;
  --vesper-selection-bg: #352b22;
  --vesper-backdrop: rgb(0 0 0 / 85%);

  --vesper-font-serif: "Cormorant Garamond", "Baskerville", "Palatino Linotype", Georgia, serif;
  --vesper-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --vesper-weight-heading: 400;
  --vesper-leading-heading: 1.15;
  --vesper-leading-body: 1.5;
  --vesper-leading-compact: 1.4;
  --vesper-tracking-heading: -0.015em;
  --vesper-tracking-body: 0;
  --vesper-tracking-label: 0.08em;
  --vesper-tracking-wordmark: 0.08em;
  --vesper-tracking-code: 0.04em;
  --vesper-text-xs: 0.75rem;
  --vesper-text-sm: 0.875rem;
  --vesper-text-md: 1rem;
  --vesper-text-lg: 1.125rem;
  --vesper-text-xl: 1.25rem;
  --vesper-heading-sm: 1.5rem;
  --vesper-heading-md: 2rem;
  --vesper-heading-lg: 2.5rem;
  --vesper-heading-xl: 2.875rem;

  --vesper-space-1: 0.25rem;
  --vesper-space-2: 0.5rem;
  --vesper-space-3: 0.75rem;
  --vesper-space-4: 1rem;
  --vesper-space-6: 1.5rem;
  --vesper-space-8: 2rem;
  --vesper-space-10: 2.5rem;
  --vesper-space-12: 3rem;
  --vesper-space-16: 4rem;
  --vesper-space-20: 5rem;
  --vesper-radius: 0;
  --vesper-border-width: 1px;
  --vesper-focus-width: 2px;
  --vesper-focus-offset: 4px;
  --vesper-control-height: 2.75rem;
  --vesper-control-height-large: 3.25rem;
  --vesper-shadow: none;
  --vesper-transition: 120ms ease-out;

  /* Operational semantics only: never brand, navigation, or category colors. */
  --vesper-status-healthy: #abb89c;
  --vesper-status-warning: #c8aa7d;
  --vesper-status-error: #d2a398;
  --vesper-status-expired: #a59d90;

  /* Calendar treatment can change without altering other selected controls. */
  --vesper-calendar-selected-bg: var(--vesper-selected-bg);
  --vesper-calendar-selected-text: var(--vesper-selected-text);
  --vesper-calendar-selected-border: var(--vesper-selected-bg);
}
```

## Intentional differences

| Treatment | Conversation | Administration |
|---|---|---|
| Purpose | Sparse invitation and scheduling threshold | Dense operational overview and registers |
| Body | Cormorant Garamond, 20px/1.5; supporting copy 16–18px | System sans, 14px/1.5; table rows 14px; supporting labels at least 12px |
| Headings | Serif 46px desktop, 40px mobile, 36px on the narrowest screens; sections 32px | Same serif, page titles 32–40px; sections 24px |
| Measure | 528px outer measure; 320px form; one shared left edge | Existing sidebar, wide workspace, tables, and multi-column dashboard |
| Spacing | 40px desktop gutters, 24px mobile; 48–64px section separations | 40px desktop gutters, 24px mobile; 24–32px section separations |
| Controls | 52px tall, 18px serif labels; underline invitation input remains Georgia for code legibility | 44px general controls, 14px sans labels; explicit text statuses |
| Emblem | Standalone original mark, 52px desktop / 46px mobile | Small 20px mark beside a restrained VESPER wordmark; no contrasting period |
| Surfaces | Mostly bare background, plus a contained scheduling dialog | Selective surfaces for calendar/attention areas; ruled tables rather than rounded cards |

Font files and the SIL Open Font License are included locally in each application. Cormorant Garamond headings use the supplied regular weight. Do not synthesize decorative bold or use delicate serif text for operational tables.

## Palette and components

Use the neutral/umber palette for branding, navigation, calendar categories, and decorative elements. No gradients, shadows, glow, glass, faux parchment, gothic ornament, or decorative animation. Geometry is square; circular status dots are an intentional small exception.

Decorative rules use `--vesper-rule`; interactive borders use the stronger `--vesper-control-border`. Both applications use the same 2px bone focus outline with 4px offset. Buttons have a shared square outline/hover family, with umber reserved for occasional emphasis. Disabled controls use explicit muted colors, not parent opacity. A waiting cursor is reserved for a real pending request.

Essential admin labels are at least 12px; density comes from layout rather than miniature text. In admin, tables and dates use tabular numerals where appropriate. Larger labels may wrap naturally or require horizontal table scrolling on mobile.

All original conversation copy is preserved. Admin copy changes are limited to the approved cleanup: Dashboard replaces the atmospheric title, the sidebar motto is removed, and loading language is direct. The existing operational information hierarchy remains intact.

## Semantic status colors

These tokens are **not brand colors**. Use them only with explicit operational text:

- Healthy `#abb89c`: Healthy, In good order, Good, Ready, Confirmed, Reimbursed.
- Warning `#c8aa7d`: Warning, Renewal approaching, Review due, Unconfirmed, Expiring soon.
- Error `#d2a398`: Error and Overdue.
- Expired `#a59d90`: Expired; its text identifies the state even when visually subdued.
- Other states remain neutral, including Active, Current, Draft, Pending, Scheduled, and Revoked.

Do not infer a positive or negative condition merely from an arbitrary word fragment. In particular, pending recruitment steps and draft documents are not automatically warnings. Every colored dot is accompanied by its status label; decorative dots are hidden from assistive technology.

## Calendar selection

The initial selected date is bone with inverse text. Its marker inherits the selected text color. Today has a separate outline; category markers stay in the neutral/umber family and have textual descriptions.

To change **only calendar selection** to umber, override these tokens in the application's stylesheet:

```css
:root {
  --vesper-calendar-selected-bg: var(--vesper-umber);
  --vesper-calendar-selected-text: var(--vesper-text);
  --vesper-calendar-selected-border: var(--vesper-control-border);
}
```

No calendar JavaScript or other selected-control styling needs to change. These tokens govern the native admin calendar; they do not reach into Cal.com's third-party iframe.

## Logo asset

`assets/vesper-mark.svg` (under `public/` in admin) embeds the original supplied PNG losslessly and applies a fixed luminance-to-alpha transformation inside the self-contained SVG. It preserves the mark's geometry, proportion, and source pixels while rendering warm bone on a transparent background. It is not a generative redraw. There are no external asset requests, page CSS filters, or blend-mode dependencies. The fixed bone channels correspond to `#e7dfce`; a future change to brand foreground should update both independent assets.

## Interaction and accessibility

Only color, background-color, and border-color transition, over 120ms. Reduced-motion preference disables transitions. There are no page or content fades. Conversation no longer waits through a 400ms fade-out and 400ms fade-in; focus, invitation checks, cooldown, scheduling, and modal behavior remain unchanged.

Preserve visible focus, labels, native buttons, semantic tables, focus return from the dialog, and keyboard calendar navigation. Do not disable zoom or use animation to communicate state.

The Cal.com dialog shell uses these tokens; the provider iframe retains its existing supported dark theme and functionality. Do not attempt to override its internal DOM from this application.

## Verification and visual review

Run this repository's existing checks after visual updates. Packaging must include its own tokens, font, license, and emblem. Never add a runtime reference to the other repository.

Review desktop and mobile widths, 200% zoom, font loading, emblem transparency and scale, focus outlines, disabled/loading states, and reduced motion. Pay particular attention to admin table scrolling and header wrapping, the bone calendar selection's prominence, and conversation's modal transition into the provider's dark theme.

No live credentials or candidate data are needed for visual review. This styling update does not change authentication, APIs, storage, booking rules, or security boundaries.

