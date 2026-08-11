'use strict';

const { z } = require('zod');

const uuid = z.string().uuid();
const positiveInt = z.coerce.number().int().positive();

const packaging = z.enum(['UNIT', 'CARTON']).default('UNIT');

const receiptLineSchema = z.object({
  productId: uuid,
  /// Quantity in `packaging` units; the server converts it to base units.
  quantity: positiveInt,
  packaging,
  unitPrice: z.coerce.number().min(0).default(0),
  lotNumber: z.string().trim().max(60).optional().nullable(),
});

const createReceiptSchema = z.object({
  supplierId: uuid.optional().nullable(),
  warehouseId: uuid,
  reason: z.enum(['PURCHASE', 'RETURN_CUSTOMER', 'ADJUSTMENT', 'TRANSFER_IN']).default('PURCHASE'),
  purchaseOrderRef: z.string().trim().max(60).optional().nullable(),
  receiptDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(receiptLineSchema).min(1, 'EMPTY_DOCUMENT'),
});

const updateReceiptSchema = createReceiptSchema.partial();

const issueLineSchema = z.object({
  productId: uuid,
  quantity: positiveInt,
  packaging,
  /// Optional override; otherwise taken from the product's price list.
  unitPrice: z.coerce.number().min(0).optional(),
});

const createIssueSchema = z
  .object({
    warehouseId: uuid,
    reason: z
      .enum(['SALE', 'TRANSFER', 'DAMAGE', 'SAMPLE', 'INTERNAL', 'RETURN_SUPPLIER', 'OTHER'])
      .default('SALE'),
    recipient: z.string().trim().max(150).optional().nullable(),
    destWarehouseId: uuid.optional().nullable(),
    issueDate: z.coerce.date().optional(),
    notes: z.string().trim().max(500).optional().nullable(),
    lines: z.array(issueLineSchema).min(1, 'EMPTY_DOCUMENT'),
  })
  .refine((d) => d.reason !== 'TRANSFER' || Boolean(d.destWarehouseId), {
    message: 'DEST_WAREHOUSE_REQUIRED',
    path: ['destWarehouseId'],
  })
  .refine((d) => !d.destWarehouseId || d.destWarehouseId !== d.warehouseId, {
    message: 'SAME_WAREHOUSE_TRANSFER',
    path: ['destWarehouseId'],
  });

const updateIssueSchema = z.object({
  warehouseId: uuid.optional(),
  reason: z
    .enum(['SALE', 'TRANSFER', 'DAMAGE', 'SAMPLE', 'INTERNAL', 'RETURN_SUPPLIER', 'OTHER'])
    .optional(),
  recipient: z.string().trim().max(150).optional().nullable(),
  destWarehouseId: uuid.optional().nullable(),
  issueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(issueLineSchema).min(1, 'EMPTY_DOCUMENT').optional(),
});

/** BR-6: a stock adjustment without a stated reason is never accepted. */
const adjustStockSchema = z.object({
  productId: uuid,
  warehouseId: uuid,
  countedQuantity: z.coerce.number().int().min(0),
  reason: z.string().trim().min(3, 'REASON_REQUIRED').max(300),
  allowNegative: z.boolean().optional(),
});

const validateDocSchema = z.object({
  allowNegative: z.boolean().optional(),
});

const cancelDocSchema = z.object({
  reason: z.string().trim().min(3, 'REASON_REQUIRED').max(300),
});

const idParamSchema = z.object({ id: uuid });

module.exports = {
  createReceiptSchema,
  updateReceiptSchema,
  createIssueSchema,
  updateIssueSchema,
  adjustStockSchema,
  validateDocSchema,
  cancelDocSchema,
  idParamSchema,
};
