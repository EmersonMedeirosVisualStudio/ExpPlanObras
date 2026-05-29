# Vitest — Referência de Padrões de Teste

## Setup

```bash
# Instalar
npm install -D vitest @vitest/coverage-v8

# package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
      include: ['src/modules/**/application/**', 'src/modules/**/domain/**'],
    },
  },
})
```

---

## Teste de use-case (unitário com mock de repositório)

```ts
// modules/contrato/application/use-cases/CreateContrato.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateContratoUseCase } from './CreateContrato.js'
import type { IContratoRepository } from '../../domain/ports/IContratoRepository.js'
import { ContratoConflictError } from '../../domain/errors/ContratoErrors.js'

const makeRepoMock = (): IContratoRepository => ({
  findById: vi.fn(),
  findByNumero: vi.fn(),
  findAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
})

describe('CreateContratoUseCase', () => {
  let repo: IContratoRepository
  let useCase: CreateContratoUseCase

  beforeEach(() => {
    repo = makeRepoMock()
    useCase = new CreateContratoUseCase(repo)
  })

  it('cria contrato com sucesso', async () => {
    vi.mocked(repo.findByNumero).mockResolvedValue(null)
    vi.mocked(repo.create).mockResolvedValue({
      id: 1,
      tenantId: 10,
      numeroContrato: 'CT-001',
      status: 'ATIVO',
      valorTotalAtual: null,
      vigenciaAtual: null,
      createdAt: new Date(),
    })

    const result = await useCase.execute({
      tenantId: 10,
      data: { numeroContrato: 'CT-001', tipoContratante: 'PRIVADO' },
    })

    expect(result.id).toBe(1)
    expect(repo.create).toHaveBeenCalledOnce()
  })

  it('lança ContratoConflictError se número já existe', async () => {
    vi.mocked(repo.findByNumero).mockResolvedValue({ id: 99 } as any)

    await expect(
      useCase.execute({ tenantId: 10, data: { numeroContrato: 'CT-001', tipoContratante: 'PRIVADO' } })
    ).rejects.toThrow(ContratoConflictError)
  })
})
```

---

## Teste de rota (integração com Fastify inject)

```ts
// modules/contrato/infrastructure/http/contratos.routes.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod'
import contratosRoutes from './contratos.routes.js'

// Mock do use-case para isolar a rota
vi.mock('../../application/use-cases/CreateContrato.js', () => ({
  CreateContratoUseCase: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ id: 1, numeroContrato: 'CT-001' }),
  })),
}))

// Mock do JWT
vi.mock('@/shared/middleware/authenticate.js', () => ({
  authenticate: vi.fn().mockImplementation(async (request: any) => {
    request.user = { tenantId: 10, userId: 1 }
  }),
}))

describe('POST /contratos', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify().withTypeProvider<ZodTypeProvider>()
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    await app.register(contratosRoutes, { prefix: '/contratos' })
    await app.ready()
  })

  afterAll(() => app.close())

  it('retorna 201 com contrato criado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/contratos',
      payload: { numeroContrato: 'CT-001', tipoContratante: 'PRIVADO' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ id: 1 })
  })

  it('retorna 400 com body inválido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/contratos',
      payload: { numeroContrato: '' },  // min(2) falha
    })
    expect(res.statusCode).toBe(400)
  })
})
```

---

## Teste de função de domínio pura

```ts
// modules/contrato/domain/entities/Contrato.test.ts
import { describe, it, expect } from 'vitest'
import { isContratoVencido, calcularAlerta } from './Contrato.js'

const makeContrato = (overrides = {}) => ({
  id: 1,
  tenantId: 1,
  numeroContrato: 'CT-001',
  status: 'ATIVO' as const,
  valorTotalAtual: 100000,
  vigenciaAtual: new Date('2030-01-01'),
  createdAt: new Date(),
  ...overrides,
})

describe('isContratoVencido', () => {
  it('retorna false se vigência no futuro', () => {
    expect(isContratoVencido(makeContrato())).toBe(false)
  })

  it('retorna true se vigência no passado', () => {
    expect(isContratoVencido(makeContrato({ vigenciaAtual: new Date('2020-01-01') }))).toBe(true)
  })
})
```

---

## Cobertura mínima

| Camada               | Meta     |
|----------------------|----------|
| `domain/entities`    | 100%     |
| `application/use-cases` | 90%  |
| `infrastructure/http` (rotas) | 80% |
| `infrastructure/persistence` | não cobrir — teste de integração com BD real |

---

## Patterns de mock

```ts
// Mock de módulo inteiro
vi.mock('../../domain/ports/IContratoRepository.js')

// Spy em método específico
const createSpy = vi.spyOn(repo, 'create').mockResolvedValue(mockContrato)

// Restaurar mocks após cada teste
afterEach(() => vi.restoreAllMocks())

// Mock de data fixa
vi.setSystemTime(new Date('2025-01-15'))
afterEach(() => vi.useRealTimers())
```
