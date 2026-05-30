import { Prisma } from '@prisma/client'
import prisma from '@/infra/database/prisma/client.js'
import type {
  AtivoCampoRow,
  AtivoDetailRow,
  AtivoListRow,
  ClassificacaoSugestaoRow,
  CreateAtivoInput,
  CreateDominioInput,
  CreateGlossarioInput,
  CreateLineageInput,
  CreateQualidadeExecucaoInput,
  CreateQualidadeIssueInput,
  CreateQualidadeRegraInput,
  DominioRow,
  ExecutarRegraQualidadeDinamicaInput,
  ExecutarRegraQualidadeDinamicaResult,
  GlossarioRow,
  IGovernancaDadosRepository,
  LineageRelacaoRow,
  ListAtivosFilter,
  ListClassificacaoSugestoesFilter,
  ListGlossarioFilter,
  ListPiiScansFilter,
  ListQualidadeIssuesFilter,
  ListQualidadeRegraFilter,
  PaginatedResult,
  PiiScanResultRow,
  QualidadeExecucaoRow,
  QualidadeIssueRow,
  QualidadeRegraRow,
  TenantUserRow,
  TenantUserRow as TenantUserRowType,
  UpdateQualidadeIssueInput,
  UpdateQualidadeRegraInput,
  UpsertAtivoCampoInput,
} from '@/domain/repositories/IGovernancaDadosRepository.js'

export class PrismaGovernancaDadosRepository implements IGovernancaDadosRepository {
  // ─── Pii Scan ─────────────────────────────────────────────────────────────

  async listPiiScans(tenantId: number, filter: ListPiiScansFilter): Promise<PaginatedResult<unknown>> {
    const where: Prisma.GovernancaPiiScanWhereInput = { tenantId }
    if (filter.status) where.statusScan = filter.status.toUpperCase()
    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.governancaPiiScan.findMany({
        where,
        orderBy: [{ iniciadoEm: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
      }),
      prisma.governancaPiiScan.count({ where }),
    ])
    return { rows, total }
  }

  async getPiiScanById(tenantId: number, id: number): Promise<unknown | null> {
    const scan = await prisma.governancaPiiScan.findUnique({ where: { id } }).catch(() => null)
    if (!scan || scan.tenantId !== tenantId) return null
    return scan
  }

  async listPiiScanResultados(tenantId: number, scanId: number): Promise<PiiScanResultRow[]> {
    const rows = await prisma.governancaPiiScanResultado.findMany({
      where: { tenantId, scanId },
      orderBy: [{ id: 'asc' }],
      include: { campo: { select: { id: true, caminhoCampo: true } } },
    })
    return rows as PiiScanResultRow[]
  }

  // ─── Classificacao ────────────────────────────────────────────────────────

  async listClassificacaoSugestoes(
    tenantId: number,
    filter: ListClassificacaoSugestoesFilter,
  ): Promise<PaginatedResult<ClassificacaoSugestaoRow>> {
    const where: Prisma.GovernancaClassificacaoSugestaoWhereInput = { tenantId }
    if (filter.status) where.statusSugestao = filter.status.toUpperCase()
    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.governancaClassificacaoSugestao.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
        include: {
          ativo: { select: { id: true, codigoAtivo: true, nomeAtivo: true } },
          campo: { select: { id: true, caminhoCampo: true } },
        },
      }),
      prisma.governancaClassificacaoSugestao.count({ where }),
    ])
    return { rows: rows as ClassificacaoSugestaoRow[], total }
  }

  // ─── Dominio ──────────────────────────────────────────────────────────────

  async listDominios(tenantId: number): Promise<DominioRow[]> {
    const rows = await prisma.governancaDadoDominio.findMany({
      where: { tenantId, ativo: true },
      orderBy: [{ codigoDominio: 'asc' }],
    })
    return rows as DominioRow[]
  }

  async createDominio(tenantId: number, input: CreateDominioInput): Promise<{ id: number }> {
    const created = await prisma.governancaDadoDominio.create({
      data: {
        tenantId,
        codigoDominio: input.codigoDominio.toUpperCase(),
        nomeDominio: input.nomeDominio,
        descricaoDominio: input.descricaoDominio ?? null,
        ativo: input.ativo,
      },
    })
    return { id: created.id }
  }

  async findDominioByCode(tenantId: number, codigoDominio: string): Promise<DominioRow | null> {
    const row = await prisma.governancaDadoDominio.findFirst({
      where: { tenantId, codigoDominio: codigoDominio.toUpperCase() },
    })
    return row as DominioRow | null
  }

  // ─── Ativo ────────────────────────────────────────────────────────────────

  async listAtivos(tenantId: number, filter: ListAtivosFilter): Promise<PaginatedResult<AtivoListRow>> {
    const where: Prisma.GovernancaDadoAtivoWhereInput = { tenantId }
    if (filter.tipo) where.tipoAtivo = filter.tipo.toUpperCase()
    if (filter.dominioId) where.dominioId = filter.dominioId
    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.governancaDadoAtivo.findMany({
        where,
        include: {
          dominio: { select: { nomeDominio: true } },
          ownerNegocio: { select: { name: true } },
          ownerTecnico: { select: { name: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
      }),
      prisma.governancaDadoAtivo.count({ where }),
    ])
    return { rows: rows as AtivoListRow[], total }
  }

  async getAtivoById(tenantId: number, id: number): Promise<AtivoDetailRow | null> {
    const row = await prisma.governancaDadoAtivo
      .findUnique({
        where: { id },
        include: {
          dominio: { select: { codigoDominio: true, nomeDominio: true } },
          ownerNegocio: { select: { id: true, name: true } },
          ownerTecnico: { select: { id: true, name: true } },
          steward: { select: { id: true, name: true } },
          custodiante: { select: { id: true, name: true } },
        },
      })
      .catch(() => null)
    if (!row || row.tenantId !== tenantId) return null
    return row as unknown as AtivoDetailRow
  }

  async createAtivo(tenantId: number, input: CreateAtivoInput): Promise<{ id: number }> {
    const created = await prisma.governancaDadoAtivo.create({
      data: {
        tenantId,
        codigoAtivo: input.codigoAtivo,
        nomeAtivo: input.nomeAtivo,
        tipoAtivo: input.tipoAtivo,
        dominioId: input.dominioId ?? null,
        classificacaoGlobal: input.classificacaoGlobal,
        criticidadeNegocio: input.criticidadeNegocio,
        schemaNome: input.schemaNome ?? null,
        objetoNome: input.objetoNome ?? null,
        datasetKey: input.datasetKey ?? null,
        origemSistema: input.origemSistema ?? null,
      },
    })
    return { id: created.id }
  }

  async findAtivoRaw(
    id: number,
  ): Promise<{ id: number; tenantId: number; objetoNome: string | null; slaFreshnessMinutos: number | null } | null> {
    const row = await prisma.governancaDadoAtivo
      .findUnique({ where: { id }, select: { id: true, tenantId: true, objetoNome: true, slaFreshnessMinutos: true } })
      .catch(() => null)
    return row ?? null
  }

  // ─── Ativo Campo ──────────────────────────────────────────────────────────

  async listAtivoCampos(ativoId: number): Promise<AtivoCampoRow[]> {
    const rows = await prisma.governancaDadoAtivoCampo.findMany({
      where: { ativoId },
      orderBy: [{ caminhoCampo: 'asc' }],
    })
    return rows as AtivoCampoRow[]
  }

  async upsertAtivoCampo(input: UpsertAtivoCampoInput): Promise<AtivoCampoRow> {
    const saved = await prisma.governancaDadoAtivoCampo.upsert({
      where: { ativoId_caminhoCampo: { ativoId: input.ativoId, caminhoCampo: input.caminhoCampo } },
      create: {
        ativoId: input.ativoId,
        caminhoCampo: input.caminhoCampo,
        nomeCampoExibicao: input.nomeCampoExibicao,
        tipoDado: input.tipoDado,
        descricaoCampo: input.descricaoCampo ?? null,
        classificacaoCampo: input.classificacaoCampo,
        pii: input.pii,
        campoChave: input.campoChave,
        campoObrigatorio: input.campoObrigatorio,
        campoMascaravel: input.campoMascaravel,
        estrategiaMascaraPadrao: input.estrategiaMascaraPadrao ?? null,
        origemCampo: input.origemCampo ?? null,
        ativo: input.ativo,
        metadataJson: (input.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
      update: {
        nomeCampoExibicao: input.nomeCampoExibicao,
        tipoDado: input.tipoDado,
        descricaoCampo: input.descricaoCampo ?? null,
        classificacaoCampo: input.classificacaoCampo,
        pii: input.pii,
        campoChave: input.campoChave,
        campoObrigatorio: input.campoObrigatorio,
        campoMascaravel: input.campoMascaravel,
        estrategiaMascaraPadrao: input.estrategiaMascaraPadrao ?? null,
        origemCampo: input.origemCampo ?? null,
        ativo: input.ativo,
        metadataJson: (input.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    })
    return saved as AtivoCampoRow
  }

  // ─── Lineage ──────────────────────────────────────────────────────────────

  async listLineageByAtivo(tenantId: number, ativoId: number): Promise<LineageRelacaoRow[]> {
    const rows = await prisma.governancaDadoLineageRelacao.findMany({
      where: { tenantId, OR: [{ ativoOrigemId: ativoId }, { ativoDestinoId: ativoId }] },
      include: {
        ativoOrigem: { select: { id: true, nomeAtivo: true } },
        ativoDestino: { select: { id: true, nomeAtivo: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return rows as LineageRelacaoRow[]
  }

  async createLineage(tenantId: number, input: CreateLineageInput): Promise<{ id: number }> {
    const created = await prisma.governancaDadoLineageRelacao.create({
      data: {
        tenantId,
        ativoOrigemId: input.ativoOrigemId,
        ativoDestinoId: input.ativoDestinoId,
        tipoRelacao: input.tipoRelacao,
        nivelRelacao: input.nivelRelacao,
        campoOrigem: input.campoOrigem ?? null,
        campoDestino: input.campoDestino ?? null,
        transformacaoResumo: input.transformacaoResumo ?? null,
        pipelineNome: input.pipelineNome ?? null,
        ativo: input.ativo,
      },
    })
    return { id: created.id }
  }

  // ─── Glossario ────────────────────────────────────────────────────────────

  async listGlossario(tenantId: number, filter: ListGlossarioFilter): Promise<PaginatedResult<GlossarioRow>> {
    const where: Prisma.GovernancaDadoGlossarioWhereInput = { tenantId, ativo: true }
    if (filter.termo) where.termo = { contains: filter.termo, mode: 'insensitive' }
    if (filter.dominioId) where.dominioId = filter.dominioId
    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.governancaDadoGlossario.findMany({
        where,
        include: {
          dominio: { select: { codigoDominio: true, nomeDominio: true } },
          ownerRef: { select: { id: true, name: true } },
        },
        orderBy: [{ termo: 'asc' }],
        skip,
        take: filter.limite,
      }),
      prisma.governancaDadoGlossario.count({ where }),
    ])
    return { rows: rows as GlossarioRow[], total }
  }

  async createGlossario(tenantId: number, input: CreateGlossarioInput): Promise<{ id: number }> {
    const created = await prisma.governancaDadoGlossario.create({
      data: {
        tenantId,
        termo: input.termo,
        definicao: input.definicao,
        formulaNegocio: input.formulaNegocio ?? null,
        exemplosJson: (input.exemplosJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        dominioId: input.dominioId ?? null,
        ownerUserId: input.ownerUserId ?? null,
        ativo: input.ativo,
      },
    })
    return { id: created.id }
  }

  // ─── Qualidade Regra ──────────────────────────────────────────────────────

  async listQualidadeRegras(
    tenantId: number,
    filter: ListQualidadeRegraFilter,
  ): Promise<PaginatedResult<QualidadeRegraRow>> {
    const where: Prisma.GovernancaDadoQualidadeRegraWhereInput = { tenantId }
    if (typeof filter.ativoId === 'number') where.ativoId = filter.ativoId
    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.governancaDadoQualidadeRegra.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
        select: {
          id: true,
          tenantId: true,
          ativoId: true,
          caminhoCampo: true,
          nomeRegra: true,
          tipoRegra: true,
          severidade: true,
          configuracaoJson: true,
          thresholdOk: true,
          thresholdAlerta: true,
          ativo: true,
          criadoPorUserId: true,
          atualizadoPorUserId: true,
        },
      }),
      prisma.governancaDadoQualidadeRegra.count({ where }),
    ])
    return { rows: rows as QualidadeRegraRow[], total }
  }

  async listQualidadeRegrasByAtivo(tenantId: number, ativoId: number): Promise<QualidadeRegraRow[]> {
    const rows = await prisma.governancaDadoQualidadeRegra.findMany({
      where: { tenantId, ativoId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    })
    return rows as QualidadeRegraRow[]
  }

  async getQualidadeRegraById(tenantId: number, id: number): Promise<QualidadeRegraRow | null> {
    const row = await prisma.governancaDadoQualidadeRegra.findUnique({ where: { id } }).catch(() => null)
    if (!row || row.tenantId !== tenantId) return null
    return row as QualidadeRegraRow
  }

  async createQualidadeRegra(tenantId: number, input: CreateQualidadeRegraInput): Promise<{ id: number }> {
    const created = await prisma.governancaDadoQualidadeRegra.create({
      data: {
        tenantId,
        ativoId: input.ativoId,
        caminhoCampo: input.caminhoCampo ?? null,
        nomeRegra: input.nomeRegra,
        tipoRegra: input.tipoRegra,
        severidade: input.severidade,
        configuracaoJson: input.configuracaoJson as Prisma.InputJsonValue,
        thresholdOk: input.thresholdOk ?? null,
        thresholdAlerta: input.thresholdAlerta ?? null,
        ativo: input.ativo,
        criadoPorUserId: input.criadoPorUserId,
        atualizadoPorUserId: input.atualizadoPorUserId,
      },
    })
    return { id: created.id }
  }

  async updateQualidadeRegra(_tenantId: number, id: number, input: UpdateQualidadeRegraInput): Promise<{ id: number }> {
    const updated = await prisma.governancaDadoQualidadeRegra.update({
      where: { id },
      data: {
        caminhoCampo: input.caminhoCampo ?? null,
        nomeRegra: input.nomeRegra,
        tipoRegra: input.tipoRegra,
        severidade: input.severidade,
        configuracaoJson: input.configuracaoJson as Prisma.InputJsonValue,
        thresholdOk: input.thresholdOk ?? null,
        thresholdAlerta: input.thresholdAlerta ?? null,
        ativo: input.ativo,
        atualizadoPorUserId: input.atualizadoPorUserId,
      },
    })
    return { id: updated.id }
  }

  // ─── Qualidade Execucao ───────────────────────────────────────────────────

  async createQualidadeExecucao(input: CreateQualidadeExecucaoInput): Promise<QualidadeExecucaoRow> {
    const exec = await prisma.governancaDadoQualidadeExecucao.create({
      data: {
        tenantId: input.tenantId,
        regraId: input.regraId,
        statusExecucao: input.statusExecucao,
        valorApurado: input.valorApurado ?? null,
        thresholdOk: input.thresholdOk ?? null,
        thresholdAlerta: input.thresholdAlerta ?? null,
        totalRegistros: input.totalRegistros ?? null,
        totalInconsistencias: input.totalInconsistencias ?? null,
        amostraJson: (input.amostraJson ?? Prisma.DbNull) as Prisma.InputJsonValue,
        mensagemResultado: input.mensagemResultado ?? null,
      },
    })
    return exec as QualidadeExecucaoRow
  }

  // ─── Qualidade Issue ──────────────────────────────────────────────────────

  async listQualidadeIssues(
    tenantId: number,
    filter: ListQualidadeIssuesFilter,
  ): Promise<PaginatedResult<QualidadeIssueRow>> {
    const where: Prisma.GovernancaDadoQualidadeIssueWhereInput = { tenantId }
    if (filter.status) where.statusIssue = filter.status.toUpperCase()
    if (filter.severidade) where.severidade = filter.severidade.toUpperCase()
    if (typeof filter.ativoId === 'number') where.ativoId = filter.ativoId
    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.governancaDadoQualidadeIssue.findMany({
        where,
        include: {
          responsavelRef: { select: { name: true } },
          ativoRef: { select: { nomeAtivo: true, codigoAtivo: true } },
        },
        orderBy: [{ ultimaOcorrenciaEm: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
      }),
      prisma.governancaDadoQualidadeIssue.count({ where }),
    ])
    return { rows: rows as QualidadeIssueRow[], total }
  }

  async listQualidadeIssuesByAtivo(tenantId: number, ativoId: number): Promise<QualidadeIssueRow[]> {
    const rows = await prisma.governancaDadoQualidadeIssue.findMany({
      where: { tenantId, ativoId },
      include: {
        responsavelRef: { select: { name: true } },
        ativoRef: { select: { nomeAtivo: true, codigoAtivo: true } },
      },
      orderBy: [{ ultimaOcorrenciaEm: 'desc' }, { id: 'desc' }],
    })
    return rows as QualidadeIssueRow[]
  }

  async findOpenIssueByRegra(
    tenantId: number,
    ativoId: number,
    regraId: number,
  ): Promise<QualidadeIssueRow | null> {
    const row = await prisma.governancaDadoQualidadeIssue.findFirst({
      where: { tenantId, ativoId, regraId, statusIssue: { in: ['ABERTA', 'EM_TRATAMENTO'] } },
      orderBy: { id: 'desc' },
    })
    return row as QualidadeIssueRow | null
  }

  async updateQualidadeIssue(_tenantId: number, id: number, input: UpdateQualidadeIssueInput): Promise<void> {
    await prisma.governancaDadoQualidadeIssue.update({
      where: { id },
      data: {
        ...(input.ultimaOcorrenciaEm !== undefined && { ultimaOcorrenciaEm: input.ultimaOcorrenciaEm }),
        ...(input.severidade !== undefined && { severidade: input.severidade }),
        ...(input.statusIssue !== undefined && { statusIssue: input.statusIssue }),
        ...(input.metadataJson !== undefined && { metadataJson: input.metadataJson as Prisma.InputJsonValue }),
      },
    })
  }

  async createQualidadeIssue(input: CreateQualidadeIssueInput): Promise<{ id: number }> {
    const created = await prisma.governancaDadoQualidadeIssue.create({
      data: {
        tenantId: input.tenantId,
        ativoId: input.ativoId,
        regraId: input.regraId,
        tituloIssue: input.tituloIssue,
        descricaoIssue: input.descricaoIssue ?? null,
        severidade: input.severidade,
        statusIssue: input.statusIssue,
        responsavelUserId: input.responsavelUserId ?? null,
        primeiraOcorrenciaEm: input.primeiraOcorrenciaEm,
        ultimaOcorrenciaEm: input.ultimaOcorrenciaEm,
        metadataJson: (input.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    })
    return { id: created.id }
  }

  // ─── TenantUser ───────────────────────────────────────────────────────────

  async findTenantUser(tenantId: number, userId: number): Promise<TenantUserRow | null> {
    const row = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true },
    })
    return row as TenantUserRowType | null
  }

  // ─── Dynamic Rule Execution ───────────────────────────────────────────────

  async executarRegraQualidadeDinamica(
    input: ExecutarRegraQualidadeDinamicaInput,
  ): Promise<ExecutarRegraQualidadeDinamicaResult> {
    const { tipo, objeto, regra, ativo } = input
    const prismaAny = prisma as unknown as Record<string, unknown>

    let statusExecucao: ExecutarRegraQualidadeDinamicaResult['statusExecucao'] = 'OK'
    let totalRegistros: number | null = null
    let totalInconsistencias: number | null = null
    let valorApurado: number | null = null
    let mensagemResultado: string | null = null

    if (tipo === 'FRESHNESS') {
      const cfg = regra.configuracaoJson as Record<string, unknown> | null
      const maxDelayMinutes = Number(cfg?.maxDelayMinutes ?? ativo.slaFreshnessMinutos ?? 60)
      const referenceField = String(cfg?.referenceField || 'updatedAt')
      if (!objeto || typeof prismaAny[objeto] !== 'object' || prismaAny[objeto] === null) {
        throw new Error('OBJETO_NAO_SUPORTADO')
      }
      const model = prismaAny[objeto] as { findFirst: (args: unknown) => Promise<Record<string, unknown> | null> }
      const row = await model.findFirst({ orderBy: { [referenceField]: 'desc' }, select: { [referenceField]: true } })
      const dt = row?.[referenceField] ? new Date(row[referenceField] as string) : null
      if (!dt || Number.isNaN(dt.getTime())) throw new Error('SEM_REFERENCIA')
      const delayMin = Math.floor((Date.now() - dt.getTime()) / 60000)
      valorApurado = delayMin
      if (delayMin > maxDelayMinutes) statusExecucao = 'FALHA'
      else if (delayMin > Math.floor(maxDelayMinutes * 0.7)) statusExecucao = 'ALERTA'
      mensagemResultado = `delay_min=${delayMin}`
    } else if (tipo === 'COMPLETUDE') {
      const cfg = regra.configuracaoJson as Record<string, unknown> | null
      const field = String(cfg?.field || regra.caminhoCampo || '')
      if (!field) throw new Error('FIELD_REQUIRED')
      if (!objeto || typeof prismaAny[objeto] !== 'object' || prismaAny[objeto] === null) {
        throw new Error('OBJETO_NAO_SUPORTADO')
      }
      const model = prismaAny[objeto] as {
        count: (args?: unknown) => Promise<number>
      }
      const total = await model.count()
      const missing = await model.count({ where: { OR: [{ [field]: null }, { [field]: '' }] } })
      totalRegistros = total
      totalInconsistencias = missing
      const okRate = total ? (total - missing) / total : 1
      valorApurado = Number(okRate.toFixed(6))
      const thOk = regra.thresholdOk != null ? Number(regra.thresholdOk) : 0.98
      const thAlerta = regra.thresholdAlerta != null ? Number(regra.thresholdAlerta) : 0.9
      if (okRate < thAlerta) statusExecucao = 'FALHA'
      else if (okRate < thOk) statusExecucao = 'ALERTA'
      mensagemResultado = `ok_rate=${okRate}`
    } else if (tipo === 'FAIXA') {
      const cfg = regra.configuracaoJson as Record<string, unknown> | null
      const field = String(cfg?.field || regra.caminhoCampo || '')
      const min = cfg?.min != null ? Number(cfg.min) : null
      const max = cfg?.max != null ? Number(cfg.max) : null
      if (!field || min === null || max === null) throw new Error('CONFIG_INVALIDA')
      if (!objeto || typeof prismaAny[objeto] !== 'object' || prismaAny[objeto] === null) {
        throw new Error('OBJETO_NAO_SUPORTADO')
      }
      const model = prismaAny[objeto] as { count: (args?: unknown) => Promise<number> }
      const total = await model.count()
      const out = await model.count({ where: { OR: [{ [field]: { lt: min } }, { [field]: { gt: max } }] } })
      totalRegistros = total
      totalInconsistencias = out
      const okRate = total ? (total - out) / total : 1
      valorApurado = Number(okRate.toFixed(6))
      const thOk = regra.thresholdOk != null ? Number(regra.thresholdOk) : 0.98
      const thAlerta = regra.thresholdAlerta != null ? Number(regra.thresholdAlerta) : 0.9
      if (okRate < thAlerta) statusExecucao = 'FALHA'
      else if (okRate < thOk) statusExecucao = 'ALERTA'
      mensagemResultado = `ok_rate=${okRate}`
    } else {
      statusExecucao = 'ERRO'
      mensagemResultado = 'Tipo de regra ainda não executável neste estágio.'
    }

    return { statusExecucao, totalRegistros, totalInconsistencias, valorApurado, mensagemResultado }
  }
}
