import { z } from 'zod'

export const createCriseRegistroDto = z.object({
  codigo: z.string().min(2),
  titulo: z.string().min(2),
  descricao: z.string().optional().nullable(),
  tipoCrise: z.string().min(2),
  severidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('ALTA'),
  incidenteOrigemId: z.number().int().optional().nullable(),
  planoAcionadoId: z.number().int().optional().nullable(),
})

export type CreateCriseRegistroDto = z.infer<typeof createCriseRegistroDto>
