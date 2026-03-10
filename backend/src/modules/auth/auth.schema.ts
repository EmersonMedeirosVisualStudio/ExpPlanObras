import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  cpf: z.string().min(11),
  password: z.string().min(6),
  tenantName: z.string().min(3),
  tenantSlug: z.string().min(3),
  cnpj: z.string().min(14),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  location: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
