import { z } from 'zod'

export const createTenantDto = z.object({
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
  representativeName: z.string().min(3, { message: 'Nome do representante obrigatório' }),
  representativeEmail: z.string().email({ message: 'E-mail do representante inválido' }),
  representativeCpf: z.string().min(11, { message: 'CPF do representante inválido' }),
  representativePassword: z
    .string()
    .min(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Senha deve conter pelo menos 1 letra e 1 número' }),
  representativeWhatsapp: z.string().optional(),
})

export type CreateTenantDto = z.infer<typeof createTenantDto>
