import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IObraRepository, ObraWithEnderecos } from '@/modules/obras/domain/ports/IObraRepository.js'
import { ObraAccessDeniedError, ObraNotFoundError } from '@/modules/obras/domain/errors/ObraErrors.js'
import { GetObraByIdUseCase } from '@/modules/obras/application/use-cases/GetObraById.js'

const mockObra: ObraWithEnderecos = {
  id: 1, tenantId: 10, contratoId: 5, name: 'Obra', type: 'PUBLICA', status: 'EM_ANDAMENTO',
  description: null, valorPrevisto: null, valorAtual: null, createdAt: new Date(), updatedAt: new Date(),
  enderecosObra: [], enderecoObra: null, contrato: null,
}

const makeRepo = (): IObraRepository => ({
  findById: vi.fn(), findAll: vi.fn(), findResumoFinanceiro: vi.fn(),
  create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  getAddress: vi.fn(), listAddresses: vi.fn(), upsertAddress: vi.fn(),
  createAddress: vi.fn(), updateAddress: vi.fn(), deleteAddress: vi.fn(),
  getBudget: vi.fn(), updateBudget: vi.fn(), addCost: vi.fn(), removeCost: vi.fn(),
  getSheetSummary: vi.fn(), ensureMinimumSheet: vi.fn(), listSheetItems: vi.fn(), addSheetItem: vi.fn(),
})

describe('GetObraByIdUseCase', () => {
  let repo: IObraRepository
  let useCase: GetObraByIdUseCase

  beforeEach(() => {
    repo = makeRepo()
    useCase = new GetObraByIdUseCase(repo)
    vi.clearAllMocks()
  })

  it('returns obra when found', async () => {
    vi.mocked(repo.findById).mockResolvedValue(mockObra)
    const result = await useCase.execute(10, 1)
    expect(result.id).toBe(1)
  })

  it('throws ObraNotFoundError when obra does not exist', async () => {
    vi.mocked(repo.findById).mockResolvedValue(null)
    await expect(useCase.execute(10, 99)).rejects.toThrow(ObraNotFoundError)
  })

  it('throws ObraAccessDeniedError when scope excludes obra', async () => {
    const scope = { empresa: false, obras: [2, 3], unidades: [] }
    await expect(useCase.execute(10, 1, scope)).rejects.toThrow(ObraAccessDeniedError)
  })

  it('allows access when obra is in scope', async () => {
    vi.mocked(repo.findById).mockResolvedValue(mockObra)
    const scope = { empresa: false, obras: [1, 2], unidades: [] }
    const result = await useCase.execute(10, 1, scope)
    expect(result.id).toBe(1)
  })
})
