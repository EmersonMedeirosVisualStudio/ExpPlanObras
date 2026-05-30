import { z } from 'zod'

export const updateTenantDto = z.object({
  name: z.string().min(3).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, { message: 'Slug inválido: use letras minúsculas, números e hífen' })
    .min(3)
    .optional(),
  cnpj: z.string().min(14).optional(),
  companyEmail: z.string().email({ message: 'E-mail da empresa inválido' }).optional(),
  companyWhatsapp: z.string().optional(),
  link: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().regex(/^[A-Z]{2}$/, { message: 'UF inválida' }).optional(),
  cep: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  subscriptionStatus: z.enum(['NONE', 'TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED']).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  paidUntil: z.string().datetime().nullable().optional(),
})

export type UpdateTenantDto = z.infer<typeof updateTenantDto>
