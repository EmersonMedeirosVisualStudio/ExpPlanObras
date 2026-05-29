import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IObraRepository, ObraWithEnderecos } from '../../domain/ports/IObraRepository.js'
import { ContratoNotFoundError } from '../../domain/errors/ObraErrors.js'
import { CreateObraUseCase } from './CreateObra.js'

const mockObra: ObraWithEnderecos = {
  id: 1, tenantId: 10, contratoId: 5, name: 'Obra Teste', type: 'PUBLICA',
  status: 'NAO_INICIADA', description: null, valorPrevisto: 100000, valorAtual: 100000,
  createdAt: new Date(), updatedAt: new Date(),
  enderecosObra: [], enderecoObra: null, contrato: { id: 5, numeroContrato: 'CT-001', status: 'ATIVO', objeto: null },
}

const makeRepo = (): IObraRepository => ({
  findById: vi.fn(), findAll: vi.fn(), findResumoFinanceiro: vi.fn(),
  create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  getEndereco: vi.fn(), listEnderecos: vi.fn(), upsertEndereco: vi.fn(),
  createEndereco: vi.fn(), updateEndereco: vi.fn(), deleteEndereco: vi.fn(),
  getOrcamento: vi.fn(), updateOrcamento: vi.fn(), addCusto: vi.fn(), removeCusto: vi.fn(),
  getPlanilhaResumo: vi.fn(), ensurePlanilhaMinima: vi.fn(), listPlanilhaItens: vi.fn(), addPlanilhaItem: vi.fn(),
})

describe('CreateObraUseCase', () => {
  let repo: IObraRepository
  let useCase: CreateObraUseCase

  beforeEach(() => {
    repo = makeRepo()
    useCase = new CreateObraUseCase(repo)
    vi.clearAllMocks()
  })

  it('creates obra and returns it', async () => {
    vi.mocked(repo.create).mockResolvedValue(mockObra)

    const result = await useCase.execute(10, {
      name: 'Obra Teste', contratoId: 5, type: 'PUBLICA', status: 'NAO_INICIADA',
    })

    expect(result.id).toBe(1)
    expect(repo.create).toHaveBeenCalledWith(10, expect.objectContaining({ name: 'Obra Teste', contratoId: 5 }))
  })

  it('propagates ContratoNotFoundError from repository', async () => {
    vi.mocked(repo.create).mockRejectedValue(new ContratoNotFoundError(99))

    await expect(useCase.execute(10, { name: 'Obra', contratoId: 99, type: 'PUBLICA', status: 'NAO_INICIADA' }))
      .rejects.toThrow(ContratoNotFoundError)
  })
})
