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
  reason: z.enum(['PURCHASE', 'RETURN_CUSTOMER', 'ADJUSTMENT']).default('PURCHASE'),
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

const issueReason = z.enum([
  'SALE',
  'DAMAGE',
  'SAMPLE',
  'INTERNAL',
  'RETURN_SUPPLIER',
  'OTHER',
]);

// The two cross-field refinements that used to live here guarded transfers
// between sites. With one site there is no destination to validate.
const createIssueSchema = z.object({
  reason: issueReason.default('SALE'),
  recipient: z.string().trim().max(150).optional().nullable(),
  recipientPhone: z.string().trim().max(40).optional().nullable(),
  recipientAddress: z.string().trim().max(300).optional().nullable(),
  issueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(issueLineSchema).min(1, 'EMPTY_DOCUMENT'),
});

const updateIssueSchema = z.object({
  reason: issueReason.optional(),
  recipient: z.string().trim().max(150).optional().nullable(),
  recipientPhone: z.string().trim().max(40).optional().nullable(),
  recipientAddress: z.string().trim().max(300).optional().nullable(),
  issueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(issueLineSchema).min(1, 'EMPTY_DOCUMENT').optional(),
});

/** BR-6: a stock adjustment without a stated reason is never accepted. */
const adjustStockSchema = z.object({
  productId: uuid,
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
