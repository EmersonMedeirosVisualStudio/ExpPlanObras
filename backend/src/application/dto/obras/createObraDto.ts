import { z } from 'zod'

export const createObraDto = z.object({
  name: z.string().min(3, 'Nome da obra é obrigatório'),
  contratoId: z.number().int().positive('Contrato é obrigatório'),
  type: z.enum(['PUBLICA', 'PARTICULAR']),
  status: z.enum(['AGUARDANDO_RECURSOS', 'AGUARDANDO_CONTRATO', 'AGUARDANDO_OS', 'NAO_INICIADA', 'EM_ANDAMENTO', 'PARADA', 'FINALIZADA']),
  description: z.string().optional(),
  valorPrevisto: z.number().optional(),
})

export type CreateObraDto = z.infer<typeof createObraDto>
