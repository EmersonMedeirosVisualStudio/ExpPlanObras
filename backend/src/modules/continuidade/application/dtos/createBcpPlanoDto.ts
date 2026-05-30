import { z } from 'zod'

export const createBcpPlanoDto = z.object({
  codigo: z.string().min(2),
  nome: z.string().min(2),
  descricao: z.string().optional().nullable(),
  tipoPlano: z.enum(['BCP', 'DR', 'CRISE']),
  modulo: z.string().optional().nullable(),
  criticidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
  rtoMinutos: z.number().int().min(1),
  rpoMinutos: z.number().int().min(0),
})

export type CreateBcpPlanoDto = z.infer<typeof createBcpPlanoDto>
