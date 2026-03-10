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
