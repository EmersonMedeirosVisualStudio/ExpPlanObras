import { z } from 'zod'

export const createDrExecucaoDto = z.object({
  planoId: z.number().int(),
  origemTipo: z.string().min(2),
  referenciaOrigem: z.string().optional().nullable(),
  tipoRecuperacao: z.enum(['RESTORE_TOTAL', 'RESTORE_PARCIAL', 'VALIDACAO_RESTORE', 'FAILOVER', 'ROLLBACK']),
  aprovacaoExigida: z.boolean().optional().default(false),
})

export type CreateDrExecucaoDto = z.infer<typeof createDrExecucaoDto>
