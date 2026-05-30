import { PrismaGrcRepository } from '@/modules/grc/infrastructure/persistence/PrismaGrcRepository.js'

// Commands — existing
import { CreateRisco } from '@/modules/grc/application/use-cases/commands/CreateRisco.js'
import { UpdateRisco } from '@/modules/grc/application/use-cases/commands/UpdateRisco.js'
import { AddRiscoAvaliacao } from '@/modules/grc/application/use-cases/commands/AddRiscoAvaliacao.js'
import { RecalcularRiscoResidual } from '@/modules/grc/application/use-cases/commands/RecalcularRiscoResidual.js'

// Commands — new
import { CreateControle } from '@/modules/grc/application/use-cases/commands/CreateControle.js'
import { AddControleTeste } from '@/modules/grc/application/use-cases/commands/AddControleTeste.js'
import { AssociarControleRisco } from '@/modules/grc/application/use-cases/commands/AssociarControleRisco.js'
import { CreateAuditoria } from '@/modules/grc/application/use-cases/commands/CreateAuditoria.js'
import { EncerrarAuditoria } from '@/modules/grc/application/use-cases/commands/EncerrarAuditoria.js'
import { CreateAchado } from '@/modules/grc/application/use-cases/commands/CreateAchado.js'
import { EncerrarAchado } from '@/modules/grc/application/use-cases/commands/EncerrarAchado.js'
import { CreatePlanoAcao } from '@/modules/grc/application/use-cases/commands/CreatePlanoAcao.js'
import { AprovarPlanoAcao } from '@/modules/grc/application/use-cases/commands/AprovarPlanoAcao.js'
import { ConcluirPlanoAcao } from '@/modules/grc/application/use-cases/commands/ConcluirPlanoAcao.js'
import { CreateEvidencia } from '@/modules/grc/application/use-cases/commands/CreateEvidencia.js'

// Queries — existing
import { ListRiscos } from '@/modules/grc/application/use-cases/queries/ListRiscos.js'
import { GetRiscoById } from '@/modules/grc/application/use-cases/queries/GetRiscoById.js'
import { ListRiscoAvaliacoes } from '@/modules/grc/application/use-cases/queries/ListRiscoAvaliacoes.js'
import { ListControles } from '@/modules/grc/application/use-cases/queries/ListControles.js'

// Queries — new
import { ListAuditorias } from '@/modules/grc/application/use-cases/queries/ListAuditorias.js'
import { ListAchados } from '@/modules/grc/application/use-cases/queries/ListAchados.js'
import { ListPlanosAcao } from '@/modules/grc/application/use-cases/queries/ListPlanosAcao.js'
import { ListEvidencias } from '@/modules/grc/application/use-cases/queries/ListEvidencias.js'

export function makeGrcUseCases() {
  const repo = new PrismaGrcRepository()

  return {
    repo,

    // Commands — riscos
    createRisco: new CreateRisco(repo),
    updateRisco: new UpdateRisco(repo),
    addRiscoAvaliacao: new AddRiscoAvaliacao(repo),
    recalcularRiscoResidual: new RecalcularRiscoResidual(repo),

    // Commands — controles
    createControle: new CreateControle(repo),
    addControleTeste: new AddControleTeste(repo),
    associarControleRisco: new AssociarControleRisco(repo),

    // Commands — auditorias
    createAuditoria: new CreateAuditoria(repo),
    encerrarAuditoria: new EncerrarAuditoria(repo),

    // Commands — achados
    createAchado: new CreateAchado(repo),
    encerrarAchado: new EncerrarAchado(repo),

    // Commands — planos de ação
    createPlanoAcao: new CreatePlanoAcao(repo),
    aprovarPlanoAcao: new AprovarPlanoAcao(repo),
    concluirPlanoAcao: new ConcluirPlanoAcao(repo),

    // Commands — evidencias
    createEvidencia: new CreateEvidencia(repo),

    // Queries — riscos
    listRiscos: new ListRiscos(repo),
    getRiscoById: new GetRiscoById(repo),
    listRiscoAvaliacoes: new ListRiscoAvaliacoes(repo),

    // Queries — controles
    listControles: new ListControles(repo),

    // Queries — auditorias
    listAuditorias: new ListAuditorias(repo),

    // Queries — achados
    listAchados: new ListAchados(repo),

    // Queries — planos de ação
    listPlanosAcao: new ListPlanosAcao(repo),

    // Queries — evidencias
    listEvidencias: new ListEvidencias(repo),
  }
}
