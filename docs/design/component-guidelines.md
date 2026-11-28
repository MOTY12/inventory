# Stockroom component guidelines

## Page header

Use `PageHeader` for the title, short purpose statement and one primary page action. Keep actions capability-gated. Do not add global actions that are not connected to a real workflow.

## Data tables

Use `DataTable` for list results. Provide a stable domain row key, semantic column names and readable renderers. Align numeric values to the right. Keep row operations limited to actions that apply to the current state and user role. Do not expose internal IDs as the main label. Pass meaningful empty text and a loading state.

## Status

Use `StatusBadge` for concise statuses and human-readable labels. Add explicit label mappings when a module introduces new backend statuses. Do not communicate status using color alone.

## Destructive confirmation

Use `ConfirmDialog` before irreversible or material actions. Explain the actual effect, disable controls while a request is pending, and invoke the existing authorized API path only after confirmation. Keep deletion and archive semantics distinct.

## Forms

Use visible labels, appropriate native input types and existing boundary validation. Group fields by the data they describe. Preserve form values when the API returns a recoverable error. Do not add unsupported model fields. The customer/supplier forms still use legacy field markup under shared visual section styling; extracting common field primitives is a later step.

## CSS

Prefer tokens and `ui-*` component classes for new work. Keep existing selectors while other routes still depend on them. Avoid stacking page-specific overrides on top of shared rules. Confirm mobile and keyboard behavior before calling a component finished.
