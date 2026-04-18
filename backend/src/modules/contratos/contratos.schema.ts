import { z } from 'zod';

export const createContratoSchema = z.object({
  numeroContrato: z.string().min(2),
  descricao: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataFim: z.string().optional().nullable(),
  valorContratado: z.number().optional().nullable(),
});

export const updateContratoSchema = z.object({
  numeroContrato: z.string().min(2).optional(),
  descricao: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataFim: z.string().optional().nullable(),
  valorContratado: z.number().optional().nullable(),
});

export type CreateContratoInput = z.infer<typeof createContratoSchema>;
export type UpdateContratoInput = z.infer<typeof updateContratoSchema>;

