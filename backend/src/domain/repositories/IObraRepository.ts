import type { AbrangenciaContext, EnderecoObra, Obra, OrigemEndereco } from '@/domain/entities/Obra.js'

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
  getAddress(tenantId: number, obraId: number): Promise<EnderecoObra | null>
  listAddresses(tenantId: number, obraId: number): Promise<EnderecoObra[]>
  upsertAddress(tenantId: number, obraId: number, input: EnderecoInput): Promise<EnderecoObra>
  createAddress(tenantId: number, obraId: number, input: EnderecoInput): Promise<EnderecoObra>
  updateAddress(tenantId: number, obraId: number, enderecoId: number, input: EnderecoInput): Promise<EnderecoObra>
  deleteAddress(tenantId: number, obraId: number, enderecoId: number): Promise<void>

  // Orçamento / custos
  getBudget(tenantId: number, obraId: number): Promise<{ obra: Obra; totalGasto: number; saldo: number; custos: unknown[] }>
  updateBudget(tenantId: number, obraId: number, valorPrevisto: number): Promise<unknown>
  addCost(tenantId: number, obraId: number, input: { description: string; amount: number; date?: string }): Promise<unknown>
  removeCost(tenantId: number, obraId: number, custoId: number): Promise<unknown>

  // Planilha contratada
  getSheetSummary(tenantId: number, obraId: number): Promise<{ existe: boolean; itens: number; temServicoMinimo: boolean }>
  ensureMinimumSheet(tenantId: number, obraId: number): Promise<{ planilhaId: number; codigoServicoMinimo: string }>
  listSheetItems(tenantId: number, obraId: number): Promise<unknown[]>
  addSheetItem(tenantId: number, obraId: number, input: { codigoServico: string; descricao?: string | null; unidade?: string | null; quantidade?: number | null; precoUnitario?: number | null }): Promise<{ planilhaId: number }>
}
