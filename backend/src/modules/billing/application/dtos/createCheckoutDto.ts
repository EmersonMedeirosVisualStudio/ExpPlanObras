import { z } from 'zod'

export const createCheckoutDto = z.object({
  plan: z.enum(['ANNUAL', 'BIENNIAL']),
})

export type CreateCheckoutDto = z.infer<typeof createCheckoutDto>
