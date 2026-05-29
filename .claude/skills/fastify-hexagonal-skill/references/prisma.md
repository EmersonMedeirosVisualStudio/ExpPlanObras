# Prisma — Referência de Padrões

## Plugin Prisma com RLS (Row-Level Security)

```ts
// src/shared/plugins/prisma.ts
import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default fp(async (server) => {
  server.decorate('prisma', prisma)
  server.addHook('onClose', async () => prisma.$disconnect())
})

// Helper para definir contexto de tenant (RLS)
export async function setTenantContext(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  tenantId: number
) {
  await tx.$executeRawUnsafe(`SET app.current_tenant_id = ${tenantId}`)
}

export { prisma }
```

---

## Transação com RLS (padrão obrigatório para multi-tenant)

```ts
// Toda query que toca dados de tenant DEVE usar withRLS
async function withRLS<T>(
  tenantId: number,
  callback: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setTenantContext(tx, tenantId)
    return callback(tx)
  })
}

// Uso no repositório
async findById(tenantId: number, id: number) {
  return withRLS(tenantId, async (tx) => {
    return tx.contrato.findFirst({ where: { id, tenantId } })
  })
}
```

---

## Paginação padronizada

```ts
async findAll(tenantId: number, filter: { page?: number; limit?: number; search?: string }) {
  const { page = 1, limit = 20, search } = filter
  const skip = (page - 1) * limit

  return withRLS(tenantId, async (tx) => {
    const where = {
      tenantId,
      ...(search ? {
        OR: [
          { numeroContrato: { contains: search, mode: 'insensitive' as const } },
          { objeto: { contains: search, mode: 'insensitive' as const } },
        ]
      } : {}),
    }

    const [data, total] = await Promise.all([
      tx.contrato.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      tx.contrato.count({ where }),
    ])

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  })
}
```

---

## Upsert seguro

```ts
async upsertContrato(tenantId: number, data: { numeroContrato: string } & Partial<Contrato>) {
  return withRLS(tenantId, async (tx) => {
    return tx.contrato.upsert({
      where: { tenantId_numeroContrato: { tenantId, numeroContrato: data.numeroContrato } },
      create: { tenantId, ...data },
      update: { ...data },
    })
  })
}
```

---

## Tratamento de erros Prisma

```ts
import { Prisma } from '@prisma/client'

function handlePrismaError(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') throw new ContratoConflictError('Registro duplicado')
    if (e.code === 'P2025') throw new ContratoNotFoundError(0)
  }
  throw e
}

// No repositório:
async create(tenantId: number, data: CreateContratoDto) {
  try {
    return await withRLS(tenantId, (tx) => tx.contrato.create({ data: { ...data, tenantId } }))
  } catch (e) {
    handlePrismaError(e)
  }
}
```

---

## Migrations

```bash
# Criar migration
npx prisma migrate dev --name add_contrato_status --schema=./prisma/postgres/schema.prisma

# Deploy em produção (sem interactive)
npx prisma migrate deploy --schema=./prisma/postgres/schema.prisma

# Gerar client após mudança de schema
npx prisma generate --schema=./prisma/postgres/schema.prisma
```

---

## Convenções de schema Prisma

```prisma
// SEMPRE incluir tenantId em modelos de domínio
model Contrato {
  id        Int      @id @default(autoincrement())
  tenantId  Int      @map("tenant_id")
  // campos...
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([tenantId])
  @@map("contratos")
}
```

**Regras:**
- `snake_case` nos nomes de colunas (`@map`) e tabelas (`@@map`)
- `camelCase` nas propriedades TypeScript
- Índice em `tenantId` obrigatório
- `createdAt` e `updatedAt` em todo modelo
