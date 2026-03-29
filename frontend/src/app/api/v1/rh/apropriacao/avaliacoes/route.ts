import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

async function ensureTables() {
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
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizeCodigoServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

function minutesBetween(dateIso: string, horaEntrada: string | null, horaSaida: string | null) {
  if (!horaEntrada || !horaSaida) return 0;
  const a = new Date(`${dateIso}T${horaEntrada.length === 5 ? `${horaEntrada}:00` : horaEntrada}`);
  const b = new Date(`${dateIso}T${horaSaida.length === 5 ? `${horaSaida}:00` : horaSaida}`);
  const diff = Math.round((b.getTime() - a.getTime()) / 60000);
  return diff > 0 ? diff : 0;
}

type ServicoExec = { codigoServico: string; quantidade: number | null };

function normalizeServicosJson(v: any): ServicoExec[] {
  if (!v) return [];
  const parsed = typeof v === 'string' ? JSON.parse(v) : v;
  if (!Array.isArray(parsed)) return [];
  const out: ServicoExec[] = [];
  for (const it of parsed) {
    if (typeof it === 'string') {
      const code = it.trim().toUpperCase();
      if (code) out.push({ codigoServico: code, quantidade: null });
      continue;
    }
    if (it && typeof it === 'object') {
      const code = String((it as any).codigoServico ?? (it as any).codigo ?? '').trim().toUpperCase();
      if (!code) continue;
      const qRaw = (it as any).quantidade ?? (it as any).qtd ?? null;
      const q = qRaw == null ? null : toNumber(qRaw);
      out.push({ codigoServico: code, quantidade: q == null || Number.isNaN(q) ? null : Number(q) });
    }
  }
  return out;
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

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_RH_VIEW);
    await ensureTables();

    const tipoLocal = (req.nextUrl.searchParams.get('tipoLocal') || 'OBRA').trim().toUpperCase();
    const idObra = req.nextUrl.searchParams.get('idObra') ? Number(req.nextUrl.searchParams.get('idObra')) : null;
    const idUnidade = req.nextUrl.searchParams.get('idUnidade') ? Number(req.nextUrl.searchParams.get('idUnidade')) : null;
    const dataInicio = normalizeDate(req.nextUrl.searchParams.get('dataInicio'));
    const dataFim = normalizeDate(req.nextUrl.searchParams.get('dataFim'));
    const idFuncionario = req.nextUrl.searchParams.get('idFuncionario') ? Number(req.nextUrl.searchParams.get('idFuncionario')) : null;
    const codigoServico = normalizeCodigoServico(req.nextUrl.searchParams.get('codigoServico'));

    if (tipoLocal !== 'OBRA' && tipoLocal !== 'UNIDADE') return fail(422, 'tipoLocal inválido');
    if (tipoLocal === 'OBRA') {
      if (!idObra || !Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
      if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    }
    if (tipoLocal === 'UNIDADE') {
      if (!idUnidade || !Number.isFinite(idUnidade) || idUnidade <= 0) return fail(422, 'idUnidade é obrigatório');
    }

    const where: string[] = ['tenant_id = ?', 'tipo_local = ?'];
    const params: any[] = [current.tenantId, tipoLocal];
    if (tipoLocal === 'OBRA') {
      where.push('id_obra = ?');
      params.push(idObra);
    }
    if (tipoLocal === 'UNIDADE') {
      where.push('id_unidade = ?');
      params.push(idUnidade);
    }
    if (dataInicio) {
      where.push('data_referencia >= ?');
      params.push(dataInicio);
    }
    if (dataFim) {
      where.push('data_referencia <= ?');
      params.push(dataFim);
    }
    if (idFuncionario && Number.isFinite(idFuncionario) && idFuncionario > 0) {
      where.push('id_funcionario = ?');
      params.push(idFuncionario);
    }
    if (codigoServico) {
      where.push('codigo_servico = ?');
      params.push(codigoServico);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_avaliacao AS idAvaliacao,
        tipo_local AS tipoLocal,
        id_obra AS idObra,
        id_unidade AS idUnidade,
        data_referencia AS dataReferencia,
        id_funcionario AS idFuncionario,
        codigo_servico AS codigoServico,
        produtividade_prevista_por_hora AS produtividadePrevistaPorHora,
        produtividade_executada_por_hora AS produtividadeExecutadaPorHora,
        proporcao_produtividade AS proporcaoProdutividade,
        nota_produtividade AS notaProdutividade,
        nota_qualidade AS notaQualidade,
        nota_empenho AS notaEmpenho,
        nota_final AS notaFinal,
        observacao,
        id_usuario_avaliador AS idUsuarioAvaliador,
        atualizado_em AS atualizadoEm
      FROM rh_apropriacao_avaliacoes
      WHERE ${where.join(' AND ')}
      ORDER BY data_referencia DESC, id_funcionario ASC, codigo_servico ASC
      LIMIT 2000
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idAvaliacao: Number(r.idAvaliacao),
        idObra: r.idObra == null ? null : Number(r.idObra),
        idUnidade: r.idUnidade == null ? null : Number(r.idUnidade),
        idFuncionario: Number(r.idFuncionario),
        idUsuarioAvaliador: Number(r.idUsuarioAvaliador),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const tipoLocal = String(body?.tipoLocal || 'OBRA').trim().toUpperCase();
    const idObra = body?.idObra ? Number(body.idObra) : null;
    const idUnidade = body?.idUnidade ? Number(body.idUnidade) : null;
    const dataReferencia = normalizeDate(body?.dataReferencia);
    const idFuncionario = body?.idFuncionario ? Number(body.idFuncionario) : null;
    const codigoServico = normalizeCodigoServico(body?.codigoServico);
    const notaQualidade = body?.notaQualidade == null ? null : toNumber(body.notaQualidade);
    const notaEmpenho = body?.notaEmpenho == null ? null : toNumber(body.notaEmpenho);
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (tipoLocal !== 'OBRA' && tipoLocal !== 'UNIDADE') return fail(422, 'tipoLocal inválido');
    if (!dataReferencia) return fail(422, 'dataReferencia é obrigatória (YYYY-MM-DD)');
    if (!idFuncionario || !Number.isFinite(idFuncionario) || idFuncionario <= 0) return fail(422, 'idFuncionario é obrigatório');
    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');

    if (tipoLocal === 'OBRA') {
      if (!idObra || !Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
      if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    }
    if (tipoLocal === 'UNIDADE') {
      if (!idUnidade || !Number.isFinite(idUnidade) || idUnidade <= 0) return fail(422, 'idUnidade é obrigatório');
    }

    if (notaQualidade != null && (!Number.isFinite(notaQualidade) || notaQualidade < 0 || notaQualidade > 10)) return fail(422, 'notaQualidade inválida');
    if (notaEmpenho != null && (!Number.isFinite(notaEmpenho) || notaEmpenho < 0 || notaEmpenho > 10)) return fail(422, 'notaEmpenho inválida');

    const semanaInicio: any = await conn.query(`SELECT DATE_SUB(?, INTERVAL ((DAYOFWEEK(?) + 5) % 7) DAY) AS semanaInicio`, [
      dataReferencia,
      dataReferencia,
    ]);
    const semanaInicioIso = String((semanaInicio as any)[0]?.[0]?.semanaInicio || dataReferencia);

    const [[plano]]: any = await conn.query(
      `
      SELECT
        i.hora_inicio_prevista AS horaInicioPrevista,
        i.hora_fim_prevista AS horaFimPrevista,
        i.producao_min_por_hora AS producaoMinPorHora,
        i.producao_prevista AS producaoPrevista
      FROM engenharia_programacoes_semanais p
      INNER JOIN engenharia_programacoes_semanais_itens i ON i.tenant_id = p.tenant_id AND i.id_programacao = p.id_programacao
      WHERE p.tenant_id = ?
        AND p.id_obra = ?
        AND p.semana_inicio = ?
        AND i.data_referencia = ?
        AND i.id_funcionario = ?
        AND i.codigo_servico = ?
      LIMIT 1
      `,
      [current.tenantId, idObra, semanaInicioIso, dataReferencia, idFuncionario, codigoServico]
    );
    if (!plano) return fail(422, 'Não permitir nota sem apropriação vinculada: não há programação para este funcionário/serviço/data');

    const horaInicioPrevista = plano.horaInicioPrevista ? String(plano.horaInicioPrevista).slice(0, 5) : null;
    const horaFimPrevista = plano.horaFimPrevista ? String(plano.horaFimPrevista).slice(0, 5) : null;
    const minsPrev = horaInicioPrevista && horaFimPrevista ? minutesBetween(dataReferencia, horaInicioPrevista, horaFimPrevista) : 0;
    const horasPrev = minsPrev > 0 ? minsPrev / 60 : 0;

    const prodMinPorHora = plano.producaoMinPorHora == null ? null : Number(plano.producaoMinPorHora);
    const prodPrevista = plano.producaoPrevista == null ? null : Number(plano.producaoPrevista);
    const produtividadePrevistaPorHora =
      prodMinPorHora != null && Number.isFinite(prodMinPorHora) && prodMinPorHora > 0
        ? prodMinPorHora
        : prodPrevista != null && Number.isFinite(prodPrevista) && prodPrevista > 0 && horasPrev > 0
          ? prodPrevista / horasPrev
          : null;

    const [execRows]: any = await conn.query(
      `
      SELECT
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
        AND h.tipo_local = ?
        AND h.id_obra = ?
        AND h.data_referencia = ?
        AND i.id_funcionario = ?
        AND h.status_presenca IN ('EM_PREENCHIMENTO','FECHADA','ENVIADA_RH','RECEBIDA_RH')
        AND i.situacao_presenca = 'PRESENTE'
        AND p.id_presenca_item IS NOT NULL
      LIMIT 20
      `,
      [current.tenantId, 'OBRA', idObra, dataReferencia, idFuncionario]
    );

    let totalQtd = 0;
    let totalMin = 0;
    let unidade: string | null = null;
    let semApropriacao = false;

    for (const r of execRows as any[]) {
      const minutos = minutesBetween(dataReferencia, r.horaEntrada ? String(r.horaEntrada).slice(0, 5) : null, r.horaSaida ? String(r.horaSaida).slice(0, 5) : null) + Number(r.minutosHoraExtra || 0);
      if (minutos <= 0) continue;
      const qtdTotal = r.quantidadeExecutada == null ? 0 : Number(r.quantidadeExecutada);
      unidade = unidade || (r.unidadeMedida ? String(r.unidadeMedida) : null);

      const servs = normalizeServicosJson(r.servicosJson);
      if (!servs.length) {
        semApropriacao = true;
        continue;
      }

      const doServico = servs.filter((s) => s.codigoServico === codigoServico);
      if (!doServico.length) continue;

      const comQtd = servs.filter((s) => s.quantidade != null && Number.isFinite(s.quantidade as any)) as Array<{ codigoServico: string; quantidade: number }>;
      const semQtd = servs.filter((s) => s.quantidade == null);
      const somaInformada = comQtd.reduce((a, b) => a + Number(b.quantidade || 0), 0);
      const restante = Math.max(0, qtdTotal - somaInformada);
      const qtdPorSem = semQtd.length ? restante / semQtd.length : 0;

      let qtdServico = 0;
      for (const s of doServico) {
        qtdServico += s.quantidade != null ? Number(s.quantidade) : qtdPorSem;
      }

      totalQtd += qtdServico;
      totalMin += minutos;
    }

    const horasExec = totalMin > 0 ? totalMin / 60 : 0;
    const produtividadeExecutadaPorHora = horasExec > 0 && totalQtd > 0 ? totalQtd / horasExec : null;
    const proporcaoProdutividade =
      produtividadePrevistaPorHora != null && produtividadePrevistaPorHora > 0 && produtividadeExecutadaPorHora != null && produtividadeExecutadaPorHora >= 0
        ? produtividadeExecutadaPorHora / produtividadePrevistaPorHora
        : null;

    const notaProdutividade = proporcaoProdutividade == null ? null : notaProdutividadePorRazao(proporcaoProdutividade);
    const pesoProd = 0.5;
    const pesoQual = 0.3;
    const pesoEmp = 0.2;

    const notaFinal =
      notaProdutividade == null || notaQualidade == null || notaEmpenho == null
        ? null
        : Number((notaProdutividade * pesoProd + notaQualidade * pesoQual + notaEmpenho * pesoEmp).toFixed(2));

    const precisaJustificar = (notaFinal != null && notaFinal < 6) || (proporcaoProdutividade != null && proporcaoProdutividade < 0.6);
    if (precisaJustificar && !observacao) return fail(422, 'Justificativa (observação) obrigatória para nota final < 6 ou produtividade muito baixa');
    if (semApropriacao) return fail(422, 'Apropriação sem serviço detalhado: registre a produção por serviço (SER-0001=...) antes de avaliar');

    await conn.query(
      `
      INSERT INTO rh_apropriacao_avaliacoes
        (tenant_id, tipo_local, id_obra, id_unidade, data_referencia, id_funcionario, codigo_servico,
         produtividade_prevista_por_hora, produtividade_executada_por_hora, proporcao_produtividade,
         nota_produtividade, nota_qualidade, nota_empenho, nota_final, observacao, id_usuario_avaliador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        produtividade_prevista_por_hora = VALUES(produtividade_prevista_por_hora),
        produtividade_executada_por_hora = VALUES(produtividade_executada_por_hora),
        proporcao_produtividade = VALUES(proporcao_produtividade),
        nota_produtividade = VALUES(nota_produtividade),
        nota_qualidade = VALUES(nota_qualidade),
        nota_empenho = VALUES(nota_empenho),
        nota_final = VALUES(nota_final),
        observacao = VALUES(observacao),
        id_usuario_avaliador = VALUES(id_usuario_avaliador),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [
        current.tenantId,
        tipoLocal,
        tipoLocal === 'OBRA' ? idObra : null,
        tipoLocal === 'UNIDADE' ? idUnidade : null,
        dataReferencia,
        idFuncionario,
        codigoServico,
        produtividadePrevistaPorHora == null ? null : Number(produtividadePrevistaPorHora.toFixed(6)),
        produtividadeExecutadaPorHora == null ? null : Number(produtividadeExecutadaPorHora.toFixed(6)),
        proporcaoProdutividade == null ? null : Number(proporcaoProdutividade.toFixed(6)),
        notaProdutividade == null ? null : Number(notaProdutividade),
        notaQualidade == null ? null : Number(notaQualidade),
        notaEmpenho == null ? null : Number(notaEmpenho),
        notaFinal == null ? null : Number(notaFinal),
        observacao,
        current.id,
      ]
    );

    return ok({
      tipoLocal,
      idObra,
      idUnidade,
      dataReferencia,
      idFuncionario,
      codigoServico,
      produtividadePrevistaPorHora,
      produtividadeExecutadaPorHora,
      proporcaoProdutividade,
      notaProdutividade,
      notaQualidade,
      notaEmpenho,
      notaFinal,
      unidadeMedida: unidade,
    });
  } catch (e) {
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

