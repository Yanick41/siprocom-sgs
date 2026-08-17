'use strict';

const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

const updateLocaleSchema = z.object({
  locale: z.enum(['fr', 'en']),
});

/**
 * First-run administrator. Length is the requirement that actually resists
 * guessing; character-class rules mostly produce "Password1!" on a sticky note.
 */
const setupSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, 'PASSWORD_TOO_SHORT').max(200),
  locale: z.enum(['fr', 'en']).default('fr'),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const tokenQuerySchema = z.object({
  token: z.string().min(1).max(500),
});

const setPasswordSchema = z.object({
  token: z.string().min(1).max(500),
  password: z.string().min(12, 'PASSWORD_TOO_SHORT').max(200),
});

module.exports = {
  loginSchema,
  updateLocaleSchema,
  setupSchema,
  forgotPasswordSchema,
  tokenQuerySchema,
  setPasswordSchema,
};
