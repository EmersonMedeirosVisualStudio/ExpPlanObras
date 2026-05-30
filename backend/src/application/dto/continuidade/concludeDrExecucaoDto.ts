import { z } from 'zod'

export const concludeDrExecucaoDto = z.object({
  sucesso: z.boolean().default(true),
  rtoRealMinutos: z.number().int().optional().nullable(),
  rpoRealMinutos: z.number().int().optional().nullable(),
  resultadoResumoJson: z.unknown().optional().nullable(),
})

export type ConcludeDrExecucaoDto = z.infer<typeof concludeDrExecucaoDto>
