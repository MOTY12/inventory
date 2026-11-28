# Stockroom user journeys

This document records intended connected workflows and the current redesign coverage. It does not certify the underlying business workflows; those remain governed by the implementation roadmap and acceptance records.

| Journey               | Existing route path                                                              | UI redesign status                                                              |
| --------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Customer management   | `/customers` → `/customers/[customerId]` → sales order                           | Customer directory refreshed; detail/contextual order acceptance pending        |
| Supplier management   | `/suppliers` → purchase order                                                    | Supplier directory refreshed; profile and preselected supplier workflow pending |
| Product management    | `/products` → `/products/[productId]` → inventory                                | Not redesigned in this slice                                                    |
| Purchasing            | supplier → `/purchase-orders` → `/purchase-orders/[purchaseOrderId]` → inventory | Existing pages; visual and browser acceptance pending                           |
| Sales and fulfillment | customer → `/sales-orders` → detail/edit → invoice                               | Existing pages; visual and browser acceptance pending                           |
| Finance               | `/invoices` → invoice detail → `/payments` → reports                             | Existing pages; visual and browser acceptance pending                           |
| Inventory operations  | `/inventory` → counts, transfers, low stock, reorder rules                       | Existing pages; visual and mobile acceptance pending                            |
| Business setup        | `/organizations` → `/locations` → `/catalog` → `/products`                       | Existing pages; guided onboarding not implemented                               |

No test in this redesign slice created or changed a business record. Browser review was limited to populated customer and supplier lists.
