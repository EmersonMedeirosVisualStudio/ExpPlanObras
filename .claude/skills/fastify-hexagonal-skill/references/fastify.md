# Fastify 5 — Referência de Padrões

## Setup do servidor

```ts
// src/server.ts
import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod'
import prismaPlugin from './shared/plugins/prisma.js'
import v1Routes from './modules/v1/v1.routes.js'

const server = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>()

server.setValidatorCompiler(validatorCompiler)
server.setSerializerCompiler(serializerCompiler)

await server.register(prismaPlugin)
await server.register(v1Routes, { prefix: '/api/v1' })

await server.listen({ port: 3333, host: '0.0.0.0' })
```

---

## Rota com Zod (padrão obrigatório)

```ts
// modules/contratos/infrastructure/http/contratos.routes.ts
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '@/shared/middleware/authenticate.js'
import { createContratoDto } from '../../application/dtos/createContrato.dto.js'
import { CreateContratoUseCase } from '../../application/use-cases/CreateContrato.js'
import { PrismaContratoRepository } from '../persistence/PrismaContratoRepository.js'

const contratosRoutes: FastifyPluginAsyncZod = async (server) => {
  server.addHook('onRequest', authenticate)

  server.post(
    '/',
    {
      schema: {
        body: createContratoDto,
        response: { 201: z.object({ id: z.number() }) },
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user
      const repo = new PrismaContratoRepository()
      const useCase = new CreateContratoUseCase(repo)
      const result = await useCase.execute({ tenantId, data: request.body })
      return reply.status(201).send(result)
    }
  )

  server.get(
    '/',
    {
      schema: {
        querystring: z.object({
          status: z.string().optional(),
          papel: z.enum(['CONTRATADO', 'CONTRATANTE']).optional(),
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user
      // ... use-case call
    }
  )
}

export default contratosRoutes
```

---

## Autenticação — middleware

```ts
// src/shared/middleware/authenticate.ts
import { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const { tenantId } = request.user as { tenantId: number; userId: number }
    if (typeof tenantId !== 'number') {
      return reply.status(403).send({ message: 'Tenant inválido' })
    }
  } catch {
    return reply.status(401).send({ message: 'Não autorizado' })
  }
}
```

---

## Tratamento de erros de domínio nas rotas

```ts
import { ContratoNotFoundError, ContratoConflictError } from '../../domain/errors/ContratoErrors.js'

// No handler:
try {
  const result = await useCase.execute(...)
  return reply.send(result)
} catch (e) {
  if (e instanceof ContratoNotFoundError) return reply.status(404).send({ message: e.message })
  if (e instanceof ContratoConflictError) return reply.status(409).send({ message: e.message })
  throw e  // Fastify trata os não mapeados
}
```

---

## Paginação padrão (querystring)

```ts
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  orderBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
})

type PaginationQuery = z.infer<typeof paginationSchema>

// Retorno padronizado
type PaginatedResult<T> = {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
```

---

## Plugin de rota (registro)

```ts
// modules/contratos/index.ts
import { FastifyInstance } from 'fastify'
import contratosRoutes from './infrastructure/http/contratos.routes.js'

export async function contratosModule(server: FastifyInstance) {
  await server.register(contratosRoutes, { prefix: '/contratos' })
}
```

---

## Env vars com Zod (obrigatório)

```ts
// src/env.ts
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3333),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export const env = envSchema.parse(process.env)
```
