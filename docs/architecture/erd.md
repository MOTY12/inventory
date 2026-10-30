# Entity relationship overview

```mermaid
erDiagram
  ORGANIZATION ||--o{ MEMBERSHIP : has
  USER ||--o{ MEMBERSHIP : joins
  ORGANIZATION ||--o{ BRANCH : owns
  BRANCH ||--o{ WAREHOUSE : contains
  ORGANIZATION ||--o{ PRODUCT : owns
  CATEGORY ||--o{ PRODUCT : groups
  UNIT ||--o{ PRODUCT : base_unit
  ORGANIZATION ||--o{ SUPPLIER : owns
  ORGANIZATION ||--o{ CUSTOMER : owns
  WAREHOUSE ||--o{ INVENTORY_BALANCE : holds
  PRODUCT ||--o{ INVENTORY_BALANCE : balance
  PRODUCT ||--o{ STOCK_MOVEMENT : records
  WAREHOUSE ||--o{ STOCK_MOVEMENT : location
  PURCHASE_ORDER ||--|{ PURCHASE_ORDER_LINE : contains
  PURCHASE_ORDER ||--o{ GOODS_RECEIPT : receives
  GOODS_RECEIPT ||--|{ GOODS_RECEIPT_LINE : contains
  SUPPLIER ||--o{ PURCHASE_ORDER : supplies
  SALES_ORDER ||--|{ SALES_ORDER_LINE : contains
  CUSTOMER ||--o{ SALES_ORDER : places
  SALES_ORDER_LINE ||--o{ INVENTORY_RESERVATION : reserves
  SALES_ORDER ||--o{ INVOICE : invoices
  INVOICE ||--o{ PAYMENT_ALLOCATION : settles
  PAYMENT ||--o{ PAYMENT_ALLOCATION : applies
  STOCK_TRANSFER ||--|{ STOCK_TRANSFER_LINE : contains
  STOCK_TRANSFER ||--o{ TRANSFER_RECEIPT : receives
  USER ||--o{ AUDIT_EVENT : acts
  ORGANIZATION ||--o{ AUDIT_EVENT : scopes
```

Every relationship is tenant-scoped. Add `organization_id` to bridge/document/line rows and enforce same-tenant foreign keys. The diagram omits auth/session, RBAC grants, product conversions, audit/outbox, imports/exports and subscription entities for readability. Exact optionality and cascade behavior must be encoded in migrations after approval. Never cascade-delete posted ledger or financial documents.
