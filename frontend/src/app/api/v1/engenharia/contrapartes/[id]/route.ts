import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

function normalizeTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'PJ' || s === 'PF' ? s : null;
}

function normalizeStatus(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ATIVO' || s === 'INATIVO' ? s : null;
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
    const nomeRazao = body?.nomeRazao !== undefined ? String(body.nomeRazao || '').trim() : undefined;
    const documento = body?.documento !== undefined ? (body.documento ? String(body.documento).trim() : null) : undefined;
    const email = body?.email !== undefined ? (body.email ? String(body.email).trim() : null) : undefined;
    const telefone = body?.telefone !== undefined ? (body.telefone ? String(body.telefone).trim() : null) : undefined;
    const observacao = body?.observacao !== undefined ? (body.observacao ? String(body.observacao).trim() : null) : undefined;

    if (tipo === null) return fail(422, 'tipo inválido (PJ|PF).');
    if (status === null) return fail(422, 'status inválido (ATIVO|INATIVO).');
    if (nomeRazao !== undefined && !nomeRazao) return fail(422, 'nomeRazao é obrigatório.');

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
