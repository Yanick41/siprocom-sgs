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

const signupRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/**
 * Step 2 carries step 1 with it. Nothing is stored between the screens, so the
 * account is only ever written once — an abandoned signup leaves no trace, and
 * there is no half-built row to reconcile later.
 *
 * The password rule matches the design brief: at least 8 characters with an
 * upper case, a lower case and a digit. It is looser than the 12 characters the
 * invitation link asks for, which is a deliberate concession to the spec rather
 * than an oversight.
 */
const signupCompleteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "INVALID_CODE"),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: z
    .string()
    .min(8, "PASSWORD_TOO_SHORT")
    .max(200)
    .regex(/[a-z]/, "PASSWORD_NEEDS_LOWERCASE")
    .regex(/[A-Z]/, "PASSWORD_NEEDS_UPPERCASE")
    .regex(/[0-9]/, "PASSWORD_NEEDS_DIGIT"),
});

module.exports = {
  loginSchema,
  updateLocaleSchema,
  setupSchema,
  forgotPasswordSchema,
  tokenQuerySchema,
  setPasswordSchema,
  signupRequestSchema,
  signupCompleteSchema,
};
