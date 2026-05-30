import { PrismaGovernancaDadosRepository } from '@/infra/database/repositories/PrismaGovernancaDadosRepository.js'
import { CreateAtivoUseCase } from '@/application/use-cases/governanca-dados/commands/CreateAtivo.js'
import { CreateDominioUseCase } from '@/application/use-cases/governanca-dados/commands/CreateDominio.js'
import { CreateGlossarioEntryUseCase } from '@/application/use-cases/governanca-dados/commands/CreateGlossarioEntry.js'
import { CreateLineageRelacaoUseCase } from '@/application/use-cases/governanca-dados/commands/CreateLineageRelacao.js'
import { CreateQualidadeExecucaoUseCase } from '@/application/use-cases/governanca-dados/commands/CreateQualidadeExecucao.js'
import { CreateQualidadeRegraUseCase } from '@/application/use-cases/governanca-dados/commands/CreateQualidadeRegra.js'
import { ExecutarQualidadeRegraUseCase } from '@/application/use-cases/governanca-dados/commands/ExecutarQualidadeRegra.js'
import { UpdateQualidadeIssueUseCase } from '@/application/use-cases/governanca-dados/commands/UpdateQualidadeIssue.js'
import { UpdateQualidadeRegraUseCase } from '@/application/use-cases/governanca-dados/commands/UpdateQualidadeRegra.js'
import { UpsertAtivoCampoUseCase } from '@/application/use-cases/governanca-dados/commands/UpsertAtivoCampo.js'
import { GetAtivoByIdUseCase } from '@/application/use-cases/governanca-dados/queries/GetAtivoById.js'
import { GetPiiScanByIdUseCase } from '@/application/use-cases/governanca-dados/queries/GetPiiScanById.js'
import { GetQualidadeRegraByIdUseCase } from '@/application/use-cases/governanca-dados/queries/GetQualidadeRegraById.js'
import { ListAtivoCamposUseCase } from '@/application/use-cases/governanca-dados/queries/ListAtivoCampos.js'
import { ListAtivosUseCase } from '@/application/use-cases/governanca-dados/queries/ListAtivos.js'
import { ListClassificacoesUseCase } from '@/application/use-cases/governanca-dados/queries/ListClassificacoes.js'
import { ListDominiosUseCase } from '@/application/use-cases/governanca-dados/queries/ListDominios.js'
import { ListGlossarioUseCase } from '@/application/use-cases/governanca-dados/queries/ListGlossario.js'
import { ListLineageRelacoesUseCase } from '@/application/use-cases/governanca-dados/queries/ListLineageRelacoes.js'
import { ListPiiScansUseCase } from '@/application/use-cases/governanca-dados/queries/ListPiiScans.js'
import { ListQualidadeIssuesUseCase } from '@/application/use-cases/governanca-dados/queries/ListQualidadeIssues.js'
import { ListQualidadeRegrasUseCase } from '@/application/use-cases/governanca-dados/queries/ListQualidadeRegras.js'

export function makeGovernancaDadosUseCases() {
  const repo = new PrismaGovernancaDadosRepository()

  return {
    repo,
    // queries
    listPiiScans: new ListPiiScansUseCase(repo),
    getPiiScanById: new GetPiiScanByIdUseCase(repo),
    listClassificacoes: new ListClassificacoesUseCase(repo),
    listDominios: new ListDominiosUseCase(repo),
    listAtivos: new ListAtivosUseCase(repo),
    getAtivoById: new GetAtivoByIdUseCase(repo),
    listAtivoCampos: new ListAtivoCamposUseCase(repo),
    listLineageRelacoes: new ListLineageRelacoesUseCase(repo),
    listGlossario: new ListGlossarioUseCase(repo),
    listQualidadeRegras: new ListQualidadeRegrasUseCase(repo),
    getQualidadeRegraById: new GetQualidadeRegraByIdUseCase(repo),
    listQualidadeIssues: new ListQualidadeIssuesUseCase(repo),
    // commands
    createDominio: new CreateDominioUseCase(repo),
    createAtivo: new CreateAtivoUseCase(repo),
    upsertAtivoCampo: new UpsertAtivoCampoUseCase(repo),
    createLineageRelacao: new CreateLineageRelacaoUseCase(repo),
    createGlossarioEntry: new CreateGlossarioEntryUseCase(repo),
    createQualidadeRegra: new CreateQualidadeRegraUseCase(repo),
    updateQualidadeRegra: new UpdateQualidadeRegraUseCase(repo),
    createQualidadeExecucao: new CreateQualidadeExecucaoUseCase(repo),
    executarQualidadeRegra: new ExecutarQualidadeRegraUseCase(repo),
    updateQualidadeIssue: new UpdateQualidadeIssueUseCase(repo),
  }
}
