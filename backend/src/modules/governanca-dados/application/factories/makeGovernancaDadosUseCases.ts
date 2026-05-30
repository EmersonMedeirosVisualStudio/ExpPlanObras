import { PrismaGovernancaDadosRepository } from '@/modules/governanca-dados/infrastructure/persistence/PrismaGovernancaDadosRepository.js'
import { CreateAtivoUseCase } from '@/modules/governanca-dados/application/use-cases/commands/CreateAtivo.js'
import { CreateDominioUseCase } from '@/modules/governanca-dados/application/use-cases/commands/CreateDominio.js'
import { CreateGlossarioEntryUseCase } from '@/modules/governanca-dados/application/use-cases/commands/CreateGlossarioEntry.js'
import { CreateLineageRelacaoUseCase } from '@/modules/governanca-dados/application/use-cases/commands/CreateLineageRelacao.js'
import { CreateQualidadeExecucaoUseCase } from '@/modules/governanca-dados/application/use-cases/commands/CreateQualidadeExecucao.js'
import { CreateQualidadeRegraUseCase } from '@/modules/governanca-dados/application/use-cases/commands/CreateQualidadeRegra.js'
import { ExecutarQualidadeRegraUseCase } from '@/modules/governanca-dados/application/use-cases/commands/ExecutarQualidadeRegra.js'
import { UpdateQualidadeIssueUseCase } from '@/modules/governanca-dados/application/use-cases/commands/UpdateQualidadeIssue.js'
import { UpdateQualidadeRegraUseCase } from '@/modules/governanca-dados/application/use-cases/commands/UpdateQualidadeRegra.js'
import { UpsertAtivoCampoUseCase } from '@/modules/governanca-dados/application/use-cases/commands/UpsertAtivoCampo.js'
import { GetAtivoByIdUseCase } from '@/modules/governanca-dados/application/use-cases/queries/GetAtivoById.js'
import { GetPiiScanByIdUseCase } from '@/modules/governanca-dados/application/use-cases/queries/GetPiiScanById.js'
import { GetQualidadeRegraByIdUseCase } from '@/modules/governanca-dados/application/use-cases/queries/GetQualidadeRegraById.js'
import { ListAtivoCamposUseCase } from '@/modules/governanca-dados/application/use-cases/queries/ListAtivoCampos.js'
import { ListAtivosUseCase } from '@/modules/governanca-dados/application/use-cases/queries/ListAtivos.js'
import { ListClassificacoesUseCase } from '@/modules/governanca-dados/application/use-cases/queries/ListClassificacoes.js'
import { ListDominiosUseCase } from '@/modules/governanca-dados/application/use-cases/queries/ListDominios.js'
import { ListGlossarioUseCase } from '@/modules/governanca-dados/application/use-cases/queries/ListGlossario.js'
import { ListLineageRelacoesUseCase } from '@/modules/governanca-dados/application/use-cases/queries/ListLineageRelacoes.js'
import { ListPiiScansUseCase } from '@/modules/governanca-dados/application/use-cases/queries/ListPiiScans.js'
import { ListQualidadeIssuesUseCase } from '@/modules/governanca-dados/application/use-cases/queries/ListQualidadeIssues.js'
import { ListQualidadeRegrasUseCase } from '@/modules/governanca-dados/application/use-cases/queries/ListQualidadeRegras.js'

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
