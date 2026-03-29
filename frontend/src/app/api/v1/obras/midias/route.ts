import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';
import { audit } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function ensureMidiasTable() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_midias (
      id_midia BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      tipo ENUM('FOTO','DOCUMENTO') NOT NULL DEFAULT 'FOTO',
      origem ENUM('DIARIO','MEDICAO','RELATORIO','AVULSO') NOT NULL DEFAULT 'AVULSO',
      id_origem BIGINT UNSIGNED NULL,
      url VARCHAR(1024) NOT NULL,
      descricao VARCHAR(255) NULL,
      data_hora DATETIME NULL,
      servicos_json JSON NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_midia),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_origem (tenant_id, origem, id_origem)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const tipo = String(req.nextUrl.searchParams.get('tipo') || '').trim().toUpperCase();
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureMidiasTable();

    const where: string[] = ['tenant_id = ?', 'id_obra = ?'];
    const params: any[] = [current.tenantId, idObra];
    if (tipo === 'FOTO' || tipo === 'DOCUMENTO') {
      where.push('tipo = ?');
      params.push(tipo);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_midia AS idMidia,
        tipo,
        origem,
        id_origem AS idOrigem,
        url,
        descricao,
        data_hora AS dataHora,
        servicos_json AS servicosJson,
        criado_em AS criadoEm
      FROM obras_midias
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(data_hora, criado_em) DESC, id_midia DESC
      LIMIT 500
      `,
      params
    );

    const out = (rows as any[]).map((r) => ({
      ...r,
      idMidia: Number(r.idMidia),
      idOrigem: r.idOrigem ? Number(r.idOrigem) : null,
      servicos: r.servicosJson ? (typeof r.servicosJson === 'string' ? JSON.parse(r.servicosJson) : r.servicosJson) : null,
    }));
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const tipo = String(body?.tipo || 'FOTO').trim().toUpperCase();
    const origem = String(body?.origem || 'AVULSO').trim().toUpperCase();
    const idOrigem = body?.idOrigem ? Number(body.idOrigem) : null;
    const url = String(body?.url || '').trim();
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const dataHora = body?.dataHora ? String(body.dataHora).trim() : null;
    const servicos = Array.isArray(body?.servicos) ? body.servicos.map((s: any) => String(s ?? '').trim()).filter(Boolean) : null;

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!url) return fail(422, 'url é obrigatória');
    if (!['FOTO', 'DOCUMENTO'].includes(tipo)) return fail(422, 'tipo inválido');
    if (!['DIARIO', 'MEDICAO', 'RELATORIO', 'AVULSO'].includes(origem)) return fail(422, 'origem inválida');
    if (dataHora && Number.isNaN(Date.parse(dataHora))) return fail(422, 'dataHora inválida');

    await ensureMidiasTable();

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO obras_midias
        (tenant_id, id_obra, tipo, origem, id_origem, url, descricao, data_hora, servicos_json, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        idObra,
        tipo,
        origem,
        idOrigem || null,
        url,
        descricao,
        dataHora ? new Date(dataHora) : null,
        servicos ? JSON.stringify(servicos) : null,
        current.id,
      ]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'obras_midias',
      idRegistro: String(ins.insertId),
      acao: 'CREATE',
      dadosNovos: { idObra, tipo, origem, idOrigem, url, descricao, dataHora, servicos },
    });

    await conn.commit();
    return ok({ idMidia: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

