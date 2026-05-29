import type { AbrangenciaContext, EnderecoObra, Obra, OrigemEndereco } from '@/modules/obras/domain/entities/Obra.js'

export interface CreateObraInput {
  name: string
  contratoId: number
  type: string
  status: string
  description?: string | null
  valorPrevisto?: number | null
}

export interface UpdateObraInput {
  name?: string
  contratoId?: number
  type?: string
  status?: string
  description?: string | null
  valorPrevisto?: number | null
}

export interface EnderecoInput {
  nomeEndereco?: string | null
  principal?: boolean | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  latitude?: string | null
  longitude?: string | null
  origemEndereco?: OrigemEndereco
  origemCoordenada?: OrigemEndereco
}

export interface ObraWithEnderecos extends Obra {
  enderecosObra: EnderecoObra[]
  enderecoObra: EnderecoObra | null
  contrato: { id: number; numeroContrato: string; status: string; objeto: string | null } | null
}

export interface ResumoFinanceiro {
  obraId: number
  valorTotal: number
  valorMedido: number
}

export interface IObraRepository {
  findById(tenantId: number, id: number, scope?: AbrangenciaContext): Promise<ObraWithEnderecos | null>
  findAll(tenantId: number, scope?: AbrangenciaContext, filter?: { contratoId?: number }): Promise<ObraWithEnderecos[]>
  findResumoFinanceiro(tenantId: number, scope?: AbrangenciaContext, filter?: { contratoId?: number }): Promise<ResumoFinanceiro[]>
  create(tenantId: number, input: CreateObraInput): Promise<ObraWithEnderecos>
  update(tenantId: number, id: number, input: UpdateObraInput): Promise<ObraWithEnderecos>
  delete(tenantId: number, id: number): Promise<void>

  // Endereços
  getEndereco(tenantId: number, obraId: number): Promise<EnderecoObra | null>
  listEnderecos(tenantId: number, obraId: number): Promise<EnderecoObra[]>
  upsertEndereco(tenantId: number, obraId: number, input: EnderecoInput): Promise<EnderecoObra>
  createEndereco(tenantId: number, obraId: number, input: EnderecoInput): Promise<EnderecoObra>
  updateEndereco(tenantId: number, obraId: number, enderecoId: number, input: EnderecoInput): Promise<EnderecoObra>
  deleteEndereco(tenantId: number, obraId: number, enderecoId: number): Promise<void>

  // Orçamento / custos
  getOrcamento(tenantId: number, obraId: number): Promise<{ obra: Obra; totalGasto: number; saldo: number; custos: unknown[] }>
  updateOrcamento(tenantId: number, obraId: number, valorPrevisto: number): Promise<unknown>
  addCusto(tenantId: number, obraId: number, input: { description: string; amount: number; date?: string }): Promise<unknown>
  removeCusto(tenantId: number, obraId: number, custoId: number): Promise<unknown>

  // Planilha contratada
  getPlanilhaResumo(tenantId: number, obraId: number): Promise<{ existe: boolean; itens: number; temServicoMinimo: boolean }>
  ensurePlanilhaMinima(tenantId: number, obraId: number): Promise<{ planilhaId: number; codigoServicoMinimo: string }>
  listPlanilhaItens(tenantId: number, obraId: number): Promise<unknown[]>
  addPlanilhaItem(tenantId: number, obraId: number, input: { codigoServico: string; descricao?: string | null; unidade?: string | null; quantidade?: number | null; precoUnitario?: number | null }): Promise<{ planilhaId: number }>
}
