import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  cpf: z.string().min(11),
  password: z.string().min(8).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/),
  tenantName: z.string().min(3),
  tenantSlug: z.string().min(3),
  cnpj: z.string().min(14),
  companyEmail: z.string().email().optional(),
  link: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  cep: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  location: z.string().optional(),
  captchaToken: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
