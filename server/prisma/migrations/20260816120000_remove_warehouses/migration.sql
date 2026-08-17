-- SIPROCOM runs a single site, so the warehouse dimension is removed entirely.
--
-- Stock is no longer "this product, in that warehouse" but simply "this
-- product": stock_levels becomes one row per product, and the ledger, the
-- documents and the alerts all lose their warehouse key.
--
-- Transfers disappear with it — a transfer moves goods between two sites — so
-- the enum values that named them go too.
--
-- Written by hand because `migrate dev` needs an interactive terminal. The
-- database is empty at this point, so no data has to be carried across.

-- ---------------------------------------------------------------- foreign keys

ALTER TABLE "stock_levels"    DROP CONSTRAINT "stock_levels_warehouseId_fkey";
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_warehouseId_fkey";
ALTER TABLE "goods_receipts"  DROP CONSTRAINT "goods_receipts_warehouseId_fkey";
ALTER TABLE "goods_issues"    DROP CONSTRAINT "goods_issues_warehouseId_fkey";
ALTER TABLE "goods_issues"    DROP CONSTRAINT "goods_issues_destWarehouseId_fkey";
ALTER TABLE "alerts"          DROP CONSTRAINT "alerts_warehouseId_fkey";

-- ---------------------------------------------------------------- indexes

DROP INDEX "stock_levels_warehouseId_idx";
DROP INDEX "stock_levels_productId_warehouseId_key";
DROP INDEX "stock_movements_warehouseId_createdAt_idx";
DROP INDEX "goods_receipts_warehouseId_idx";
DROP INDEX "goods_issues_warehouseId_idx";
DROP INDEX "alerts_productId_warehouseId_type_status_idx";

-- ---------------------------------------------------------------- columns

ALTER TABLE "stock_levels"    DROP COLUMN "warehouseId";
ALTER TABLE "stock_movements" DROP COLUMN "warehouseId";
ALTER TABLE "goods_receipts"  DROP COLUMN "warehouseId";
ALTER TABLE "goods_issues"    DROP COLUMN "warehouseId";
ALTER TABLE "goods_issues"    DROP COLUMN "destWarehouseId";
ALTER TABLE "alerts"          DROP COLUMN "warehouseId";

-- One stock level per product. This unique index is what the atomic conditional
-- decrement of BR-2 relies on, exactly as (productId, warehouseId) did before.
CREATE UNIQUE INDEX "stock_levels_productId_key" ON "stock_levels"("productId");

-- Dedupe lookup for BR-8, minus the warehouse.
CREATE INDEX "alerts_productId_type_status_idx" ON "alerts"("productId", "type", "status");

DROP TABLE "warehouses";

-- ---------------------------------------------------------------- enums

-- PostgreSQL cannot drop a value from an enum in place; the type is rebuilt and
-- the column re-pointed at it. The default has to be dropped first — it is
-- typed against the old enum — and put back afterwards.

CREATE TYPE "EntryReason_new" AS ENUM ('PURCHASE', 'RETURN_CUSTOMER', 'ADJUSTMENT');
ALTER TABLE "goods_receipts" ALTER COLUMN "reason" DROP DEFAULT;
ALTER TABLE "goods_receipts" ALTER COLUMN "reason" TYPE "EntryReason_new" USING ("reason"::text::"EntryReason_new");
ALTER TYPE "EntryReason" RENAME TO "EntryReason_old";
ALTER TYPE "EntryReason_new" RENAME TO "EntryReason";
DROP TYPE "EntryReason_old";
ALTER TABLE "goods_receipts" ALTER COLUMN "reason" SET DEFAULT 'PURCHASE';

CREATE TYPE "IssueReason_new" AS ENUM ('SALE', 'DAMAGE', 'SAMPLE', 'INTERNAL', 'RETURN_SUPPLIER', 'OTHER');
ALTER TABLE "goods_issues" ALTER COLUMN "reason" DROP DEFAULT;
ALTER TABLE "goods_issues" ALTER COLUMN "reason" TYPE "IssueReason_new" USING ("reason"::text::"IssueReason_new");
ALTER TYPE "IssueReason" RENAME TO "IssueReason_old";
ALTER TYPE "IssueReason_new" RENAME TO "IssueReason";
DROP TYPE "IssueReason_old";
ALTER TABLE "goods_issues" ALTER COLUMN "reason" SET DEFAULT 'SALE';
