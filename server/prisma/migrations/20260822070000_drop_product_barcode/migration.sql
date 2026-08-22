-- The barcode field is removed from the product.
--
-- There is no scanner in the workflow — the planned @zxing camera capture was
-- never built — so the field collected blanks and one more thing to skip past on
-- a form a magasinier fills in several times a day. Its unique index also meant
-- two products left blank could collide if anyone ever typed an empty string
-- rather than leaving it null.
--
-- Products are found by reference and designation, which is what a shelf label
-- carries and what people actually type.

DROP INDEX "products_barcode_key";
ALTER TABLE "products" DROP COLUMN "barcode";
