
import { z } from "zod";

export const createTenantSchema = z.object({
  name: z.string().min(3),
  slug: z.string().min(3),
  cnpj: z.string().min(14),
  companyEmail: z.string().email().optional(),
  link: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  cep: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  // Representative details
  representativeName: z.string().min(3),
  representativeEmail: z.string().email(),
  representativeCpf: z.string().min(11),
  representativePassword: z.string().min(8).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/),
  representativeWhatsapp: z.string().optional(),
  representativeAddress: z.string().optional(),
  representativeLocation: z.string().optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(3).optional(),
  slug: z.string().min(3).optional(),
  cnpj: z.string().min(14).optional(),
  companyEmail: z.string().email().optional(),
  link: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  cep: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  status: z.enum(['ACTIVE', 'TEMPORARY', 'INACTIVE']).optional(),
  subscriptionStatus: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED']).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  paidUntil: z.string().datetime().nullable().optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
