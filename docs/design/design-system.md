# Stockroom design system

**Status:** Initial implementation, 2026-11-25. Not all routes have adopted these primitives.

## Principles

- Make operational data easy to scan before adding decoration.
- Keep the existing Stockroom forest-green identity and neutral surfaces.
- Use real API data and capability-gated actions only.
- Keep organization terminology in routes and API contracts while presenting “Business” to users where it is clearer.
- Use semantic HTML and visible keyboard focus; treat accessibility as a requirement to verify, not a claim based on styling.

## Tokens

`apps/web/src/styles/tokens.css` defines the shared UI palette, semantic status colors, radius, surface shadow, focus ring, control height, spacing scale and dialog layering tokens. Existing global tokens remain in place for legacy routes during incremental adoption.

Typography targets: page titles 25–30px, section headings 14–18px, body/table copy 13–14px, supporting labels 11–12px. Table cells are left aligned by default; the table component supports right alignment for numeric values.

## Shared components implemented

- `PageHeader`: optional eyebrow, title, description and primary action slot.
- `DataTable`: semantic column headers, stable row keys, loading and empty states, keyboard-focusable horizontal scroll region, row hover and alignment support.
- `StatusBadge`: human-readable labels for current known statuses and semantic tones.
- `ConfirmDialog`: native accessible `<dialog>` modal behavior with cancel/confirm actions and a busy state.
- `Drawer`: native modal side panel for short create/edit forms, with a mobile bottom-sheet layout and keyboard close handling.
- `tokens.css`: shared primitive design values.

These components are being introduced on `/customers` and `/suppliers`; there is no claim of repository-wide adoption.

## Layout and interaction

- Directory pages use one compact title block and one main list surface.
- Search and status controls remain server-backed, search is debounced, and filters reset pagination when changed.
- Tables keep long datasets horizontally scrollable on narrow screens rather than forcing page-wide overflow.
- Destructive actions require an explicit confirmation and preserve the existing API mutation path.
- Short customer and supplier forms use the shared drawer; field values remain in route state if the request fails.
- Loading and no-results states are distinct. API error banners remain owned by each existing route.

## Next system work

Standardize form fields and sections, replace duplicated filter/pagination markup, add shared alert/empty/error primitives, then adopt the system in product/catalog and inventory pages. Avoid deleting legacy styles until each replacement route is visually and functionally verified.
