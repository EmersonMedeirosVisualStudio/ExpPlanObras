import { z } from 'zod';

export const billingPlanSchema = z.enum(['ANNUAL', 'BIENNIAL']);

export const createCheckoutSchema = z.object({
  plan: billingPlanSchema,
});

export const createClaimCheckoutSchema = z.object({
  cnpj: z.string().min(14),
  email: z.string().email(),
  plan: billingPlanSchema,
});

