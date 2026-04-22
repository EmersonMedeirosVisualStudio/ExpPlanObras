import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_contrapartes (
      id_contraparte BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo ENUM('PJ','PF') NOT NULL,
      nome_razao VARCHAR(255) NOT NULL,
      documento VARCHAR(32) NULL,
      email VARCHAR(120) NULL,
      telefone VARCHAR(40) NULL,
      status ENUM('ATIVO','INATIVO') NOT NULL DEFAULT 'ATIVO',
      classificacao_status VARCHAR(32) NOT NULL DEFAULT 'EM_AVALIACAO',
      observacao TEXT NULL,
      cep VARCHAR(16) NULL,
      logradouro VARCHAR(255) NULL,
      numero VARCHAR(64) NULL,
      complemento VARCHAR(255) NULL,
      bairro VARCHAR(120) NULL,
      cidade VARCHAR(120) NULL,
      uf VARCHAR(8) NULL,
      latitude VARCHAR(32) NULL,
      longitude VARCHAR(32) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_contraparte),
      KEY idx_tenant (tenant_id),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_doc (tenant_id, documento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS classificacao_status VARCHAR(32) NOT NULL DEFAULT 'EM_AVALIACAO'`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS cep VARCHAR(16) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS numero VARCHAR(64) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS complemento VARCHAR(255) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS bairro VARCHAR(120) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS cidade VARCHAR(120) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS uf VARCHAR(8) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS latitude VARCHAR(32) NULL`);
  await db.query(`ALTER TABLE engenharia_contrapartes ADD COLUMN IF NOT EXISTS longitude VARCHAR(32) NULL`);
}

function normalizeTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'PJ' || s === 'PF' ? s : null;
}

function normalizeStatus(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ATIVO' || s === 'INATIVO' ? s : null;
}

const CLASSIFICACOES = ['EXCELENTE', 'BOA', 'REGULAR', 'EM_AVALIACAO', 'NAO_RECOMENDADO'] as const;

function normalizeClassificacao(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return (CLASSIFICACOES as readonly string[]).includes(s) ? s : null;
}

function parseId(value: string) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await ctx.params;
    const idContraparte = parseId(id);
    if (!idContraparte) return fail(400, 'ID inválido.');

    const body = await req.json().catch(() => null);
    const tipo = body?.tipo !== undefined ? normalizeTipo(body.tipo) : undefined;
    const status = body?.status !== undefined ? normalizeStatus(body.status) : undefined;
    const classificacaoStatus = body?.classificacaoStatus !== undefined ? (body.classificacaoStatus ? normalizeClassificacao(body.classificacaoStatus) : null) : undefined;
    const nomeRazao = body?.nomeRazao !== undefined ? String(body.nomeRazao || '').trim() : undefined;
    const documento = body?.documento !== undefined ? (body.documento ? String(body.documento).trim() : null) : undefined;
    const email = body?.email !== undefined ? (body.email ? String(body.email).trim() : null) : undefined;
    const telefone = body?.telefone !== undefined ? (body.telefone ? String(body.telefone).trim() : null) : undefined;
    const observacao = body?.observacao !== undefined ? (body.observacao ? String(body.observacao).trim() : null) : undefined;
    const cep = body?.cep !== undefined ? (body.cep ? String(body.cep).trim() : null) : undefined;
    const logradouro = body?.logradouro !== undefined ? (body.logradouro ? String(body.logradouro).trim() : null) : undefined;
    const numero = body?.numero !== undefined ? (body.numero ? String(body.numero).trim() : null) : undefined;
    const complemento = body?.complemento !== undefined ? (body.complemento ? String(body.complemento).trim() : null) : undefined;
    const bairro = body?.bairro !== undefined ? (body.bairro ? String(body.bairro).trim() : null) : undefined;
    const cidade = body?.cidade !== undefined ? (body.cidade ? String(body.cidade).trim() : null) : undefined;
    const uf = body?.uf !== undefined ? (body.uf ? String(body.uf).trim().toUpperCase() : null) : undefined;
    const latitude = body?.latitude !== undefined ? (body.latitude ? String(body.latitude).trim() : null) : undefined;
    const longitude = body?.longitude !== undefined ? (body.longitude ? String(body.longitude).trim() : null) : undefined;

    if (tipo === null) return fail(422, 'tipo inválido (PJ|PF).');
    if (status === null) return fail(422, 'status inválido (ATIVO|INATIVO).');
    if (classificacaoStatus === null) return fail(422, 'classificacaoStatus inválido.');
    if (nomeRazao !== undefined && !nomeRazao) return fail(422, 'nomeRazao é obrigatório.');

    await ensureTables();

    const sets: string[] = [];
    const params: any[] = [];
    if (tipo) {
      sets.push('tipo = ?');
      params.push(tipo);
    }
    if (status) {
      sets.push('status = ?');
      params.push(status);
    }
    if (nomeRazao !== undefined) {
      sets.push('nome_razao = ?');
      params.push(nomeRazao.slice(0, 255));
    }
    if (documento !== undefined) {
      sets.push('documento = ?');
      params.push(documento ? documento.slice(0, 32) : null);
    }
    if (email !== undefined) {
      sets.push('email = ?');
      params.push(email ? email.slice(0, 120) : null);
    }
    if (telefone !== undefined) {
      sets.push('telefone = ?');
      params.push(telefone ? telefone.slice(0, 40) : null);
    }
    if (observacao !== undefined) {
      sets.push('observacao = ?');
      params.push(observacao);
    }
    if (classificacaoStatus !== undefined) {
      sets.push('classificacao_status = ?');
      params.push(classificacaoStatus || 'EM_AVALIACAO');
    }
    if (cep !== undefined) {
      sets.push('cep = ?');
      params.push(cep);
    }
    if (logradouro !== undefined) {
      sets.push('logradouro = ?');
      params.push(logradouro);
    }
    if (numero !== undefined) {
      sets.push('numero = ?');
      params.push(numero);
    }
    if (complemento !== undefined) {
      sets.push('complemento = ?');
      params.push(complemento);
    }
    if (bairro !== undefined) {
      sets.push('bairro = ?');
      params.push(bairro);
    }
    if (cidade !== undefined) {
      sets.push('cidade = ?');
      params.push(cidade);
    }
    if (uf !== undefined) {
      sets.push('uf = ?');
      params.push(uf);
    }
    if (latitude !== undefined) {
      sets.push('latitude = ?');
      params.push(latitude);
    }
    if (longitude !== undefined) {
      sets.push('longitude = ?');
      params.push(longitude);
    }
    if (!sets.length) return fail(422, 'Nenhum campo para atualizar.');

    params.push(current.tenantId, idContraparte);
    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `UPDATE engenharia_contrapartes SET ${sets.join(', ')} WHERE tenant_id = ? AND id_contraparte = ?`,
      params
    );
    if (!res?.affectedRows) {
      await conn.rollback();
      return fail(404, 'Contraparte não encontrada.');
    }
    await conn.commit();
    return ok({ success: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await ctx.params;
    const idContraparte = parseId(id);
    if (!idContraparte) return fail(400, 'ID inválido.');

    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `UPDATE engenharia_contrapartes SET status = 'INATIVO' WHERE tenant_id = ? AND id_contraparte = ?`,
      [current.tenantId, idContraparte]
    );
    if (!res?.affectedRows) {
      await conn.rollback();
      return fail(404, 'Contraparte não encontrada.');
    }
    await conn.commit();
    return ok({ success: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
