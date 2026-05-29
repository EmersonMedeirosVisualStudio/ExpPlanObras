# Arquitetura Hexagonal — Referência

## Conceito aplicado ao projeto

```
                    ┌─────────────────────────────┐
                    │         DOMÍNIO              │
                    │  Entidades + Portas (interfaces)│
                    └────────────┬────────────────┘
                                 │
              ┌──────────────────▼──────────────────┐
              │           APLICAÇÃO                  │
              │  Use Cases + DTOs (Zod)              │
              └──────┬──────────────────┬────────────┘
                     │                  │
         ┌───────────▼───┐      ┌───────▼──────────┐
         │   HTTP (Fastify│      │  Persistence     │
         │   routes)      │      │  (Prisma repos)  │
         └───────────────┘      └──────────────────┘
```

**Regra de dependência:** camadas internas nunca importam das externas.
- Domínio não importa Prisma, Fastify, Zod
- Aplicação não importa Fastify, Prisma (só as interfaces do domínio)
- Infraestrutura importa tudo e implementa as interfaces

---

## Entidade de domínio

```ts
// modules/contrato/domain/entities/Contrato.ts
export type ContratoStatus = 'ATIVO' | 'ENCERRADO' | 'RESCINDIDO'

export interface Contrato {
  id: number
  tenantId: number
  numeroContrato: string
  status: ContratoStatus
  valorTotalAtual: number | null
  vigenciaAtual: Date | null
  createdAt: Date
}

// Funções de domínio puras (sem side-effects)
export function isContratoVencido(contrato: Contrato): boolean {
  if (!contrato.vigenciaAtual) return false
  return contrato.vigenciaAtual < new Date()
}

export function calcularAlerta(contrato: Contrato): 'OK' | 'PENDENTE' | 'CRITICO' {
  if (isContratoVencido(contrato)) return 'CRITICO'
  // ... regras
  return 'OK'
}
```

---

## Porta (interface do repositório)

```ts
// modules/contrato/domain/ports/IContratoRepository.ts
import type { Contrato } from '../entities/Contrato.js'

export interface ListContratoFilter {
  status?: string
  papel?: string
  page?: number
  limit?: number
}

export interface IContratoRepository {
  findById(tenantId: number, id: number): Promise<Contrato | null>
  findAll(tenantId: number, filter: ListContratoFilter): Promise<{ data: Contrato[]; total: number }>
  create(tenantId: number, data: Omit<Contrato, 'id' | 'createdAt'>): Promise<Contrato>
  update(tenantId: number, id: number, data: Partial<Contrato>): Promise<Contrato>
  delete(tenantId: number, id: number): Promise<void>
}
```

---

## Erros de domínio

```ts
// modules/contrato/domain/errors/ContratoErrors.ts
export class ContratoNotFoundError extends Error {
  constructor(id: number) {
    super(`Contrato ${id} não encontrado`)
    this.name = 'ContratoNotFoundError'
  }
}

export class ContratoConflictError extends Error {
  constructor(numero: string) {
    super(`Número de contrato "${numero}" já existe`)
    this.name = 'ContratoConflictError'
  }
}
```

---

## DTO (Zod schema na camada de aplicação)

```ts
// modules/contrato/application/dtos/createContrato.dto.ts
import { z } from 'zod'

export const createContratoDto = z.object({
  numeroContrato: z.string().min(2),
  objeto: z.string().optional(),
  tipoPapel: z.enum(['CONTRATADO', 'CONTRATANTE']).optional(),
  tipoContratante: z.enum(['PUBLICO', 'PRIVADO', 'PF']).default('PRIVADO'),
  valorTotalInicial: z.number().positive().optional(),
  dataAssinatura: z.string().date().optional(),
  prazoDias: z.number().int().positive().optional(),
})

export type CreateContratoDto = z.infer<typeof createContratoDto>
```

---

## Use Case

```ts
// modules/contrato/application/use-cases/CreateContrato.ts
import type { IContratoRepository } from '../../domain/ports/IContratoRepository.js'
import type { CreateContratoDto } from '../dtos/createContrato.dto.js'
import { ContratoConflictError } from '../../domain/errors/ContratoErrors.js'

export class CreateContratoUseCase {
  constructor(private readonly repo: IContratoRepository) {}

  async execute(input: { tenantId: number; data: CreateContratoDto }) {
    const { tenantId, data } = input

    // Verificar unicidade (regra de negócio aqui, não na rota)
    const existing = await this.repo.findByNumero(tenantId, data.numeroContrato)
    if (existing) throw new ContratoConflictError(data.numeroContrato)

    return this.repo.create(tenantId, {
      tenantId,
      numeroContrato: data.numeroContrato,
      objeto: data.objeto ?? null,
      status: 'ATIVO',
      valorTotalAtual: data.valorTotalInicial ?? null,
      vigenciaAtual: null,
    })
  }
}
```

---

## Adaptador de repositório (Prisma)

```ts
// modules/contrato/infrastructure/persistence/PrismaContratoRepository.ts
import prisma, { setTenantContext } from '@/shared/plugins/prisma.js'
import type { IContratoRepository, ListContratoFilter } from '../../domain/ports/IContratoRepository.js'
import type { Contrato } from '../../domain/entities/Contrato.js'

export class PrismaContratoRepository implements IContratoRepository {
  async findById(tenantId: number, id: number): Promise<Contrato | null> {
    return prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId)
      return tx.contrato.findFirst({ where: { id, tenantId } })
    })
  }

  async findAll(tenantId: number, filter: ListContratoFilter) {
    const { page = 1, limit = 20, status } = filter
    const skip = (page - 1) * limit

    return prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId)
      const where = { tenantId, ...(status ? { status } : {}) }
      const [data, total] = await Promise.all([
        tx.contrato.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
        tx.contrato.count({ where }),
      ])
      return { data, total }
    })
  }

  async create(tenantId: number, data: Omit<Contrato, 'id' | 'createdAt'>): Promise<Contrato> {
    return prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId)
      return tx.contrato.create({ data: { ...data, tenantId } })
    })
  }

  async update(tenantId: number, id: number, data: Partial<Contrato>): Promise<Contrato> {
    return prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId)
      return tx.contrato.update({ where: { id }, data })
    })
  }

  async delete(tenantId: number, id: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId)
      await tx.contrato.delete({ where: { id } })
    })
  }
}
```

---

## Anti-patterns — NUNCA fazer

```ts
// ❌ Rota com lógica de negócio
server.post('/', async (req, reply) => {
  const existing = await prisma.contrato.findFirst({ where: { numeroContrato: req.body.numeroContrato } })
  if (existing) return reply.status(409).send({ message: 'Já existe' })
  // ... mais lógica ...
})

// ✅ Rota delega ao use-case
server.post('/', async (req, reply) => {
  try {
    const result = await useCase.execute({ tenantId: req.user.tenantId, data: req.body })
    return reply.status(201).send(result)
  } catch (e) {
    if (e instanceof ContratoConflictError) return reply.status(409).send({ message: e.message })
    throw e
  }
})

// ❌ Use-case acessa Prisma diretamente
class CreateContratoUseCase {
  async execute(input: any) {
    return prisma.contrato.create({ data: input })  // ❌ acoplado à infra
  }
}

// ✅ Use-case usa interface
class CreateContratoUseCase {
  constructor(private repo: IContratoRepository) {}  // ✅ desacoplado
}
```
