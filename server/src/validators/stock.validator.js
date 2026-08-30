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

/**
 * `id` is optional and client-supplied. An offline device generates it once and
 * reuses it on every replay, so a retry collides on the primary key instead of
 * writing the document a second time. See lib/idempotency.js.
 */
const createReceiptSchema = z.object({
  id: uuid.optional(),
  supplierId: uuid.optional().nullable(),
  reason: z.enum(['PURCHASE', 'RETURN_CUSTOMER']).default('PURCHASE'),
  purchaseOrderRef: z.string().trim().max(60).optional().nullable(),
  receiptDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(receiptLineSchema).min(1, 'EMPTY_DOCUMENT'),
});

// `id` is omitted, not just made optional: a PATCH body carrying one would
// otherwise be spread into the update and try to repoint the primary key.
const updateReceiptSchema = createReceiptSchema.omit({ id: true }).partial();

const issueLineSchema = z.object({
  productId: uuid,
  quantity: positiveInt,
  packaging,
  /// Optional override; otherwise taken from the product's price list.
  unitPrice: z.coerce.number().min(0).optional(),
});

const issueReason = z.enum(['SALE', 'RETURN_SUPPLIER']);

// The two cross-field refinements that used to live here guarded transfers
// between sites. With one site there is no destination to validate.
const createIssueSchema = z.object({
  /** Client-supplied on an offline replay. See createReceiptSchema above. */
  id: uuid.optional(),
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
  /**
   * Client-supplied id for the ADJUSTMENT movement this will write. Same
   * purpose as on the document schemas: it makes a replayed correction land
   * once rather than once per attempt.
   */
  id: uuid.optional(),
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
