import { db } from '@/lib/db';

function clampDays(v: number) {
  return Math.min(Math.max(v, 1), 3650);
}

function getIsoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}

function isoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function getWatermark(args: { tenantId: number | null; pipelineNome: string; origemNome: string }) {
  const [[row]]: any = await db.query(
    `
    SELECT ultimo_updated_at AS ultimoUpdatedAt, ultimo_id AS ultimoId
    FROM dw_cargas_watermarks
    WHERE tenant_id <=> ? AND pipeline_nome = ? AND origem_nome = ?
    LIMIT 1
    `,
    [args.tenantId, args.pipelineNome, args.origemNome]
  );
  return {
    ultimoUpdatedAt: row?.ultimoUpdatedAt ? new Date(row.ultimoUpdatedAt) : null,
    ultimoId: row?.ultimoId !== null && row?.ultimoId !== undefined ? Number(row.ultimoId) : null,
  };
}

async function setWatermark(args: { tenantId: number | null; pipelineNome: string; origemNome: string; ultimoUpdatedAt: Date | null; ultimoId: number | null }) {
  await db.query(
    `
    INSERT INTO dw_cargas_watermarks
      (tenant_id, pipeline_nome, origem_nome, ultimo_updated_at, ultimo_id)
    VALUES
      (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      ultimo_updated_at = VALUES(ultimo_updated_at),
      ultimo_id = VALUES(ultimo_id),
      atualizado_em = CURRENT_TIMESTAMP
    `,
    [args.tenantId, args.pipelineNome, args.origemNome, args.ultimoUpdatedAt ? args.ultimoUpdatedAt : null, args.ultimoId]
  );
}

async function ensureDimTempo(args: { daysBack: number; daysForward: number }) {
  const daysBack = clampDays(args.daysBack);
  const daysForward = clampDays(args.daysForward);
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  const end = new Date();
  end.setDate(end.getDate() + daysForward);

  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(isoDate(d));

  if (!dates.length) return { inseridos: 0 };

  let inserted = 0;
  for (const dt of dates) {
    const date = new Date(`${dt}T00:00:00Z`);
    const ano = date.getUTCFullYear();
    const mes = date.getUTCMonth() + 1;
    const dia = date.getUTCDate();
    const trimestre = Math.floor((mes - 1) / 3) + 1;
    const week = getIsoWeekNumber(date);
    const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(date);
    const nomeDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(date);
    const fimSemana = [0, 6].includes(date.getUTCDay()) ? 1 : 0;

    const [res]: any = await db.query(
      `
      INSERT IGNORE INTO dw_dim_tempo
        (data_calendario, ano, mes, dia, trimestre, semana_ano, nome_mes, nome_dia_semana, fim_semana)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [dt, ano, mes, dia, trimestre, week, nomeMes, nomeDia, fimSemana]
    );
    inserted += Number(res.affectedRows || 0);
  }

  return { inseridos: inserted };
}

async function upsertDimTenant(args: { tenantId: number }) {
  const [[row]]: any = await db.query(`SELECT nome_fantasia AS nome FROM tenants WHERE id_tenant = ? LIMIT 1`, [args.tenantId]);
  const nome = row?.nome ? String(row.nome) : `Tenant #${args.tenantId}`;
  const [res]: any = await db.query(
    `
    INSERT INTO dw_dim_tenant
      (tenant_id, nome_tenant, ativo)
    VALUES
      (?, ?, 1)
    ON DUPLICATE KEY UPDATE
      nome_tenant = VALUES(nome_tenant),
      ativo = VALUES(ativo)
    `,
    [args.tenantId, nome.slice(0, 180)]
  );
  return { atualizados: Number(res.affectedRows || 0) };
}

async function upsertDimLocal(args: { tenantId: number }) {
  const inserted: number[] = [];
  const updated: number[] = [];

  const [unidades]: any = await db.query(`SELECT id_unidade AS id, nome FROM unidades WHERE tenant_id = ?`, [args.tenantId]);
  for (const u of unidades as any[]) {
    const [res]: any = await db.query(
      `
      INSERT INTO dw_dim_local
        (tenant_id, tipo_local, local_id, nome_local, atual, dt_inicio_vigencia, dt_fim_vigencia)
      VALUES
        (?, 'UNIDADE', ?, ?, 1, NOW(), NULL)
      ON DUPLICATE KEY UPDATE
        nome_local = VALUES(nome_local),
        atual = 1
      `,
      [args.tenantId, Number(u.id), String(u.nome || '').slice(0, 180)]
    );
    if (Number(res.affectedRows || 0) > 0) updated.push(1);
    inserted.push(Number(res.insertId || 0));
  }

  const [obras]: any = await db.query(
    `
    SELECT o.id_obra AS id, COALESCE(c.nome_contrato, CONCAT('Contrato #', c.id_contrato)) AS nome
    FROM obras o
    INNER JOIN contratos c ON c.id_contrato = o.id_contrato
    WHERE c.tenant_id = ?
    `,
    [args.tenantId]
  );
  for (const o of obras as any[]) {
    const [res]: any = await db.query(
      `
      INSERT INTO dw_dim_local
        (tenant_id, tipo_local, local_id, nome_local, atual, dt_inicio_vigencia, dt_fim_vigencia)
      VALUES
        (?, 'OBRA', ?, ?, 1, NOW(), NULL)
      ON DUPLICATE KEY UPDATE
        nome_local = VALUES(nome_local),
        atual = 1
      `,
      [args.tenantId, Number(o.id), String(o.nome || '').slice(0, 180)]
    );
    if (Number(res.affectedRows || 0) > 0) updated.push(1);
    inserted.push(Number(res.insertId || 0));
  }

  return { atualizados: updated.length };
}

async function upsertDimFuncionario(args: { tenantId: number }) {
  const [rows]: any = await db.query(
    `
    SELECT
      f.id_funcionario AS funcionarioId,
      f.matricula AS matricula,
      f.nome_completo AS nomeFuncionario,
      f.status_funcional AS statusFuncionario,
      COALESCE(c.nome_cargo, f.cargo_contratual) AS cargoNome,
      COALESCE(s.nome_setor, f.setor_nome) AS setorNome,
      fl.tipo_lotacao AS tipoLocalAtual,
      COALESCE(fl.id_obra, fl.id_unidade) AS localIdAtual
    FROM funcionarios f
    LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
    LEFT JOIN organizacao_cargos c ON c.id_cargo = f.id_cargo_contratual
    LEFT JOIN organizacao_setores s ON s.id_setor = f.id_setor
    WHERE f.tenant_id = ?
      AND f.ativo = 1
    `,
    [args.tenantId]
  );

  let updates = 0;
  for (const r of rows as any[]) {
    const tipoLocalAtual = r.tipoLocalAtual ? String(r.tipoLocalAtual).toUpperCase() : null;
    const localIdAtual = r.localIdAtual !== null && r.localIdAtual !== undefined ? Number(r.localIdAtual) : null;

    let localNomeAtual: string | null = null;
    if (tipoLocalAtual && localIdAtual) {
      const [[loc]]: any = await db.query(
        `
        SELECT nome_local AS nome
        FROM dw_dim_local
        WHERE tenant_id = ? AND tipo_local = ? AND local_id = ? AND atual = 1
        LIMIT 1
        `,
        [args.tenantId, tipoLocalAtual === 'OBRA' ? 'OBRA' : 'UNIDADE', localIdAtual]
      );
      localNomeAtual = loc?.nome ? String(loc.nome) : null;
    }

    const [res]: any = await db.query(
      `
      INSERT INTO dw_dim_funcionario
        (tenant_id, funcionario_id, matricula, nome_funcionario, status_funcionario, cargo_nome, setor_nome, tipo_local_atual, local_id_atual, local_nome_atual, atual, dt_inicio_vigencia, dt_fim_vigencia)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NULL)
      ON DUPLICATE KEY UPDATE
        matricula = VALUES(matricula),
        nome_funcionario = VALUES(nome_funcionario),
        status_funcionario = VALUES(status_funcionario),
        cargo_nome = VALUES(cargo_nome),
        setor_nome = VALUES(setor_nome),
        tipo_local_atual = VALUES(tipo_local_atual),
        local_id_atual = VALUES(local_id_atual),
        local_nome_atual = VALUES(local_nome_atual),
        atual = 1
      `,
      [
        args.tenantId,
        Number(r.funcionarioId),
        r.matricula ? String(r.matricula) : null,
        String(r.nomeFuncionario || '').slice(0, 180),
        r.statusFuncionario ? String(r.statusFuncionario) : null,
        r.cargoNome ? String(r.cargoNome).slice(0, 180) : null,
        r.setorNome ? String(r.setorNome).slice(0, 180) : null,
        tipoLocalAtual,
        localIdAtual,
        localNomeAtual ? String(localNomeAtual).slice(0, 180) : null,
      ]
    );
    updates += Number(res.affectedRows || 0) ? 1 : 0;
  }

  return { atualizados: updates };
}

async function loadRhPresencas(args: { tenantId: number }) {
  const wm = await getWatermark({ tenantId: args.tenantId, pipelineNome: 'RH', origemNome: 'PRESENCAS' });
  const lastId = wm.ultimoId || 0;

  const [rows]: any = await db.query(
    `
    SELECT
      p.id_presenca AS presencaId,
      p.data_referencia AS dataReferencia,
      p.tipo_local AS tipoLocal,
      p.id_obra AS idObra,
      p.id_unidade AS idUnidade,
      i.id_funcionario AS funcionarioId,
      i.situacao_presenca AS situacaoPresenca,
      COALESCE(i.minutos_atraso, 0) AS minutosAtraso,
      COALESCE(i.minutos_hora_extra, 0) AS minutosHoraExtra,
      CASE
        WHEN i.requer_assinatura_funcionario = 1 AND i.assinado_funcionario = 0 AND (i.motivo_sem_assinatura IS NULL OR i.motivo_sem_assinatura = '') THEN 1
        ELSE 0
      END AS assinaturaPendente
    FROM presencas_cabecalho p
    INNER JOIN presencas_itens i ON i.id_presenca = p.id_presenca
    WHERE p.tenant_id = ?
      AND p.id_presenca > ?
    ORDER BY p.id_presenca ASC
    LIMIT 50000
    `,
    [args.tenantId, lastId]
  );

  let maxId = lastId;
  let upserts = 0;

  for (const r of rows as any[]) {
    const presencaId = Number(r.presencaId);
    if (presencaId > maxId) maxId = presencaId;
    const dataReferencia = String(r.dataReferencia);
    const tipoLocal = String(r.tipoLocal || '').toUpperCase();
    const localId = tipoLocal === 'OBRA' ? Number(r.idObra || 0) : Number(r.idUnidade || 0);

    const [[skTempo]]: any = await db.query(`SELECT sk_tempo AS sk FROM dw_dim_tempo WHERE data_calendario = ? LIMIT 1`, [dataReferencia]);
    const [[skFunc]]: any = await db.query(
      `SELECT sk_funcionario AS sk FROM dw_dim_funcionario WHERE tenant_id = ? AND funcionario_id = ? AND atual = 1 LIMIT 1`,
      [args.tenantId, Number(r.funcionarioId)]
    );
    const [[skLocal]]: any = await db.query(
      `SELECT sk_local AS sk FROM dw_dim_local WHERE tenant_id = ? AND tipo_local = ? AND local_id = ? AND atual = 1 LIMIT 1`,
      [args.tenantId, tipoLocal === 'OBRA' ? 'OBRA' : 'UNIDADE', localId]
    );

    const sk_tempo = skTempo?.sk ? Number(skTempo.sk) : null;
    const sk_funcionario = skFunc?.sk ? Number(skFunc.sk) : null;
    const sk_local = skLocal?.sk ? Number(skLocal.sk) : null;
    if (!sk_tempo || !sk_funcionario) continue;

    await db.query(
      `
      INSERT INTO dw_fact_presencas_diarias
        (tenant_id, sk_tempo, sk_funcionario, sk_local, presenca_id, situacao_presenca, minutos_atraso, minutos_hora_extra, assinatura_pendente, atualizado_em_origem)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        situacao_presenca = VALUES(situacao_presenca),
        minutos_atraso = VALUES(minutos_atraso),
        minutos_hora_extra = VALUES(minutos_hora_extra),
        assinatura_pendente = VALUES(assinatura_pendente),
        atualizado_em_origem = VALUES(atualizado_em_origem)
      `,
      [
        args.tenantId,
        sk_tempo,
        sk_funcionario,
        sk_local,
        presencaId,
        String(r.situacaoPresenca || 'NA').slice(0, 30),
        Number(r.minutosAtraso || 0),
        Number(r.minutosHoraExtra || 0),
        Number(r.assinaturaPendente || 0),
      ]
    );
    upserts++;
  }

  if (maxId > lastId) await setWatermark({ tenantId: args.tenantId, pipelineNome: 'RH', origemNome: 'PRESENCAS', ultimoUpdatedAt: null, ultimoId: maxId });

  return { lidos: (rows as any[]).length, atualizados: upserts };
}

async function loadSstNc(args: { tenantId: number }) {
  const wm = await getWatermark({ tenantId: args.tenantId, pipelineNome: 'SST', origemNome: 'NC' });
  const lastId = wm.ultimoId || 0;

  const [rows]: any = await db.query(
    `
    SELECT
      nc.id_nc AS ncId,
      nc.data_abertura AS dataAbertura,
      nc.id_obra AS idObra,
      nc.id_unidade AS idUnidade,
      nc.severidade AS severidade,
      nc.status_nc AS statusNc,
      nc.prazo_correcao_em AS prazoCorrecaoEm,
      nc.concluida_em AS concluidaEm
    FROM sst_nao_conformidades nc
    WHERE nc.tenant_id = ?
      AND nc.id_nc > ?
    ORDER BY nc.id_nc ASC
    LIMIT 50000
    `,
    [args.tenantId, lastId]
  );

  let maxId = lastId;
  let upserts = 0;

  for (const r of rows as any[]) {
    const ncId = Number(r.ncId);
    if (ncId > maxId) maxId = ncId;
    const dataAbertura = String(r.dataAbertura).slice(0, 10);

    const [[skTempo]]: any = await db.query(`SELECT sk_tempo AS sk FROM dw_dim_tempo WHERE data_calendario = ? LIMIT 1`, [dataAbertura]);
    const sk_tempo = skTempo?.sk ? Number(skTempo.sk) : null;
    if (!sk_tempo) continue;

    let sk_local: number | null = null;
    const idObra = r.idObra !== null && r.idObra !== undefined ? Number(r.idObra) : null;
    const idUnidade = r.idUnidade !== null && r.idUnidade !== undefined ? Number(r.idUnidade) : null;
    if (idObra) {
      const [[loc]]: any = await db.query(
        `SELECT sk_local AS sk FROM dw_dim_local WHERE tenant_id = ? AND tipo_local = 'OBRA' AND local_id = ? AND atual = 1 LIMIT 1`,
        [args.tenantId, idObra]
      );
      sk_local = loc?.sk ? Number(loc.sk) : null;
    } else if (idUnidade) {
      const [[loc]]: any = await db.query(
        `SELECT sk_local AS sk FROM dw_dim_local WHERE tenant_id = ? AND tipo_local = 'UNIDADE' AND local_id = ? AND atual = 1 LIMIT 1`,
        [args.tenantId, idUnidade]
      );
      sk_local = loc?.sk ? Number(loc.sk) : null;
    }

    const severidade = String(r.severidade || '').toUpperCase();
    const critica = severidade === 'CRITICA' || severidade === 'ALTA' ? 1 : 0;
    const statusNc = String(r.statusNc || '').toUpperCase();
    const prazo = r.prazoCorrecaoEm ? String(r.prazoCorrecaoEm).slice(0, 10) : null;
    const vencida = prazo ? (new Date(`${prazo}T00:00:00Z`).getTime() < Date.now() && statusNc !== 'CONCLUIDA' ? 1 : 0) : 0;

    await db.query(
      `
      INSERT INTO dw_fact_sst_nc
        (tenant_id, nc_id, sk_tempo_abertura, sk_local, severidade, status_nc, critica, vencida, prazo_correcao_em, concluida_em, atualizado_em_origem)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        sk_tempo_abertura = VALUES(sk_tempo_abertura),
        sk_local = VALUES(sk_local),
        severidade = VALUES(severidade),
        status_nc = VALUES(status_nc),
        critica = VALUES(critica),
        vencida = VALUES(vencida),
        prazo_correcao_em = VALUES(prazo_correcao_em),
        concluida_em = VALUES(concluida_em),
        atualizado_em_origem = VALUES(atualizado_em_origem)
      `,
      [args.tenantId, ncId, sk_tempo, sk_local, severidade.slice(0, 20), statusNc.slice(0, 30), critica, vencida, prazo, r.concluidaEm ? String(r.concluidaEm).slice(0, 10) : null]
    );
    upserts++;
  }

  if (maxId > lastId) await setWatermark({ tenantId: args.tenantId, pipelineNome: 'SST', origemNome: 'NC', ultimoUpdatedAt: null, ultimoId: maxId });

  return { lidos: (rows as any[]).length, atualizados: upserts };
}

async function loadSuprimentosSolicitacoes(args: { tenantId: number }) {
  const wm = await getWatermark({ tenantId: args.tenantId, pipelineNome: 'SUPRIMENTOS', origemNome: 'SOLICITACOES' });
  const lastId = wm.ultimoId || 0;

  const [rows]: any = await db.query(
    `
    SELECT
      s.id_solicitacao AS solicitacaoId,
      s.data_solicitacao AS dataSolicitacao,
      s.id_obra_origem AS idObraOrigem,
      s.id_unidade_origem AS idUnidadeOrigem,
      s.status_solicitacao AS statusSolicitacao,
      s.regime_urgencia AS regimeUrgencia,
      s.valor_estimado AS valorEstimado,
      s.itens_total AS itensTotal
    FROM solicitacao_material s
    WHERE s.tenant_id = ?
      AND s.id_solicitacao > ?
    ORDER BY s.id_solicitacao ASC
    LIMIT 50000
    `,
    [args.tenantId, lastId]
  );

  let maxId = lastId;
  let upserts = 0;

  for (const r of rows as any[]) {
    const solicitacaoId = Number(r.solicitacaoId);
    if (solicitacaoId > maxId) maxId = solicitacaoId;
    const dataSolicitacao = String(r.dataSolicitacao).slice(0, 10);

    const [[skTempo]]: any = await db.query(`SELECT sk_tempo AS sk FROM dw_dim_tempo WHERE data_calendario = ? LIMIT 1`, [dataSolicitacao]);
    const sk_tempo = skTempo?.sk ? Number(skTempo.sk) : null;
    if (!sk_tempo) continue;

    let sk_local: number | null = null;
    const idObra = r.idObraOrigem !== null && r.idObraOrigem !== undefined ? Number(r.idObraOrigem) : null;
    const idUnidade = r.idUnidadeOrigem !== null && r.idUnidadeOrigem !== undefined ? Number(r.idUnidadeOrigem) : null;
    if (idObra) {
      const [[loc]]: any = await db.query(
        `SELECT sk_local AS sk FROM dw_dim_local WHERE tenant_id = ? AND tipo_local = 'OBRA' AND local_id = ? AND atual = 1 LIMIT 1`,
        [args.tenantId, idObra]
      );
      sk_local = loc?.sk ? Number(loc.sk) : null;
    } else if (idUnidade) {
      const [[loc]]: any = await db.query(
        `SELECT sk_local AS sk FROM dw_dim_local WHERE tenant_id = ? AND tipo_local = 'UNIDADE' AND local_id = ? AND atual = 1 LIMIT 1`,
        [args.tenantId, idUnidade]
      );
      sk_local = loc?.sk ? Number(loc.sk) : null;
    }

    const urgente = String(r.regimeUrgencia || '').toUpperCase();
    const urgenteBit = urgente === 'URGENTE' || urgente === 'EMERGENCIAL' ? 1 : 0;
    const status = String(r.statusSolicitacao || '').toUpperCase();

    await db.query(
      `
      INSERT INTO dw_fact_suprimentos_solicitacoes
        (tenant_id, solicitacao_id, sk_tempo, sk_local, status_solicitacao, urgente, valor_estimado, itens_total, atendida, atualizado_em_origem)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        sk_tempo = VALUES(sk_tempo),
        sk_local = VALUES(sk_local),
        status_solicitacao = VALUES(status_solicitacao),
        urgente = VALUES(urgente),
        valor_estimado = VALUES(valor_estimado),
        itens_total = VALUES(itens_total),
        atendida = VALUES(atendida),
        atualizado_em_origem = VALUES(atualizado_em_origem)
      `,
      [
        args.tenantId,
        solicitacaoId,
        sk_tempo,
        sk_local,
        status.slice(0, 30),
        urgenteBit,
        r.valorEstimado !== null && r.valorEstimado !== undefined ? Number(r.valorEstimado) : null,
        r.itensTotal !== null && r.itensTotal !== undefined ? Number(r.itensTotal) : 0,
        status === 'RECEBIDA' ? 1 : 0,
      ]
    );
    upserts++;
  }

  if (maxId > lastId) await setWatermark({ tenantId: args.tenantId, pipelineNome: 'SUPRIMENTOS', origemNome: 'SOLICITACOES', ultimoUpdatedAt: null, ultimoId: maxId });

  return { lidos: (rows as any[]).length, atualizados: upserts };
}

export async function executarPipelineAnalytics(args: { tenantId: number | null; pipelineNome: string }) {
  const pipelineNome = String(args.pipelineNome || '').trim().toUpperCase();
  const tenantId = args.tenantId;

  const registros = { lidos: 0, inseridos: 0, atualizados: 0, ignorados: 0 };
  const errors: string[] = [];

  try {
    if (pipelineNome === 'REBUILD') {
      if (!tenantId) throw new Error('tenantId obrigatório para REBUILD');
      await ensureDimTempo({ daysBack: 800, daysForward: 30 });
      await upsertDimTenant({ tenantId });
      await upsertDimLocal({ tenantId });
      await upsertDimFuncionario({ tenantId });
      const rh = await loadRhPresencas({ tenantId });
      registros.lidos += rh.lidos;
      registros.atualizados += rh.atualizados;
      const sst = await loadSstNc({ tenantId });
      registros.lidos += sst.lidos;
      registros.atualizados += sst.atualizados;
      const sup = await loadSuprimentosSolicitacoes({ tenantId });
      registros.lidos += sup.lidos;
      registros.atualizados += sup.atualizados;
      return { ok: errors.length === 0, message: errors.length ? errors.join(' | ') : 'OK', registros };
    }

    if (pipelineNome === 'DIMENSOES_BASE') {
      if (!tenantId) throw new Error('tenantId obrigatório para DIMENSOES_BASE');
      const t = await ensureDimTempo({ daysBack: 800, daysForward: 30 });
      registros.inseridos += t.inseridos;
      const ten = await upsertDimTenant({ tenantId });
      registros.atualizados += ten.atualizados;
      const loc = await upsertDimLocal({ tenantId });
      registros.atualizados += loc.atualizados;
      const f = await upsertDimFuncionario({ tenantId });
      registros.atualizados += f.atualizados;
      return { ok: errors.length === 0, message: errors.length ? errors.join(' | ') : 'OK', registros };
    }

    if (pipelineNome === 'RH') {
      if (!tenantId) throw new Error('tenantId obrigatório para RH');
      const rh = await loadRhPresencas({ tenantId });
      registros.lidos += rh.lidos;
      registros.atualizados += rh.atualizados;
      return { ok: true, message: 'OK', registros };
    }

    if (pipelineNome === 'SST') {
      if (!tenantId) throw new Error('tenantId obrigatório para SST');
      const sst = await loadSstNc({ tenantId });
      registros.lidos += sst.lidos;
      registros.atualizados += sst.atualizados;
      return { ok: true, message: 'OK', registros };
    }

    if (pipelineNome === 'SUPRIMENTOS') {
      if (!tenantId) throw new Error('tenantId obrigatório para SUPRIMENTOS');
      const sup = await loadSuprimentosSolicitacoes({ tenantId });
      registros.lidos += sup.lidos;
      registros.atualizados += sup.atualizados;
      return { ok: true, message: 'OK', registros };
    }

    if (pipelineNome === 'MARTS') {
      return { ok: true, message: 'OK', registros };
    }

    if (pipelineNome === 'ENGENHARIA') {
      return { ok: true, message: 'OK', registros };
    }

    throw new Error('pipelineNome inválido');
  } catch (e: any) {
    errors.push(e?.message ? String(e.message) : 'Erro');
    return { ok: false, message: errors.join(' | '), registros };
  }
}

