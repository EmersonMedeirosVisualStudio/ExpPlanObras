import { z } from "zod";

export const createObraSchema = z.object({
  name: z.string().min(3, "Nome da obra é obrigatório"),
  type: z.enum(["PUBLICA", "PARTICULAR"]),
  status: z.enum([
    "AGUARDANDO_RECURSOS",
    "AGUARDANDO_CONTRATO",
    "AGUARDANDO_OS",
    "NAO_INICIADA",
    "EM_ANDAMENTO",
    "PARADA",
    "FINALIZADA"
  ]),
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  description: z.string().optional(),
  valorPrevisto: z.number().optional(),
});

export const updateObraSchema = z.object({
  name: z.string().min(3).optional(),
  type: z.enum(["PUBLICA", "PARTICULAR"]).optional(),
  status: z.enum([
    "AGUARDANDO_RECURSOS",
    "AGUARDANDO_CONTRATO",
    "AGUARDANDO_OS",
    "NAO_INICIADA",
    "EM_ANDAMENTO",
    "PARADA",
    "FINALIZADA"
  ]).optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  description: z.string().optional(),
  valorPrevisto: z.number().optional(),
});

export type CreateObraInput = z.infer<typeof createObraSchema>;
export type UpdateObraInput = z.infer<typeof updateObraSchema>;

export const updateOrcamentoSchema = z.object({
  valorPrevisto: z.number().min(0)
});

export const createCustoSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  date: z.string().optional() // ISO date
});

export type UpdateOrcamentoInput = z.infer<typeof updateOrcamentoSchema>;
export type CreateCustoInput = z.infer<typeof createCustoSchema>;
