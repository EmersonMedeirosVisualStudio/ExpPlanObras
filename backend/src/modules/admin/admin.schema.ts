
import { z } from "zod";

export const createTenantSchema = z.object({
  name: z.string().min(3),
  slug: z.string().min(3),
  cnpj: z.string().min(14),
  // Representative details
  representativeName: z.string().min(3),
  representativeEmail: z.string().email(),
  representativeCpf: z.string().min(11),
  representativePassword: z.string().min(6),
  representativeWhatsapp: z.string().optional(),
  representativeAddress: z.string().optional(),
  representativeLocation: z.string().optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(3).optional(),
  slug: z.string().min(3).optional(),
  cnpj: z.string().min(14).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
