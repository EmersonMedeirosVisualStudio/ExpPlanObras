export type ContractRole = 'CONTRATADO' | 'CONTRATANTE'
export type ContractPartyType = 'PUBLICO' | 'PRIVADO' | 'PF'
export type ContractStatusCalculated = 'NAO_INICIADO' | 'EM_EXECUCAO' | 'PARADO' | 'RESCINDIDO' | 'CONCLUIDO' | 'CANCELADO'
export type ContractAlertLevel = 'OK' | 'PENDENTE' | 'CRITICO'

export interface Contrato {
  id: number
  tenantId: number
  contratoPrincipalId: number | null
  numeroContrato: string
  nome: string | null
  objeto: string | null
  descricao: string | null
  tipoPapel: ContractRole | null
  tipoContratante: ContractPartyType
  empresaParceiraNome: string | null
  empresaParceiraDocumento: string | null
  status: string
  dataInicio: Date | null
  dataFim: Date | null
  dataAssinatura: Date | null
  dataOS: Date | null
  prazoDias: number | null
  vigenciaInicial: Date | null
  vigenciaAtual: Date | null
  valorContratado: number | null
  valorTotalInicial: number | null
  valorTotalAtual: number | null
  createdAt: Date
  updatedAt: Date
}
