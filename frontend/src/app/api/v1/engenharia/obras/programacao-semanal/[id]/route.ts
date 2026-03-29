import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

async function ensureTables() {
  await ensureEngenhariaImportTables();
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais (
      id_programacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      semana_fim DATE NOT NULL,
      status ENUM('RASCUNHO','ENVIADA','APROVADA','REJEITADA','CANCELADA') NOT NULL DEFAULT 'RASCUNHO',
      id_funcionario_planejamento BIGINT UNSIGNED NULL,
      id_funcionario_apropriacao BIGINT UNSIGNED NULL,
      motivo_rejeicao TEXT NULL,
      aprovado_em DATETIME NULL,
      id_usuario_aprovador BIGINT UNSIGNED NULL,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_programacao),
      UNIQUE KEY uk_obra_semana (tenant_id, id_obra, semana_inicio),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_programacao BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      id_funcionario BIGINT UNSIGNED NOT NULL,
      funcao_exercida VARCHAR(120) NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      hora_inicio_prevista TIME NULL,
      hora_fim_prevista TIME NULL,
      hora_inicio_executada TIME NULL,
      hora_fim_executada TIME NULL,
      tipo_dia ENUM('UTIL','FIM_SEMANA','FERIADO') NOT NULL DEFAULT 'UTIL',
      he_prevista_minutos INT NOT NULL DEFAULT 0,
      banco_horas_com_anuencia TINYINT(1) NOT NULL DEFAULT 0,
      producao_min_por_hora DECIMAL(14,4) NULL,
      producao_prevista DECIMAL(14,4) NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_programacao, data_referencia, id_funcionario, codigo_servico),
      KEY idx_programacao (tenant_id, id_programacao),
      KEY idx_data (tenant_id, data_referencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(`ALTER TABLE engenharia_programacoes_semanais_itens ADD COLUMN codigo_centro_custo VARCHAR(40) NULL AFTER codigo_servico`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_programacoes_semanais_itens ADD COLUMN id_centro_custo BIGINT UNSIGNED NULL AFTER codigo_centro_custo`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_programacoes_semanais_itens ADD COLUMN id_equipe BIGINT UNSIGNED NULL AFTER id_centro_custo`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_programacoes_semanais_itens ADD COLUMN frente_trabalho VARCHAR(120) NULL AFTER funcao_exercida`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_programacoes_semanais_itens ADD KEY idx_cc (tenant_id, id_centro_custo)`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_programacoes_semanais_itens ADD KEY idx_cc_codigo (tenant_id, codigo_centro_custo)`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_programacoes_semanais_itens DROP INDEX uk_item`).catch(() => null);
  await db
    .query(
      `ALTER TABLE engenharia_programacoes_semanais_itens ADD UNIQUE KEY uk_item (tenant_id, id_programacao, data_referencia, id_funcionario, codigo_servico, codigo_centro_custo)`
    )
    .catch(() => null);

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS presencas_producao_itens (
      id_producao_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_presenca_item BIGINT UNSIGNED NOT NULL,
      servicos_json JSON NULL,
      quantidade_executada DECIMAL(14,4) NOT NULL DEFAULT 0,
      unidade_medida VARCHAR(32) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_producao_item),
      UNIQUE KEY uk_item (tenant_id, id_presenca_item),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS rh_apropriacao_avaliacoes (
      id_avaliacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo_local VARCHAR(20) NOT NULL DEFAULT 'OBRA',
      id_obra BIGINT UNSIGNED NULL,
      id_unidade BIGINT UNSIGNED NULL,
      data_referencia DATE NOT NULL,
      id_funcionario BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      produtividade_prevista_por_hora DECIMAL(14,6) NULL,
      produtividade_executada_por_hora DECIMAL(14,6) NULL,
      proporcao_produtividade DECIMAL(14,6) NULL,
      nota_produtividade DECIMAL(6,2) NULL,
      nota_qualidade DECIMAL(6,2) NULL,
      nota_empenho DECIMAL(6,2) NULL,
      nota_final DECIMAL(6,2) NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_avaliador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_avaliacao),
      UNIQUE KEY uk_chave (tenant_id, tipo_local, id_obra, id_unidade, data_referencia, id_funcionario, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_local (tenant_id, tipo_local, id_obra, id_unidade),
      KEY idx_data (tenant_id, data_referencia),
      KEY idx_func (tenant_id, id_funcionario)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS sst_treinamentos_modelos_servicos (
      id_modelo_servico BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_treinamento_modelo BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_modelo_servico),
      UNIQUE KEY uk_modelo_servico (tenant_id, id_treinamento_modelo, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_servico (tenant_id, codigo_servico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_planilhas_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      descricao_servico VARCHAR(220) NULL,
      unidade_medida VARCHAR(32) NULL,
      quantidade_contratada DECIMAL(14,4) NULL,
      preco_unitario DECIMAL(14,6) NULL,
      valor_total DECIMAL(14,6) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_obra, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_servicos_centros_custo (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NOT NULL,
      origem ENUM('SUGERIDO','MANUAL') NOT NULL DEFAULT 'SUGERIDO',
      justificativa TEXT NULL,
      id_usuario_criador BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_servico_cc (tenant_id, id_obra, codigo_servico, codigo_centro_custo),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_servico (tenant_id, id_obra, codigo_servico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_composicoes_itens_overrides (
      id_override BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_item_base BIGINT UNSIGNED NOT NULL,
      codigo_centro_custo VARCHAR(40) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_override),
      UNIQUE KEY uk_override (tenant_id, id_obra, id_item_base),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normalizeTime(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{2}:\d{2}$/.test(s) || /^\d{2}:\d{2}:\d{2}$/.test(s) ? s : null;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizeTipoDia(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'UTIL' || s === 'FIM_SEMANA' || s === 'FERIADO' ? s : 'UTIL';
}

type ServicoExec = { codigoServico: string; quantidade: number | null };

function normalizeServicosJson(v: any): ServicoExec[] {
  if (!v) return [];
  const parsed = typeof v === 'string' ? JSON.parse(v) : v;
  if (!Array.isArray(parsed)) return [];
  const out: ServicoExec[] = [];
  for (const it of parsed) {
    if (typeof it === 'string') {
      const code = it.trim();
      if (code) out.push({ codigoServico: code, quantidade: null });
      continue;
    }
    if (it && typeof it === 'object') {
      const code = String((it as any).codigoServico ?? (it as any).codigo ?? '').trim();
      if (!code) continue;
      const qRaw = (it as any).quantidade ?? (it as any).qtd ?? null;
      const q = qRaw == null ? null : toNumber(qRaw);
      out.push({ codigoServico: code, quantidade: q == null || Number.isNaN(q) ? null : Number(q) });
    }
  }
  return out;
}

function minutesBetween(dateIso: string, horaEntrada: string | null, horaSaida: string | null) {
  if (!horaEntrada || !horaSaida) return 0;
  const a = new Date(`${dateIso}T${horaEntrada.length === 5 ? `${horaEntrada}:00` : horaEntrada}`);
  const b = new Date(`${dateIso}T${horaSaida.length === 5 ? `${horaSaida}:00` : horaSaida}`);
  const diff = Math.round((b.getTime() - a.getTime()) / 60000);
  return diff > 0 ? diff : 0;
}

function notaProdutividadePorRazao(r: number) {
  if (!Number.isFinite(r) || r < 0) return null;
  if (r >= 1) return 10;
  if (r >= 0.9) return 9;
  if (r >= 0.8) return 8;
  if (r >= 0.7) return 7;
  if (r >= 0.6) return 6;
  if (r >= 0.5) return 5;
  if (r >= 0.4) return 4;
  if (r >= 0.3) return 3;
  if (r >= 0.2) return 2;
  if (r >= 0.1) return 1;
  return 0;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idProgramacao = Number(id || 0);
    if (!Number.isFinite(idProgramacao) || idProgramacao <= 0) return fail(422, 'idProgramacao inválido');

    await ensureTables();

    const [[head]]: any = await db.query(
      `
      SELECT
        id_programacao AS idProgramacao,
        id_obra AS idObra,
        semana_inicio AS semanaInicio,
        semana_fim AS semanaFim,
        status,
        id_funcionario_planejamento AS idFuncionarioPlanejamento,
        id_funcionario_apropriacao AS idFuncionarioApropriacao,
        motivo_rejeicao AS motivoRejeicao,
        aprovado_em AS aprovadoEm,
        id_usuario_aprovador AS idUsuarioAprovador
      FROM engenharia_programacoes_semanais
      WHERE tenant_id = ? AND id_programacao = ?
      LIMIT 1
      `,
      [current.tenantId, idProgramacao]
    );
    if (!head) return fail(404, 'Programação não encontrada');
    if (!canAccessObra(current as any, Number(head.idObra))) return fail(403, 'Sem acesso à obra');

    const [itens]: any = await db.query(
      `
      SELECT
        id_item AS idItem,
        data_referencia AS dataReferencia,
        id_funcionario AS idFuncionario,
        funcao_exercida AS funcaoExercida,
        frente_trabalho AS frenteTrabalho,
        codigo_servico AS codigoServico,
        codigo_centro_custo AS codigoCentroCusto,
        id_centro_custo AS idCentroCusto,
        id_equipe AS idEquipe,
        hora_inicio_prevista AS horaInicioPrevista,
        hora_fim_prevista AS horaFimPrevista,
        hora_inicio_executada AS horaInicioExecutada,
        hora_fim_executada AS horaFimExecutada,
        tipo_dia AS tipoDia,
        he_prevista_minutos AS hePrevistaMinutos,
        banco_horas_com_anuencia AS bancoHorasComAnuencia,
        producao_min_por_hora AS producaoMinPorHora,
        producao_prevista AS producaoPrevista,
        observacao
      FROM engenharia_programacoes_semanais_itens
      WHERE tenant_id = ? AND id_programacao = ?
      ORDER BY data_referencia ASC, id_funcionario ASC, codigo_servico ASC, COALESCE(codigo_centro_custo, '') ASC
      `,
      [current.tenantId, idProgramacao]
    );

    const semanaInicio = String(head.semanaInicio);
    const semanaFim = String(head.semanaFim);

    const [lotados]: any = await db.query(
      `
      SELECT
        f.id_funcionario AS idFuncionario,
        f.nome_completo AS nome,
        COALESCE(f.cargo_contratual, f.funcao_principal, '') AS funcao
      FROM funcionarios_lotacoes l
      INNER JOIN funcionarios f ON f.id_funcionario = l.id_funcionario
      WHERE l.tenant_id = ?
        AND l.atual = 1
        AND l.tipo_lotacao = 'OBRA'
        AND l.id_obra = ?
      ORDER BY f.nome_completo
      `,
      [current.tenantId, Number(head.idObra)]
    );

    const [execRows]: any = await db.query(
      `
      SELECT
        h.data_referencia AS dataReferencia,
        i.id_funcionario AS idFuncionario,
        i.hora_entrada AS horaEntrada,
        i.hora_saida AS horaSaida,
        COALESCE(i.minutos_hora_extra, 0) AS minutosHoraExtra,
        p.servicos_json AS servicosJson,
        p.quantidade_executada AS quantidadeExecutada,
        p.unidade_medida AS unidadeMedida
      FROM presencas_cabecalho h
      INNER JOIN presencas_itens i ON i.id_presenca = h.id_presenca
      LEFT JOIN presencas_producao_itens p ON p.tenant_id = h.tenant_id AND p.id_presenca_item = i.id_presenca_item
      WHERE h.tenant_id = ?
        AND h.tipo_local = 'OBRA'
        AND h.id_obra = ?
        AND h.data_referencia BETWEEN ? AND ?
        AND h.status_presenca IN ('EM_PREENCHIMENTO','FECHADA','ENVIADA_RH','RECEBIDA_RH')
        AND i.situacao_presenca = 'PRESENTE'
      `,
      [current.tenantId, Number(head.idObra), semanaInicio, semanaFim]
    );

    const execMap = new Map<string, { qtd: number; unidade: string | null; minutos: number; semApropriacao: boolean }>();
    for (const r of execRows as any[]) {
      const dataRef = String(r.dataReferencia);
      const idFuncionario = Number(r.idFuncionario);
      const minutos = minutesBetween(dataRef, r.horaEntrada ? String(r.horaEntrada).slice(0, 5) : null, r.horaSaida ? String(r.horaSaida).slice(0, 5) : null) + Number(r.minutosHoraExtra || 0);
      const qtdTotal = r.quantidadeExecutada == null ? 0 : Number(r.quantidadeExecutada);
      const unidade = r.unidadeMedida ? String(r.unidadeMedida) : null;
      const servs = normalizeServicosJson(r.servicosJson);

      if (!servs.length) {
        const k = `${dataRef}|${idFuncionario}|__SEM_SERVICO__`;
        const prev = execMap.get(k) || { qtd: 0, unidade, minutos: 0, semApropriacao: true };
        execMap.set(k, { qtd: prev.qtd + qtdTotal, unidade: prev.unidade || unidade, minutos: prev.minutos + minutos, semApropriacao: true });
        continue;
      }

      const comQtd = servs.filter((s) => s.quantidade != null && Number.isFinite(s.quantidade as any)) as Array<{ codigoServico: string; quantidade: number }>;
      const semQtd = servs.filter((s) => s.quantidade == null);
      const somaInformada = comQtd.reduce((a, b) => a + Number(b.quantidade || 0), 0);
      const restante = Math.max(0, qtdTotal - somaInformada);
      const qtdPorSem = semQtd.length ? restante / semQtd.length : 0;

      for (const s of servs) {
        const qtd = s.quantidade != null ? Number(s.quantidade) : qtdPorSem;
        const k = `${dataRef}|${idFuncionario}|${s.codigoServico}`;
        const prev = execMap.get(k) || { qtd: 0, unidade, minutos: 0, semApropriacao: false };
        execMap.set(k, { qtd: prev.qtd + qtd, unidade: prev.unidade || unidade, minutos: prev.minutos + minutos, semApropriacao: false });
      }
    }

    const [avaliacoesRows]: any = await db.query(
      `
      SELECT
        data_referencia AS dataReferencia,
        id_funcionario AS idFuncionario,
        codigo_servico AS codigoServico,
        nota_produtividade AS notaProdutividade,
        nota_qualidade AS notaQualidade,
        nota_empenho AS notaEmpenho,
        nota_final AS notaFinal,
        observacao,
        produtividade_prevista_por_hora AS produtividadePrevistaPorHora,
        produtividade_executada_por_hora AS produtividadeExecutadaPorHora,
        proporcao_produtividade AS proporcaoProdutividade,
        id_usuario_avaliador AS idUsuarioAvaliador,
        atualizado_em AS atualizadoEm
      FROM rh_apropriacao_avaliacoes
      WHERE tenant_id = ? AND tipo_local = 'OBRA' AND id_obra = ? AND data_referencia BETWEEN ? AND ?
      `,
      [current.tenantId, Number(head.idObra), semanaInicio, semanaFim]
    );
    const avalMap = new Map<string, any>();
    for (const r of avaliacoesRows as any[]) {
      const k = `${String(r.dataReferencia)}|${Number(r.idFuncionario)}|${String(r.codigoServico)}`;
      avalMap.set(k, {
        notaProdutividade: r.notaProdutividade == null ? null : Number(r.notaProdutividade),
        notaQualidade: r.notaQualidade == null ? null : Number(r.notaQualidade),
        notaEmpenho: r.notaEmpenho == null ? null : Number(r.notaEmpenho),
        notaFinal: r.notaFinal == null ? null : Number(r.notaFinal),
        observacao: r.observacao ? String(r.observacao) : null,
        produtividadePrevistaPorHora: r.produtividadePrevistaPorHora == null ? null : Number(r.produtividadePrevistaPorHora),
        produtividadeExecutadaPorHora: r.produtividadeExecutadaPorHora == null ? null : Number(r.produtividadeExecutadaPorHora),
        proporcaoProdutividade: r.proporcaoProdutividade == null ? null : Number(r.proporcaoProdutividade),
        idUsuarioAvaliador: r.idUsuarioAvaliador == null ? null : Number(r.idUsuarioAvaliador),
        atualizadoEm: r.atualizadoEm ? String(r.atualizadoEm) : null,
      });
    }

    const idsFuncionarios = Array.from(new Set((itens as any[]).map((i) => Number(i.idFuncionario)).filter((n) => Number.isFinite(n) && n > 0)));
    const codigos = Array.from(new Set((itens as any[]).map((i) => String(i.codigoServico)).filter(Boolean)));
    const aptosSet = new Set<string>();
    if (idsFuncionarios.length && codigos.length) {
      const [aptRows]: any = await db.query(
        `
        SELECT DISTINCT
          tp.id_funcionario AS idFuncionario,
          ms.codigo_servico AS codigoServico
        FROM sst_treinamentos_participantes tp
        INNER JOIN sst_treinamentos_turmas t ON t.tenant_id = tp.tenant_id AND t.id_treinamento_turma = tp.id_treinamento_turma
        INNER JOIN sst_treinamentos_modelos m ON m.tenant_id = t.tenant_id AND m.id_treinamento_modelo = t.id_treinamento_modelo
        INNER JOIN sst_treinamentos_modelos_servicos ms ON ms.tenant_id = m.tenant_id AND ms.id_treinamento_modelo = m.id_treinamento_modelo
        WHERE tp.tenant_id = ?
          AND tp.id_funcionario IN (${idsFuncionarios.map(() => '?').join(',')})
          AND ms.codigo_servico IN (${codigos.map(() => '?').join(',')})
          AND (tp.validade_ate IS NULL OR tp.validade_ate >= CURDATE())
          AND (
            (m.exige_aprovacao = 1 AND tp.status_participacao = 'APROVADO')
            OR
            (m.exige_aprovacao = 0 AND tp.status_participacao IN ('PRESENTE','APROVADO'))
          )
        `,
        [current.tenantId, ...idsFuncionarios, ...codigos]
      );
      for (const r of aptRows as any[]) {
        aptosSet.add(`${Number(r.idFuncionario)}|${String(r.codigoServico)}`);
      }
    }

    const itensOut = (itens as any[]).map((r) => {
      const dataRef = String(r.dataReferencia);
      const idFuncionario = Number(r.idFuncionario);
      const codigoServico = String(r.codigoServico);
      const codigoCentroCusto = r.codigoCentroCusto ? String(r.codigoCentroCusto) : null;
      const exec = execMap.get(`${dataRef}|${idFuncionario}|${codigoServico}`) || null;
      const execSem = execMap.get(`${dataRef}|${idFuncionario}|__SEM_SERVICO__`) || null;
      const avaliacao = avalMap.get(`${dataRef}|${idFuncionario}|${codigoServico}`) || null;

      const minsPrev =
        r.horaInicioPrevista && r.horaFimPrevista
          ? minutesBetween(dataRef, String(r.horaInicioPrevista).slice(0, 5), String(r.horaFimPrevista).slice(0, 5))
          : 0;
      const horasPrev = minsPrev > 0 ? minsPrev / 60 : 0;
      const producaoMinPorHora = r.producaoMinPorHora == null ? null : Number(r.producaoMinPorHora);
      const producaoPrevista = r.producaoPrevista == null ? null : Number(r.producaoPrevista);
      const produtividadePrevistaPorHora =
        producaoMinPorHora != null && Number.isFinite(producaoMinPorHora) && producaoMinPorHora > 0
          ? producaoMinPorHora
          : producaoPrevista != null && Number.isFinite(producaoPrevista) && producaoPrevista > 0 && horasPrev > 0
            ? producaoPrevista / horasPrev
            : null;

      const execHoras = exec ? (exec.minutos > 0 ? exec.minutos / 60 : 0) : execSem ? (execSem.minutos > 0 ? execSem.minutos / 60 : 0) : 0;
      const execQtd = exec ? Number(exec.qtd || 0) : execSem ? Number(execSem.qtd || 0) : 0;
      const produtividadeExecutadaPorHora = execHoras > 0 && execQtd > 0 ? execQtd / execHoras : null;
      const proporcaoProdutividade =
        produtividadePrevistaPorHora != null && produtividadePrevistaPorHora > 0 && produtividadeExecutadaPorHora != null
          ? produtividadeExecutadaPorHora / produtividadePrevistaPorHora
          : null;
      const notaProdutividadeAuto = proporcaoProdutividade == null ? null : notaProdutividadePorRazao(proporcaoProdutividade);

      return {
        idItem: Number(r.idItem),
        dataReferencia: dataRef,
        idFuncionario,
        funcaoExercida: r.funcaoExercida ? String(r.funcaoExercida) : null,
        frenteTrabalho: r.frenteTrabalho ? String(r.frenteTrabalho) : null,
        codigoServico,
        codigoCentroCusto,
        idEquipe: r.idEquipe == null ? null : Number(r.idEquipe),
        horaInicioPrevista: r.horaInicioPrevista ? String(r.horaInicioPrevista).slice(0, 5) : null,
        horaFimPrevista: r.horaFimPrevista ? String(r.horaFimPrevista).slice(0, 5) : null,
        horaInicioExecutada: r.horaInicioExecutada ? String(r.horaInicioExecutada).slice(0, 5) : null,
        horaFimExecutada: r.horaFimExecutada ? String(r.horaFimExecutada).slice(0, 5) : null,
        tipoDia: String(r.tipoDia),
        hePrevistaMinutos: Number(r.hePrevistaMinutos || 0),
        bancoHorasComAnuencia: Number(r.bancoHorasComAnuencia || 0) ? true : false,
        producaoMinPorHora,
        producaoPrevista,
        observacao: r.observacao ? String(r.observacao) : null,
        produtividadePrevistaPorHora: produtividadePrevistaPorHora == null ? null : Number(produtividadePrevistaPorHora.toFixed(6)),
        produtividadeExecutadaPorHora: produtividadeExecutadaPorHora == null ? null : Number(produtividadeExecutadaPorHora.toFixed(6)),
        proporcaoProdutividade: proporcaoProdutividade == null ? null : Number(proporcaoProdutividade.toFixed(6)),
        notaProdutividadeAuto,
        avaliacao,
        treinamentoApto: aptosSet.has(`${idFuncionario}|${codigoServico}`),
        execucao: exec
          ? {
              quantidade: Number(exec.qtd || 0),
              unidadeMedida: exec.unidade,
              horas: exec.minutos > 0 ? Number((exec.minutos / 60).toFixed(2)) : 0,
              semApropriacao: exec.semApropriacao,
            }
          : execSem
            ? {
                quantidade: Number(execSem.qtd || 0),
                unidadeMedida: execSem.unidade,
                horas: execSem.minutos > 0 ? Number((execSem.minutos / 60).toFixed(2)) : 0,
                semApropriacao: true,
              }
            : null,
      };
    });

    const idsComPlan = new Set(itensOut.map((i: any) => i.idFuncionario));
    const faltando = (lotados as any[]).filter((f) => !idsComPlan.has(Number(f.idFuncionario)));

    const warnings: string[] = [];
    if (faltando.length) warnings.push(`Há ${faltando.length} trabalhador(es) lotado(s) na obra sem programação nesta semana.`);

    return ok({
      cabecalho: {
        idProgramacao: Number(head.idProgramacao),
        idObra: Number(head.idObra),
        semanaInicio,
        semanaFim,
        status: String(head.status),
        idFuncionarioPlanejamento: head.idFuncionarioPlanejamento == null ? null : Number(head.idFuncionarioPlanejamento),
        idFuncionarioApropriacao: head.idFuncionarioApropriacao == null ? null : Number(head.idFuncionarioApropriacao),
        motivoRejeicao: head.motivoRejeicao ? String(head.motivoRejeicao) : null,
        aprovadoEm: head.aprovadoEm ? String(head.aprovadoEm) : null,
        idUsuarioAprovador: head.idUsuarioAprovador == null ? null : Number(head.idUsuarioAprovador),
      },
      itens: itensOut,
      lotados: (lotados as any[]).map((f) => ({ idFuncionario: Number(f.idFuncionario), nome: String(f.nome || ''), funcao: f.funcao ? String(f.funcao) : null })),
      faltandoProgramacao: faltando.map((f: any) => ({ idFuncionario: Number(f.idFuncionario), nome: String(f.nome || ''), funcao: f.funcao ? String(f.funcao) : null })),
      warnings,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idProgramacao = Number(id || 0);
    if (!Number.isFinite(idProgramacao) || idProgramacao <= 0) return fail(422, 'idProgramacao inválido');

    await ensureTables();

    const [[head]]: any = await conn.query(
      `SELECT id_obra AS idObra, status FROM engenharia_programacoes_semanais WHERE tenant_id = ? AND id_programacao = ? LIMIT 1`,
      [current.tenantId, idProgramacao]
    );
    if (!head) return fail(404, 'Programação não encontrada');
    if (!canAccessObra(current as any, Number(head.idObra))) return fail(403, 'Sem acesso à obra');
    if (!['RASCUNHO', 'REJEITADA'].includes(String(head.status))) return fail(422, 'Programação não pode ser alterada neste status');

    const body = await req.json().catch(() => null);
    const itens = Array.isArray(body?.itens) ? body.itens : [];
    const idFuncionarioPlanejamento = body?.idFuncionarioPlanejamento ? Number(body.idFuncionarioPlanejamento) : current.idFuncionario ?? null;
    const idFuncionarioApropriacao = body?.idFuncionarioApropriacao ? Number(body.idFuncionarioApropriacao) : null;

    const [svcRows]: any = await conn.query(
      `SELECT codigo_servico AS codigoServico FROM obras_planilhas_itens WHERE tenant_id = ? AND id_obra = ?`,
      [current.tenantId, Number(head.idObra)]
    );
    const allowed = new Set((svcRows as any[]).map((r) => String(r.codigoServico || '').trim().toUpperCase()).filter(Boolean));
    if (!allowed.size) return fail(422, 'A obra só pode iniciar após cadastrar a planilha orçamentária (serviços da obra).');

    const [ccRows]: any = await conn.query(
      `
      SELECT DISTINCT
        p.codigo_servico AS codigoServico,
        COALESCE(o.codigo_centro_custo, i.codigo_centro_custo) AS codigoCentroCusto
      FROM obras_planilhas_itens p
      INNER JOIN engenharia_composicoes c ON c.tenant_id = p.tenant_id AND c.codigo = p.codigo_composicao
      INNER JOIN engenharia_composicoes_itens i ON i.tenant_id = c.tenant_id AND i.id_composicao = c.id_composicao
      LEFT JOIN obras_composicoes_itens_overrides o
        ON o.tenant_id = i.tenant_id AND o.id_obra = p.id_obra AND o.id_item_base = i.id_item
      WHERE p.tenant_id = ? AND p.id_obra = ?
        AND COALESCE(o.codigo_centro_custo, i.codigo_centro_custo) IS NOT NULL
      ORDER BY p.codigo_servico, codigoCentroCusto
      `,
      [current.tenantId, Number(head.idObra)]
    );
    const ccMap = new Map<string, Set<string>>();
    for (const r of ccRows as any[]) {
      const s = String(r.codigoServico || '').trim().toUpperCase();
      const c = String(r.codigoCentroCusto || '').trim().toUpperCase();
      if (!s || !c) continue;
      const set = ccMap.get(s) || new Set<string>();
      set.add(c);
      ccMap.set(s, set);
    }

    await conn.beginTransaction();

    await conn.query(
      `
      UPDATE engenharia_programacoes_semanais
      SET id_funcionario_planejamento = ?, id_funcionario_apropriacao = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_programacao = ?
      `,
      [idFuncionarioPlanejamento, idFuncionarioApropriacao, current.tenantId, idProgramacao]
    );

    for (const it of itens) {
      const dataReferencia = normalizeDate(it?.dataReferencia);
      const idFuncionario = Number(it?.idFuncionario || 0);
      const codigoServico = String(it?.codigoServico || '').trim().toUpperCase();
      const codigoCentroCusto = it?.codigoCentroCusto ? String(it.codigoCentroCusto).trim().toUpperCase() : null;
      const idCentroCusto = it?.idCentroCusto ? Number(it.idCentroCusto) : null;
      const idEquipe = it?.idEquipe ? Number(it.idEquipe) : null;
      const frenteTrabalho = it?.frenteTrabalho ? String(it.frenteTrabalho).trim() : null;
      if (!dataReferencia || !idFuncionario || !codigoServico) continue;
      if (!allowed.has(codigoServico)) return fail(422, `Serviço inválido para a obra (não está na planilha): ${codigoServico}`);
      if (codigoCentroCusto) {
        const set = ccMap.get(codigoServico);
        if (!set || !set.has(codigoCentroCusto)) return fail(422, `Centro de custo inválido para o serviço na obra: ${codigoServico}:${codigoCentroCusto}`);
      }

      const funcaoExercida = it?.funcaoExercida ? String(it.funcaoExercida).trim() : null;
      const horaInicioPrevista = normalizeTime(it?.horaInicioPrevista);
      const horaFimPrevista = normalizeTime(it?.horaFimPrevista);
      const horaInicioExecutada = normalizeTime(it?.horaInicioExecutada);
      const horaFimExecutada = normalizeTime(it?.horaFimExecutada);
      const tipoDia = normalizeTipoDia(it?.tipoDia);
      const hePrevistaMinutos = it?.hePrevistaMinutos ? Number(it.hePrevistaMinutos) : 0;
      const bancoHorasComAnuencia = it?.bancoHorasComAnuencia ? 1 : 0;
      const producaoMinPorHora = it?.producaoMinPorHora == null ? null : toNumber(it.producaoMinPorHora);
      const producaoPrevista = it?.producaoPrevista == null ? null : toNumber(it.producaoPrevista);
      const observacao = it?.observacao ? String(it.observacao).trim() : null;

      await conn.query(
        `
        INSERT INTO engenharia_programacoes_semanais_itens
          (tenant_id, id_programacao, data_referencia, id_funcionario, funcao_exercida, frente_trabalho, codigo_servico, codigo_centro_custo, id_centro_custo, id_equipe,
           hora_inicio_prevista, hora_fim_prevista, hora_inicio_executada, hora_fim_executada,
           tipo_dia, he_prevista_minutos, banco_horas_com_anuencia, producao_min_por_hora, producao_prevista, observacao)
        VALUES
          (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          funcao_exercida = VALUES(funcao_exercida),
          frente_trabalho = VALUES(frente_trabalho),
          codigo_centro_custo = VALUES(codigo_centro_custo),
          id_centro_custo = VALUES(id_centro_custo),
          id_equipe = VALUES(id_equipe),
          hora_inicio_prevista = VALUES(hora_inicio_prevista),
          hora_fim_prevista = VALUES(hora_fim_prevista),
          hora_inicio_executada = VALUES(hora_inicio_executada),
          hora_fim_executada = VALUES(hora_fim_executada),
          tipo_dia = VALUES(tipo_dia),
          he_prevista_minutos = VALUES(he_prevista_minutos),
          banco_horas_com_anuencia = VALUES(banco_horas_com_anuencia),
          producao_min_por_hora = VALUES(producao_min_por_hora),
          producao_prevista = VALUES(producao_prevista),
          observacao = VALUES(observacao)
        `,
        [
          current.tenantId,
          idProgramacao,
          dataReferencia,
          idFuncionario,
          funcaoExercida,
          frenteTrabalho,
          codigoServico,
          codigoCentroCusto,
          idCentroCusto && Number.isFinite(idCentroCusto) && idCentroCusto > 0 ? idCentroCusto : null,
          idEquipe && Number.isFinite(idEquipe) && idEquipe > 0 ? idEquipe : null,
          horaInicioPrevista,
          horaFimPrevista,
          horaInicioExecutada,
          horaFimExecutada,
          tipoDia,
          Number.isFinite(hePrevistaMinutos) ? Math.max(0, Math.round(hePrevistaMinutos)) : 0,
          bancoHorasComAnuencia,
          producaoMinPorHora == null || Number.isNaN(producaoMinPorHora) ? null : producaoMinPorHora,
          producaoPrevista == null || Number.isNaN(producaoPrevista) ? null : producaoPrevista,
          observacao,
        ]
      );
    }

    await conn.commit();
    return ok({ idProgramacao });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
