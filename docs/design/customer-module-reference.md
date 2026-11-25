# Customer module design reference

**Updated:** 2026-11-25 (Africa/Lagos)

`/customers` is the reference directory. Its presentation is implemented in `apps/web/src/app/customers/page.tsx` and the shared UI components in `apps/web/src/components/ui/`.

## Reference patterns

- **Page:** centered `ui-page`, maximum width 1280px; `PageHeader` places an uppercase section eyebrow, 25–30px title, concise 14px description and primary action on one row. It stacks on narrow viewports.
- **List:** a white, bordered, rounded panel with a search and status filter, then a horizontally scrollable `DataTable`. Headers use a muted background, compact uppercase labels, 11px text, 11px × 16px padding. Body cells use 13px text, 14px × 16px padding, subtle separators and hover feedback. Numeric cells use right alignment and tabular numerals.
- **Feedback:** `DataTable` renders loading and empty rows in the same table structure; errors and successful actions use the shared alert banners and retry controls.
- **States:** `StatusBadge` centralizes readable labels and positive, warning, muted and neutral tones.
- **Simple forms:** `Drawer` is a right-side native dialog, 560px maximum width, full viewport height, dimmed backdrop, titled header and scrollable body. `ui-drawer-form` uses a two-column field grid, consistent control sizing and a sticky action footer. On small screens the drawer approaches full width and the grid collapses.
- **Actions:** `ConfirmDialog` handles destructive confirmation. Actions remain permission-gated in the page using the authenticated organization role.
- **Behavior:** customer search is debounced at 250ms; search/status changes reset server-side pagination. The page uses the current organization context and existing authenticated API endpoints.

## Shared source components

`PageHeader`, `DataTable`, `StatusBadge`, `Drawer`, and `ConfirmDialog` are shared. Tokens are defined in `apps/web/src/styles/tokens.css`; component styles are in `apps/web/src/app/globals.css`. Customer does not yet use separate shared TableToolbar or TablePagination components; those are not claimed as implemented.

## Browser observation

On 2026-11-25, Chrome displayed a populated `/customers` route and its Add Customer drawer from the existing development session. The user had already opened that drawer; no customer form was submitted. A populated product list and Add Product drawer were also reviewed during the current standardization pass. Browser review is evidence of rendering only, not full interaction or responsive acceptance.
