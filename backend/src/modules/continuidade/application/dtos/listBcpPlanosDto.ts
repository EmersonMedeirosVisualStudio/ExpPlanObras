import { z } from 'zod'

export const listBcpPlanosDto = z.object({
  tipo: z.string().optional(),
  ativo: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(30),
})

export type ListBcpPlanosDto = z.infer<typeof listBcpPlanosDto>
