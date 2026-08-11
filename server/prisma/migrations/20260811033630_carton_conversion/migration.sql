-- CreateEnum
CREATE TYPE "Packaging" AS ENUM ('UNIT', 'CARTON');

-- AlterTable
ALTER TABLE "goods_issue_lines" ADD COLUMN     "baseQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "packaging" "Packaging" NOT NULL DEFAULT 'UNIT',
ADD COLUMN     "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "goods_receipt_lines" ADD COLUMN     "baseQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "packaging" "Packaging" NOT NULL DEFAULT 'UNIT';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "cartonSellPrice" DECIMAL(12,2),
ADD COLUMN     "unitsPerCarton" INTEGER;

-- ---------------------------------------------------------------------------
-- Backfill. Without this every line already in the database keeps
-- baseQuantity = 0, and the invoice of any past issue prints as free of charge.
--
-- Every existing line predates cartons, so what was entered IS the base
-- quantity and packaging is UNIT (already the column default).
UPDATE "goods_receipt_lines" SET "baseQuantity" = "quantity" WHERE "baseQuantity" = 0;
UPDATE "goods_issue_lines"   SET "baseQuantity" = "quantity" WHERE "baseQuantity" = 0;

-- The price actually billed on a past issue was never recorded, so the current
-- sell price is the only figure available. It is an approximation, and it is a
-- far better one than zero.
UPDATE "goods_issue_lines" l
SET "unitPrice" = p."sellPrice"
FROM "products" p
WHERE p.id = l."productId" AND l."unitPrice" = 0;

-- Normalise the unit values that produced duplicate labels: `box` and `carton`
-- both rendered as "carton" in French, `pack` and `paquet` both as "paquet".
UPDATE "products" SET "unit" = 'carton' WHERE "unit" = 'box';
UPDATE "products" SET "unit" = 'bag'    WHERE "unit" = 'sac';
UPDATE "products" SET "unit" = 'pack'   WHERE "unit" = 'paquet';
