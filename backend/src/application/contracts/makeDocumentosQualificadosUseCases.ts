import { PrismaDocumentosQualificadosRepository } from '@/infra/database/repositories/PrismaDocumentosQualificadosRepository.js'
import { CheckAdminOrEncarregadoUseCase } from '@/application/use-cases/documentos-qualificados/CheckAdminOrEncarregado.js'
import { ListProvedoresUseCase } from '@/application/use-cases/documentos-qualificados/ListProvedores.js'
import { CreateProvedorUseCase } from '@/application/use-cases/documentos-qualificados/CreateProvedor.js'
import { CreateSolicitacaoUseCase } from '@/application/use-cases/documentos-qualificados/CreateSolicitacao.js'
import { ListSolicitacoesUseCase } from '@/application/use-cases/documentos-qualificados/ListSolicitacoes.js'
import { GetSolicitacaoByIdUseCase } from '@/application/use-cases/documentos-qualificados/GetSolicitacaoById.js'
import { EnviarSolicitacaoUseCase } from '@/application/use-cases/documentos-qualificados/EnviarSolicitacao.js'
import { SincronizarSolicitacaoUseCase } from '@/application/use-cases/documentos-qualificados/SincronizarSolicitacao.js'
import { CancelarSolicitacaoUseCase } from '@/application/use-cases/documentos-qualificados/CancelarSolicitacao.js'
import { ListArtefatosUseCase } from '@/application/use-cases/documentos-qualificados/ListArtefatos.js'
import { VerificarAssinaturaUseCase } from '@/application/use-cases/documentos-qualificados/VerificarAssinatura.js'
import { CreateCallbackUseCase } from '@/application/use-cases/documentos-qualificados/CreateCallback.js'

export function makeDocumentosQualificadosUseCases() {
  const repo = new PrismaDocumentosQualificadosRepository()

  return {
    checkAdminOrEncarregado: new CheckAdminOrEncarregadoUseCase(repo),
    listProvedores: new ListProvedoresUseCase(repo),
    createProvedor: new CreateProvedorUseCase(repo),
    createSolicitacao: new CreateSolicitacaoUseCase(repo),
    listSolicitacoes: new ListSolicitacoesUseCase(repo),
    getSolicitacaoById: new GetSolicitacaoByIdUseCase(repo),
    enviarSolicitacao: new EnviarSolicitacaoUseCase(repo),
    sincronizarSolicitacao: new SincronizarSolicitacaoUseCase(repo),
    cancelarSolicitacao: new CancelarSolicitacaoUseCase(repo),
    listArtefatos: new ListArtefatosUseCase(repo),
    verificarAssinatura: new VerificarAssinaturaUseCase(repo),
    createCallback: new CreateCallbackUseCase(repo),
  }
}
