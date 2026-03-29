import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

async function ensureProducaoTables() {
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
}

function normalizeCompetencia(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
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

function minutesBetween(dateIso: string, horaEntrada: string | null, horaSaida: string | null) {
  if (!horaEntrada || !horaSaida) return 0;
  const a = new Date(`${dateIso}T${horaEntrada.length === 5 ? `${horaEntrada}:00` : horaEntrada}`);
  const b = new Date(`${dateIso}T${horaSaida.length === 5 ? `${horaSaida}:00` : horaSaida}`);
  const diff = Math.round((b.getTime() - a.getTime()) / 60000);
  return diff > 0 ? diff : 0;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_RH_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const competencia = normalizeCompetencia(req.nextUrl.searchParams.get('competencia'));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!competencia) return fail(422, 'competencia é obrigatória (YYYY-MM)');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureProducaoTables();

    const [rows]: any = await db.query(
      `
      SELECT
        h.data_referencia AS dataReferencia,
        f.id_funcionario AS idFuncionario,
        f.nome_completo AS funcionarioNome,
        i.hora_entrada AS horaEntrada,
        i.hora_saida AS horaSaida,
        COALESCE(i.minutos_hora_extra, 0) AS minutosHoraExtra,
        p.servicos_json AS servicosJson,
        p.quantidade_executada AS quantidadeExecutada,
        p.unidade_medida AS unidadeMedida
      FROM presencas_cabecalho h
      INNER JOIN presencas_itens i ON i.id_presenca = h.id_presenca
      INNER JOIN funcionarios f ON f.id_funcionario = i.id_funcionario
      LEFT JOIN presencas_producao_itens p ON p.tenant_id = h.tenant_id AND p.id_presenca_item = i.id_presenca_item
      WHERE h.tenant_id = ?
        AND h.tipo_local = 'OBRA'
        AND h.id_obra = ?
        AND DATE_FORMAT(h.data_referencia, '%Y-%m') = ?
        AND h.status_presenca IN ('EM_PREENCHIMENTO','FECHADA','ENVIADA_RH','RECEBIDA_RH')
        AND i.situacao_presenca = 'PRESENTE'
      ORDER BY funcionarioNome
      `,
      [current.tenantId, idObra, competencia]
    );

    const map = new Map<string, { idFuncionario: number; funcionarioNome: string; codigoServico: string; unidadeMedida: string | null; quantidade: number; minutos: number }>();
    for (const r of rows as any[]) {
      const dataRef = String(r.dataReferencia);
      const idFuncionario = Number(r.idFuncionario);
      const funcionarioNome = String(r.funcionarioNome || '');
      const unidadeMedida = r.unidadeMedida ? String(r.unidadeMedida) : null;
      const qtdTotal = r.quantidadeExecutada == null ? 0 : Number(r.quantidadeExecutada);
      const minutos = minutesBetween(dataRef, r.horaEntrada ? String(r.horaEntrada).slice(0, 5) : null, r.horaSaida ? String(r.horaSaida).slice(0, 5) : null) + Number(r.minutosHoraExtra || 0);
      if (minutos <= 0) continue;

      const servs = normalizeServicosJson(r.servicosJson);
      if (!servs.length) continue;

      const comQtd = servs.filter((s) => s.quantidade != null && Number.isFinite(s.quantidade as any)) as Array<{ codigoServico: string; quantidade: number }>;
      const semQtd = servs.filter((s) => s.quantidade == null);
      const somaInformada = comQtd.reduce((a, b) => a + Number(b.quantidade || 0), 0);
      const restante = Math.max(0, qtdTotal - somaInformada);
      const qtdPorSem = semQtd.length ? restante / semQtd.length : 0;

      for (const s of servs) {
        const qtd = s.quantidade != null ? Number(s.quantidade) : qtdPorSem;
        if (qtd <= 0) continue;
        const k = `${idFuncionario}|${s.codigoServico}|${unidadeMedida || ''}`;
        const prev = map.get(k) || { idFuncionario, funcionarioNome, codigoServico: s.codigoServico, unidadeMedida, quantidade: 0, minutos: 0 };
        map.set(k, { ...prev, quantidade: prev.quantidade + qtd, minutos: prev.minutos + minutos });
      }
    }

    const out = Array.from(map.values())
      .map((r) => {
        const horas = r.minutos > 0 ? r.minutos / 60 : 0;
        const produtividade = horas > 0 ? r.quantidade / horas : null;
        return {
          idFuncionario: r.idFuncionario,
          funcionarioNome: r.funcionarioNome,
          servicos: [r.codigoServico],
          unidadeMedida: r.unidadeMedida,
          quantidade: Number(r.quantidade.toFixed(4)),
          horas: horas ? Number(horas.toFixed(2)) : 0,
          produtividade: produtividade == null ? null : Number(produtividade.toFixed(4)),
        };
      })
      .sort((a, b) => (a.funcionarioNome || '').localeCompare(b.funcionarioNome || '') || (a.servicos[0] || '').localeCompare(b.servicos[0] || ''));

    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}
