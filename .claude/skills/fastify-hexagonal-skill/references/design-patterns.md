# Design Patterns — Referência

## Repository Pattern (base hexagonal)

Já coberto em `hexagonal.md`. Regra-chave: sempre programar para a interface, não para a implementação.

```ts
// ✅ Use-case recebe a interface
constructor(private readonly repo: IContratoRepository) {}

// ❌ Use-case instancia o adaptador diretamente
constructor() { this.repo = new PrismaContratoRepository() }
```

---

## Factory Pattern — instanciar use-cases com dependências

```ts
// modules/contrato/application/factories/makeCreateContratoUseCase.ts
import { PrismaContratoRepository } from '../../infrastructure/persistence/PrismaContratoRepository.js'
import { CreateContratoUseCase } from '../use-cases/CreateContrato.js'

export function makeCreateContratoUseCase(): CreateContratoUseCase {
  const repo = new PrismaContratoRepository()
  return new CreateContratoUseCase(repo)
}
```

```ts
// Na rota — importa a factory, não o use-case diretamente
import { makeCreateContratoUseCase } from '../../application/factories/makeCreateContratoUseCase.js'

server.post('/', schema, async (req, reply) => {
  const useCase = makeCreateContratoUseCase()
  const result = await useCase.execute({ tenantId: req.user.tenantId, data: req.body })
  return reply.status(201).send(result)
})
```

---

## Strategy Pattern — algoritmos intercambiáveis

```ts
// Exemplo: diferentes estratégias de cálculo de alerta

// Interface (porta)
interface AlertaCalculator {
  calculate(contrato: Contrato): 'OK' | 'PENDENTE' | 'CRITICO'
}

// Estratégias concretas
class PublicContratoAlertaCalculator implements AlertaCalculator {
  calculate(contrato: Contrato) {
    // regras específicas para contratos públicos
  }
}

class PrivateContratoAlertaCalculator implements AlertaCalculator {
  calculate(contrato: Contrato) {
    // regras específicas para contratos privados
  }
}

// Context
class ContratoAlertaService {
  constructor(private readonly calculator: AlertaCalculator) {}
  
  getAlerta(contrato: Contrato) {
    return this.calculator.calculate(contrato)
  }
}
```

---

## CQRS Leve — separar queries de commands

Use-cases de escrita (commands) e de leitura (queries) ficam em arquivos separados:

```
application/use-cases/
├── commands/
│   ├── CreateContrato.ts
│   ├── UpdateContrato.ts
│   └── DeleteContrato.ts
└── queries/
    ├── GetContratoById.ts
    ├── ListContratos.ts
    └── GetContratosDashboard.ts
```

Queries podem ter repositórios de leitura otimizados (ex: raw SQL para relatórios):

```ts
// application/queries/GetContratosDashboard.ts
export class GetContratosDashboardQuery {
  constructor(private readonly readRepo: IContratoReadRepository) {}

  async execute(tenantId: number, filter: DashboardFilter) {
    return this.readRepo.getDashboardStats(tenantId, filter)
  }
}
```

---

## Observer Pattern — eventos de domínio

```ts
// domain/events/ContratoCreatedEvent.ts
export interface ContratoCreatedEvent {
  type: 'CONTRATO_CREATED'
  payload: { tenantId: number; contratoId: number; numeroContrato: string }
  occurredAt: Date
}

// application/use-cases/commands/CreateContrato.ts
export class CreateContratoUseCase {
  constructor(
    private readonly repo: IContratoRepository,
    private readonly eventEmitter: IEventEmitter,
  ) {}

  async execute(input: { tenantId: number; data: CreateContratoDto }) {
    const contrato = await this.repo.create(input.tenantId, input.data)
    
    await this.eventEmitter.emit({
      type: 'CONTRATO_CREATED',
      payload: { tenantId: input.tenantId, contratoId: contrato.id, numeroContrato: contrato.numeroContrato },
      occurredAt: new Date(),
    })
    
    return contrato
  }
}
```

---

## Decorator Pattern — cross-cutting concerns

```ts
// Logging decorator para repositórios
class LoggedContratoRepository implements IContratoRepository {
  constructor(
    private readonly inner: IContratoRepository,
    private readonly logger: Logger,
  ) {}

  async findById(tenantId: number, id: number) {
    this.logger.info({ tenantId, id }, 'findById called')
    const result = await this.inner.findById(tenantId, id)
    this.logger.info({ found: !!result }, 'findById result')
    return result
  }
  
  // ... delega os demais métodos para inner
}
```

---

## Anti-patterns

```ts
// ❌ God Service — uma classe faz tudo
class ContratoService {
  async createContrato() { ... }
  async updateContrato() { ... }
  async generateReport() { ... }
  async sendNotification() { ... }
  async calculateMetrics() { ... }
}

// ✅ Use-cases separados por responsabilidade
class CreateContratoUseCase { async execute() { ... } }
class UpdateContratoUseCase { async execute() { ... } }
class GenerateContratoReportUseCase { async execute() { ... } }

// ❌ Múltiplas funções por arquivo
// CreateContrato.ts contendo CreateContrato, UpdateContrato, DeleteContrato

// ✅ Um arquivo = uma responsabilidade = uma função/classe exportada
```
