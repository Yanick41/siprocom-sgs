-- The document reasons are narrowed to what SIPROCOM actually records.
--
-- Entries: a purchase from a supplier, or a customer bringing goods back.
-- ADJUSTMENT is dropped — the stock-adjustment screen posts a
-- MovementType.ADJUSTMENT directly and never creates a receipt, so this value
-- had no caller anywhere in the code.
--
-- Issues: a sale, or goods returned to a supplier. Breakage, samples and
-- internal use are corrections to a count rather than movements out to someone;
-- they belong on the adjustment screen, where the reason is typed in full and
-- the audit trail keeps the wording.
--
-- Checked before writing this: the only value in use across every document in
-- the database is SALE, which stays. Nothing has to be remapped.
--
-- PostgreSQL cannot drop a value from an enum in place, so each type is rebuilt
-- and the column re-pointed at it. The default is dropped first — it is typed
-- against the old enum — and restored afterwards.

CREATE TYPE "EntryReason_new" AS ENUM ('PURCHASE', 'RETURN_CUSTOMER');
ALTER TABLE "goods_receipts" ALTER COLUMN "reason" DROP DEFAULT;
ALTER TABLE "goods_receipts" ALTER COLUMN "reason" TYPE "EntryReason_new" USING ("reason"::text::"EntryReason_new");
ALTER TYPE "EntryReason" RENAME TO "EntryReason_old";
ALTER TYPE "EntryReason_new" RENAME TO "EntryReason";
DROP TYPE "EntryReason_old";
ALTER TABLE "goods_receipts" ALTER COLUMN "reason" SET DEFAULT 'PURCHASE';

CREATE TYPE "IssueReason_new" AS ENUM ('SALE', 'RETURN_SUPPLIER');
ALTER TABLE "goods_issues" ALTER COLUMN "reason" DROP DEFAULT;
ALTER TABLE "goods_issues" ALTER COLUMN "reason" TYPE "IssueReason_new" USING ("reason"::text::"IssueReason_new");
ALTER TYPE "IssueReason" RENAME TO "IssueReason_old";
ALTER TYPE "IssueReason_new" RENAME TO "IssueReason";
DROP TYPE "IssueReason_old";
ALTER TABLE "goods_issues" ALTER COLUMN "reason" SET DEFAULT 'SALE';
