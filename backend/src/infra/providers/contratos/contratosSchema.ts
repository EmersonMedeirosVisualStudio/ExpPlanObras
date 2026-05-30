import { z } from 'zod';

export const createContratoSchema = z.object({
  contratoPrincipalId: z.number().int().positive().optional().nullable(),
  numeroContrato: z.string().min(2),
  nome: z.string().optional().nullable(),
  objeto: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  tipoPapel: z.enum(['CONTRATADO', 'CONTRATANTE']).optional().nullable(),
  tipoContratante: z.enum(['PUBLICO', 'PRIVADO', 'PF']).optional().nullable(),
  empresaParceiraNome: z.string().optional().nullable(),
  empresaParceiraDocumento: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataFim: z.string().optional().nullable(),
  dataAssinatura: z.string().optional().nullable(),
  dataOS: z.string().optional().nullable(),
  prazoDias: z.number().int().optional().nullable(),
  vigenciaInicial: z.string().optional().nullable(),
  vigenciaAtual: z.string().optional().nullable(),
  valorContratado: z.number().optional().nullable(),
  valorTotalInicial: z.number().optional().nullable(),
});

export const updateContratoSchema = z.object({
  contratoPrincipalId: z.number().int().positive().optional().nullable(),
  numeroContrato: z.string().min(2).optional(),
  nome: z.string().optional().nullable(),
  objeto: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  tipoPapel: z.enum(['CONTRATADO', 'CONTRATANTE']).optional().nullable(),
  tipoContratante: z.enum(['PUBLICO', 'PRIVADO', 'PF']).optional().nullable(),
  empresaParceiraNome: z.string().optional().nullable(),
  empresaParceiraDocumento: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataFim: z.string().optional().nullable(),
  dataAssinatura: z.string().optional().nullable(),
  dataOS: z.string().optional().nullable(),
  prazoDias: z.number().int().optional().nullable(),
  vigenciaInicial: z.string().optional().nullable(),
  vigenciaAtual: z.string().optional().nullable(),
  valorContratado: z.number().optional().nullable(),
  valorTotalInicial: z.number().optional().nullable(),
});

export type CreateContratoInput = z.infer<typeof createContratoSchema>;
export type UpdateContratoInput = z.infer<typeof updateContratoSchema>;
