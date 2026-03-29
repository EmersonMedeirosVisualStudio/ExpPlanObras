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

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normalizeCodigoServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
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
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const codigoServico = normalizeCodigoServico(req.nextUrl.searchParams.get('codigoServico'));
    const dias = req.nextUrl.searchParams.get('dias') ? Number(req.nextUrl.searchParams.get('dias')) : 90;

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');

    await ensureTables();

    const diasNorm = Math.max(7, Math.min(365, Number.isFinite(dias) ? dias : 90));

    const [rows]: any = await db.query(
      `
      SELECT
        h.data_referencia AS dataReferencia,
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
        AND h.data_referencia >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND h.status_presenca IN ('EM_PREENCHIMENTO','FECHADA','ENVIADA_RH','RECEBIDA_RH')
        AND i.situacao_presenca = 'PRESENTE'
        AND p.id_presenca_item IS NOT NULL
      ORDER BY h.data_referencia DESC
      LIMIT 4000
      `,
      [current.tenantId, idObra, diasNorm]
    );

    let totalQtd = 0;
    let totalMin = 0;
    let unidade: string | null = null;
    let amostras = 0;

    for (const r of rows as any[]) {
      const dataRef = String(r.dataReferencia);
      const minutos = minutesBetween(dataRef, r.horaEntrada ? String(r.horaEntrada).slice(0, 5) : null, r.horaSaida ? String(r.horaSaida).slice(0, 5) : null) + Number(r.minutosHoraExtra || 0);
      if (minutos <= 0) continue;
      const qtdTotal = r.quantidadeExecutada == null ? 0 : Number(r.quantidadeExecutada);
      const servs = normalizeServicosJson(r.servicosJson);
      if (!servs.length) continue;

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
      if (qtdServico <= 0) continue;

      totalQtd += qtdServico;
      totalMin += minutos;
      unidade = unidade || (r.unidadeMedida ? String(r.unidadeMedida) : null);
      amostras += 1;
    }

    const horas = totalMin > 0 ? totalMin / 60 : 0;
    const produtividade = horas > 0 ? totalQtd / horas : null;

    return ok({
      codigoServico,
      dias: diasNorm,
      unidadeMedida: unidade,
      amostras,
      producaoMinimaPorHora: produtividade == null ? null : Number(produtividade.toFixed(4)),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
