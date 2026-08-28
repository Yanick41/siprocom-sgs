'use strict';

const { z } = require('zod');

/**
 * Kept beside the client list in client/src/lib/containers.js. They were two
 * hardcoded arrays that had to agree, and adding a format to one silently made
 * the server reject it - naming the list at least makes the pairing visible.
 */
const CONTAINERS = ['glass_bottle', 'plastic_bottle', 'can', 'carton_pack', 'pouch'];

const uuid = z.string().uuid();
const optionalText = z.string().trim().max(255).optional().nullable();

// ---- Category ------------------------------------------------------------

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  nameEn: optionalText,
  description: z.string().trim().max(500).optional().nullable(),
  parentId: uuid.optional().nullable(),
});

const updateCategorySchema = createCategorySchema.partial();

// ---- Supplier ------------------------------------------------------------

const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(150),
  contact: optionalText,
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal('')),
  address: z.string().trim().max(300).optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateSupplierSchema = createSupplierSchema.partial();

// ---- Product -------------------------------------------------------------

const createProductSchema = z
  .object({
    reference: z.string().trim().min(1).max(50),
    designation: z.string().trim().min(1).max(200),
    designationEn: z.string().trim().max(200).optional().nullable(),
    categoryId: uuid,
    unit: z.string().trim().min(1).max(20).default('unit'),
    container: z.enum(CONTAINERS).optional().nullable().or(z.literal('')),
    minThreshold: z.coerce.number().int().min(0).default(0),
    maxThreshold: z.coerce.number().int().min(0).optional().nullable(),
    buyPrice: z.coerce.number().min(0).default(0),
    sellPrice: z.coerce.number().min(0).default(0),
    groupingUnit: z.enum(['carton','crate','pack']).optional().nullable().or(z.literal('')),
    cartonBuyPrice: z.coerce.number().min(0).optional().nullable(),
    unitsPerCarton: z.coerce.number().int().min(2).optional().nullable(),
    cartonSellPrice: z.coerce.number().min(0).optional().nullable(),
    isActive: z.boolean().optional(),
    supplierIds: z.array(uuid).optional(),
  })
  .refine((d) => d.maxThreshold == null || d.maxThreshold >= d.minThreshold, {
    message: 'MAX_BELOW_MIN',
    path: ['maxThreshold'],
  });

// .partial() is unavailable after .refine(), so the update shape is declared
// separately and re-checks the same threshold rule.
const updateProductSchema = z
  .object({
    reference: z.string().trim().min(1).max(50).optional(),
    designation: z.string().trim().min(1).max(200).optional(),
    designationEn: z.string().trim().max(200).optional().nullable(),
    categoryId: uuid.optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    container: z.enum(CONTAINERS).optional().nullable().or(z.literal('')),
    minThreshold: z.coerce.number().int().min(0).optional(),
    maxThreshold: z.coerce.number().int().min(0).optional().nullable(),
    buyPrice: z.coerce.number().min(0).optional(),
    sellPrice: z.coerce.number().min(0).optional(),
    groupingUnit: z.enum(['carton','crate','pack']).optional().nullable().or(z.literal('')),
    cartonBuyPrice: z.coerce.number().min(0).optional().nullable(),
    unitsPerCarton: z.coerce.number().int().min(2).optional().nullable(),
    cartonSellPrice: z.coerce.number().min(0).optional().nullable(),
    isActive: z.boolean().optional(),
    supplierIds: z.array(uuid).optional(),
  })
  .refine(
    (d) =>
      d.maxThreshold == null || d.minThreshold == null || d.maxThreshold >= d.minThreshold,
    { message: 'MAX_BELOW_MIN', path: ['maxThreshold'] }
  );

const idParamSchema = z.object({ id: uuid });

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  createSupplierSchema,
  updateSupplierSchema,
  createProductSchema,
  updateProductSchema,
  idParamSchema,
};
