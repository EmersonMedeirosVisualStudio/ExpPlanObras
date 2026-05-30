import { Prisma } from '@prisma/client'
import prisma from '@/infra/database/prisma/client.js'
import type {
  ArtefatoRow,
  CreateArtefatoInput,
  CreateCallbackInput,
  CreateDocumentoVersaoInput,
  CreateProvedorInput,
  CreateSolicitacaoInput,
  DocumentoRow,
  EmpresaEncarregadoRow,
  IDocumentosQualificadosRepository,
  ListSolicitacoesFilter,
  ProvedorRow,
  SignatarioRow,
  SolicitacaoRow,
  SolicitacaoWithRelations,
  SyncSolicitacaoResult,
  TenantUserRow,
  UpdateDocumentoVersaoAfterSignInput,
  UpdateSolicitacaoAfterSendInput,
  UpdateSolicitacaoAfterSyncInput,
  UpdateVerificacaoInput,
  VersaoRow,
} from '@/domain/repositories/IDocumentosQualificadosRepository.js'

export class PrismaDocumentosQualificadosRepository implements IDocumentosQualificadosRepository {
  // ─── Auth helpers ──────────────────────────────────────────────────────────

  async findTenantUser(tenantId: number, userId: number): Promise<TenantUserRow | null> {
    return prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true },
    })
  }

  async findEmpresaEncarregado(tenantId: number): Promise<EmpresaEncarregadoRow | null> {
    return prisma.empresaEncarregadoSistema.findFirst({
      where: { tenantId, ativo: true },
      orderBy: { id: 'desc' },
      select: { userId: true },
    })
  }

  // ─── Provedores ────────────────────────────────────────────────────────────

  async listProvedores(tenantId: number): Promise<ProvedorRow[]> {
    return prisma.documentoAssinaturaProvedor.findMany({
      where: { tenantId, ativo: true },
      orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }],
      select: {
        id: true,
        tenantId: true,
        nome: true,
        codigo: true,
        tipo: true,
        ambiente: true,
        baseUrl: true,
        configuracaoJson: true,
        clientId: true,
        clientSecretCriptografado: true,
        apiKeyCriptografada: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
      },
    }) as Promise<ProvedorRow[]>
  }

  async createProvedor(tenantId: number, input: CreateProvedorInput): Promise<ProvedorRow> {
    return prisma.documentoAssinaturaProvedor.create({
      data: {
        tenantId,
        nome: input.nome,
        codigo: input.codigo,
        tipo: input.tipo,
        ambiente: input.ambiente,
        baseUrl: input.baseUrl,
        clientId: input.clientId ?? null,
        clientSecretCriptografado: input.clientSecretCriptografado ?? null,
        apiKeyCriptografada: input.apiKeyCriptografada ?? null,
        configuracaoJson: (input.configuracaoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        ativo: input.ativo,
      },
    }) as Promise<ProvedorRow>
  }

  async findProvedorById(tenantId: number, id: number): Promise<ProvedorRow | null> {
    return prisma.documentoAssinaturaProvedor.findUnique({ where: { id } }).then((r) =>
      r && r.tenantId === tenantId ? (r as unknown as ProvedorRow) : null,
    )
  }

  async findProvedorByCode(code: string): Promise<ProvedorRow | null> {
    return prisma.documentoAssinaturaProvedor
      .findFirst({ where: { codigo: code }, orderBy: { id: 'desc' } })
      .then((r) => (r ? (r as unknown as ProvedorRow) : null))
  }

  // ─── Documentos ────────────────────────────────────────────────────────────

  async findDocumentoById(tenantId: number, id: number): Promise<DocumentoRow | null> {
    return prisma.documento
      .findUnique({ where: { id } })
      .then((r) => (r && r.tenantId === tenantId ? (r as unknown as DocumentoRow) : null))
  }

  // ─── Versões ───────────────────────────────────────────────────────────────

  async findVersaoById(tenantId: number, id: number): Promise<VersaoRow | null> {
    return prisma.documentoVersao
      .findUnique({ where: { id } })
      .then((r) => (r && r.tenantId === tenantId ? (r as unknown as VersaoRow) : null))
  }

  async createVersao(tenantId: number, input: CreateDocumentoVersaoInput): Promise<VersaoRow> {
    return prisma.documentoVersao.create({
      data: {
        tenantId,
        documentoId: input.documentoId,
        numeroVersao: input.numeroVersao,
        urlOriginal: input.urlOriginal,
      },
    }) as Promise<VersaoRow>
  }

  async updateVersaoAfterSign(
    _tenantId: number,
    versaoId: number,
    input: UpdateDocumentoVersaoAfterSignInput,
  ): Promise<VersaoRow> {
    return prisma.documentoVersao.update({
      where: { id: versaoId },
      data: {
        urlAssinado: input.urlAssinado,
        hashSha256Assinado: input.hashSha256Assinado,
        tipoAssinaturaFinal: input.tipoAssinaturaFinal,
        assinaturaQualificadaConcluida: input.assinaturaQualificadaConcluida,
        verificacaoAssinaturaStatus: input.verificacaoAssinaturaStatus,
        verificacaoAssinaturaEm: input.verificacaoAssinaturaEm,
      },
    }) as Promise<VersaoRow>
  }

  async updateVersaoVerificacao(
    _tenantId: number,
    versaoId: number,
    input: UpdateVerificacaoInput,
  ): Promise<VersaoRow> {
    return prisma.documentoVersao.update({
      where: { id: versaoId },
      data: {
        verificacaoAssinaturaStatus: input.verificacaoAssinaturaStatus,
        verificacaoAssinaturaEm: input.verificacaoAssinaturaEm,
      },
    }) as Promise<VersaoRow>
  }

  // ─── Solicitações ──────────────────────────────────────────────────────────

  async listSolicitacoes(
    tenantId: number,
    filter: ListSolicitacoesFilter,
  ): Promise<{ rows: SolicitacaoRow[]; total: number }> {
    const pagina = filter.pagina ?? 1
    const limite = filter.limite ?? 30
    const skip = (pagina - 1) * limite

    const where: Record<string, unknown> = { tenantId }
    if (filter.status) where['statusSolicitacao'] = String(filter.status).toUpperCase()

    const [rows, total] = await Promise.all([
      prisma.documentoAssinaturaSolicitacao.findMany({
        where,
        include: { provedor: { select: { codigo: true, tipo: true, ambiente: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limite,
      }),
      prisma.documentoAssinaturaSolicitacao.count({ where }),
    ])

    return { rows: rows as unknown as SolicitacaoRow[], total }
  }

  async findSolicitacaoById(tenantId: number, id: number): Promise<SolicitacaoWithRelations | null> {
    const row = await prisma.documentoAssinaturaSolicitacao.findUnique({
      where: { id },
      include: {
        provedor: { select: { id: true, codigo: true, tipo: true, ambiente: true, baseUrl: true } },
        signatarios: true,
        artefatos: {
          select: {
            id: true,
            tipoArtefato: true,
            nomeArquivo: true,
            mimeType: true,
            tamanhoBytes: true,
            hashSha256: true,
            createdAt: true,
          },
        },
        evidencias: true,
      },
    })
    if (!row || row.tenantId !== tenantId) return null
    return row as unknown as SolicitacaoWithRelations
  }

  async findSolicitacaoForSend(tenantId: number, id: number): Promise<SolicitacaoWithRelations | null> {
    const row = await prisma.documentoAssinaturaSolicitacao.findUnique({
      where: { id },
      include: { provedor: true, signatarios: true, versao: true },
    })
    if (!row || row.tenantId !== tenantId) return null
    return row as unknown as SolicitacaoWithRelations
  }

  async findSolicitacaoForSync(tenantId: number, id: number): Promise<SolicitacaoWithRelations | null> {
    const row = await prisma.documentoAssinaturaSolicitacao.findUnique({
      where: { id },
      include: { provedor: true, versao: true },
    })
    if (!row || row.tenantId !== tenantId) return null
    return row as unknown as SolicitacaoWithRelations
  }

  async createSolicitacao(tenantId: number, input: CreateSolicitacaoInput): Promise<SolicitacaoRow> {
    const created = await prisma.$transaction(async (tx) => {
      const s = await tx.documentoAssinaturaSolicitacao.create({
        data: {
          tenantId,
          documentoId: input.documentoId,
          versaoId: input.versaoId,
          provedorId: input.provedorId,
          tipoAssinatura: input.tipoAssinatura,
          statusSolicitacao: 'RASCUNHO',
          exigeTodosSignatarios: input.exigeTodosSignatarios,
          callbackToken: input.callbackToken,
          expiraEm: input.expiraEm ?? null,
          solicitanteUserId: input.solicitanteUserId,
          metadataJson: (input.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      })
      await tx.documentoAssinaturaSolicitacaoSignatario.createMany({
        data: input.signatarios.map((p) => ({
          tenantId,
          solicitacaoId: s.id,
          ordemAssinatura: p.ordemAssinatura,
          tipoSignatario: p.tipoSignatario,
          userId: p.userId ?? null,
          nomeSignatario: p.nomeSignatario,
          emailSignatario: p.emailSignatario,
          documentoSignatario: p.documentoSignatario ?? null,
          papelSignatario: p.papelSignatario,
          assinaturaObrigatoria: p.assinaturaObrigatoria,
          statusSignatario: p.statusSignatario,
        })),
      })
      return s
    })
    return created as unknown as SolicitacaoRow
  }

  async updateSolicitacaoAfterSend(
    _tenantId: number,
    id: number,
    input: UpdateSolicitacaoAfterSendInput,
  ): Promise<SolicitacaoRow> {
    return prisma.documentoAssinaturaSolicitacao.update({
      where: { id },
      data: {
        providerEnvelopeId: input.providerEnvelopeId,
        providerDocumentId: input.providerDocumentId ?? null,
        linkAssinaturaExterno: input.linkAssinaturaExterno ?? null,
        providerStatus: input.providerStatus,
        statusSolicitacao: input.statusSolicitacao,
        enviadoEm: input.enviadoEm,
        motivoErro: input.motivoErro,
      },
    }) as Promise<SolicitacaoRow>
  }

  async cancelSolicitacao(_tenantId: number, id: number): Promise<SolicitacaoRow> {
    return prisma.documentoAssinaturaSolicitacao.update({
      where: { id },
      data: { statusSolicitacao: 'CANCELADA', providerStatus: 'CANCELADA', motivoErro: null },
    }) as Promise<SolicitacaoRow>
  }

  async syncSolicitacao(
    tenantId: number,
    id: number,
    statusInput: UpdateSolicitacaoAfterSyncInput,
    signedArtifact: CreateArtefatoInput | null,
    versaoId: number,
    versaoUpdate: UpdateDocumentoVersaoAfterSignInput | null,
    _tipoAssinatura: string,
  ): Promise<SyncSolicitacaoResult> {
    let signedArtifactId: number | null = null
    let concluded = false

    const solicitacao = await prisma.$transaction(async (tx) => {
      const u = await tx.documentoAssinaturaSolicitacao.update({
        where: { id },
        data: {
          providerStatus: statusInput.providerStatus,
          statusSolicitacao: statusInput.statusSolicitacao,
          motivoErro: statusInput.motivoErro,
          concluidoEm: statusInput.concluidoEm ?? undefined,
        },
      })

      if (signedArtifact && versaoUpdate) {
        const art = await tx.documentoAssinaturaArtefato.create({
          data: {
            tenantId: signedArtifact.tenantId,
            solicitacaoId: signedArtifact.solicitacaoId,
            tipoArtefato: signedArtifact.tipoArtefato,
            nomeArquivo: signedArtifact.nomeArquivo,
            mimeType: signedArtifact.mimeType,
            tamanhoBytes: signedArtifact.tamanhoBytes,
            hashSha256: signedArtifact.hashSha256,
            data: Buffer.from(signedArtifact.data) as unknown as Uint8Array<ArrayBuffer>,
          },
        })
        signedArtifactId = art.id

        await tx.documentoVersao.update({
          where: { id: versaoId },
          data: {
            urlAssinado: versaoUpdate.urlAssinado,
            hashSha256Assinado: versaoUpdate.hashSha256Assinado,
            tipoAssinaturaFinal: versaoUpdate.tipoAssinaturaFinal,
            assinaturaQualificadaConcluida: versaoUpdate.assinaturaQualificadaConcluida,
            verificacaoAssinaturaStatus: versaoUpdate.verificacaoAssinaturaStatus,
            verificacaoAssinaturaEm: versaoUpdate.verificacaoAssinaturaEm,
          },
        })
        concluded = true
      }

      return u
    })

    return { solicitacao: solicitacao as unknown as SolicitacaoRow, signedArtifactId, concluded }
  }

  // ─── Artefatos ─────────────────────────────────────────────────────────────

  async listArtefatos(tenantId: number, solicitacaoId: number): Promise<ArtefatoRow[]> {
    return prisma.documentoAssinaturaArtefato.findMany({
      where: { tenantId, solicitacaoId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        tenantId: true,
        solicitacaoId: true,
        tipoArtefato: true,
        nomeArquivo: true,
        mimeType: true,
        tamanhoBytes: true,
        hashSha256: true,
        createdAt: true,
      },
    }) as Promise<ArtefatoRow[]>
  }

  async findFirstSignedArtefato(tenantId: number, solicitacaoId: number): Promise<ArtefatoRow | null> {
    return prisma.documentoAssinaturaArtefato
      .findFirst({
        where: { tenantId, solicitacaoId, tipoArtefato: 'PDF_ASSINADO' },
        orderBy: { id: 'desc' },
      })
      .then((r) => (r ? (r as unknown as ArtefatoRow) : null))
  }

  // ─── Callbacks ─────────────────────────────────────────────────────────────

  async findSolicitacaoByCallbackToken(
    tenantId: number,
    provedorId: number,
    token: string,
  ): Promise<SolicitacaoRow | null> {
    const row = await prisma.documentoAssinaturaSolicitacao.findFirst({
      where: { tenantId, provedorId, callbackToken: token },
      orderBy: { id: 'desc' },
    })
    return row ? (row as unknown as SolicitacaoRow) : null
  }

  async createCallback(input: CreateCallbackInput): Promise<void> {
    await prisma.documentoAssinaturaCallback.create({
      data: {
        tenantId: input.tenantId,
        solicitacaoId: input.solicitacaoId ?? null,
        provedorId: input.provedorId,
        providerEvento: input.providerEvento,
        providerRequestId: input.providerRequestId ?? null,
        payloadJson: input.payloadJson as never,
        statusProcessamento: input.statusProcessamento,
      },
    })
  }
}
