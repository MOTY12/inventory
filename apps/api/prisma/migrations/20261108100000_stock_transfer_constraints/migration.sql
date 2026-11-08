ALTER TABLE "stock_transfers"
  ADD CONSTRAINT "stock_transfers_distinct_warehouses_check"
  CHECK ("source_warehouse_id" <> "destination_warehouse_id");

ALTER TABLE "stock_transfer_lines"
  ADD CONSTRAINT "stock_transfer_lines_positive_quantity_check"
  CHECK ("requested_quantity" > 0);

ALTER TABLE "stock_transfer_dispatch_lines"
  ADD CONSTRAINT "stock_transfer_dispatch_lines_positive_quantity_check"
  CHECK ("quantity" > 0);

ALTER TABLE "stock_transfer_dispatch_lines"
  ADD CONSTRAINT "stock_transfer_dispatch_lines_cost_pair_check"
  CHECK (("cost_per_base_unit" IS NULL) = ("cost_currency" IS NULL));

ALTER TABLE "stock_transfer_receipt_lines"
  ADD CONSTRAINT "stock_transfer_receipt_lines_positive_quantity_check"
  CHECK ("quantity" > 0);
