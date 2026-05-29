import { z } from 'zod'

export const updateObraDto = z.object({
  name: z.string().min(3).optional(),
  contratoId: z.number().int().positive().optional(),
  type: z.enum(['PUBLICA', 'PARTICULAR']).optional(),
  status: z.enum(['AGUARDANDO_RECURSOS', 'AGUARDANDO_CONTRATO', 'AGUARDANDO_OS', 'NAO_INICIADA', 'EM_ANDAMENTO', 'PARADA', 'FINALIZADA']).optional(),
  description: z.string().optional(),
  valorPrevisto: z.number().optional(),
})

export type UpdateObraDto = z.infer<typeof updateObraDto>
