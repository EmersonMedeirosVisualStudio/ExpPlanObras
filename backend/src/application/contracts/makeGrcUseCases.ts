import { PrismaGrcRepository } from '@/infra/database/repositories/PrismaGrcRepository.js'

// Commands — existing
import { CreateRisco } from '@/application/use-cases/grc/commands/CreateRisco.js'
import { UpdateRisco } from '@/application/use-cases/grc/commands/UpdateRisco.js'
import { AddRiscoAvaliacao } from '@/application/use-cases/grc/commands/AddRiscoAvaliacao.js'
import { RecalcularRiscoResidual } from '@/application/use-cases/grc/commands/RecalcularRiscoResidual.js'

// Commands — new
import { CreateControle } from '@/application/use-cases/grc/commands/CreateControle.js'
import { AddControleTeste } from '@/application/use-cases/grc/commands/AddControleTeste.js'
import { AssociarControleRisco } from '@/application/use-cases/grc/commands/AssociarControleRisco.js'
import { CreateAuditoria } from '@/application/use-cases/grc/commands/CreateAuditoria.js'
import { EncerrarAuditoria } from '@/application/use-cases/grc/commands/EncerrarAuditoria.js'
import { CreateAchado } from '@/application/use-cases/grc/commands/CreateAchado.js'
import { EncerrarAchado } from '@/application/use-cases/grc/commands/EncerrarAchado.js'
import { CreatePlanoAcao } from '@/application/use-cases/grc/commands/CreatePlanoAcao.js'
import { AprovarPlanoAcao } from '@/application/use-cases/grc/commands/AprovarPlanoAcao.js'
import { ConcluirPlanoAcao } from '@/application/use-cases/grc/commands/ConcluirPlanoAcao.js'
import { CreateEvidencia } from '@/application/use-cases/grc/commands/CreateEvidencia.js'

// Queries — existing
import { ListRiscos } from '@/application/use-cases/grc/queries/ListRiscos.js'
import { GetRiscoById } from '@/application/use-cases/grc/queries/GetRiscoById.js'
import { ListRiscoAvaliacoes } from '@/application/use-cases/grc/queries/ListRiscoAvaliacoes.js'
import { ListControles } from '@/application/use-cases/grc/queries/ListControles.js'

// Queries — new
import { ListAuditorias } from '@/application/use-cases/grc/queries/ListAuditorias.js'
import { ListAchados } from '@/application/use-cases/grc/queries/ListAchados.js'
import { ListPlanosAcao } from '@/application/use-cases/grc/queries/ListPlanosAcao.js'
import { ListEvidencias } from '@/application/use-cases/grc/queries/ListEvidencias.js'

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
