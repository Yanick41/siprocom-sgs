-- Splits the commercial document from the delivery document.
--
-- Additive only. No column is dropped, no row is rewritten, and every existing
-- bon de sortie stays exactly as it is: deliveredAt starts null, which reads as
-- "not yet delivered", and no invoice exists until someone generates one.

-- Delivery is a separate event from validation. Validating deducts stock;
-- delivering records that the goods reached the person named on the bon.
ALTER TABLE "goods_issues"
  ADD COLUMN "deliveredAt"   TIMESTAMP(3),
  ADD COLUMN "deliveredById" TEXT;

ALTER TABLE "goods_issues"
  ADD CONSTRAINT "goods_issues_deliveredById_fkey"
  FOREIGN KEY ("deliveredById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The invoice carries no lines and no prices: they are already frozen on
-- goods_issue_lines.unitPrice, and a second copy would be free to drift.
CREATE TABLE "invoices" (
  "id"          TEXT NOT NULL,
  "number"      TEXT NOT NULL,
  "issueId"     TEXT NOT NULL,
  "notes"       TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- One invoice per bon de sortie. The unique index is what makes generation
-- idempotent: a double-click, or a replayed offline request, collides here
-- instead of burning a second FA number on the same goods.
CREATE UNIQUE INDEX "invoices_number_key"  ON "invoices"("number");
CREATE UNIQUE INDEX "invoices_issueId_key" ON "invoices"("issueId");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "goods_issues"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
