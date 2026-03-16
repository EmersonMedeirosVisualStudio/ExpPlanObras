
import { z } from "zod";

export const createTenantSchema = z.object({
  name: z.string().min(3, { message: 'Nome da empresa obrigatório' }),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, { message: 'Slug inválido: use letras minúsculas, números e hífen' })
    .min(3, { message: 'Slug deve ter no mínimo 3 caracteres' })
    .optional(),
  cnpj: z.string().min(14, { message: 'CNPJ inválido' }),
  companyEmail: z.string().email({ message: 'E-mail da empresa inválido' }),
  companyWhatsapp: z.string().optional(),
  link: z.string().optional(),
  street: z.string().min(1, { message: 'Rua obrigatória' }),
  number: z.string().min(1, { message: 'Número obrigatório' }),
  neighborhood: z.string().min(1, { message: 'Bairro obrigatório' }),
  city: z.string().min(1, { message: 'Cidade obrigatória' }),
  state: z.string().regex(/^[A-Z]{2}$/, { message: 'UF inválida (use 2 letras, ex: SP)' }),
  cep: z.string().min(8, { message: 'CEP obrigatório' }),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  // Representative details
  representativeName: z.string().min(3, { message: 'Nome do representante obrigatório' }),
  representativeEmail: z.string().email({ message: 'E-mail do representante inválido' }),
  representativeCpf: z.string().min(11, { message: 'CPF do representante inválido' }),
  representativePassword: z
    .string()
    .min(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Senha deve conter pelo menos 1 letra e 1 número' }),
  representativeWhatsapp: z.string().optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(3).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, { message: 'Slug inválido: use letras minúsculas, números e hífen' })
    .min(3, { message: 'Slug deve ter no mínimo 3 caracteres' })
    .optional(),
  cnpj: z.string().min(14).optional(),
  companyEmail: z.string().email({ message: 'E-mail da empresa inválido' }).optional(),
  companyWhatsapp: z.string().optional(),
  link: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().regex(/^[A-Z]{2}$/, { message: 'UF inválida (use 2 letras, ex: SP)' }).optional(),
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
