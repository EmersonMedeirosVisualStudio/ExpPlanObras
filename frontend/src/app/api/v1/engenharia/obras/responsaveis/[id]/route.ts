import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

function normalizeTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'RESPONSAVEL_TECNICO' || s === 'FISCAL_OBRA' ? s : null;
}

function parseId(v: string) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await ctx.params;
    const idResponsavel = parseId(id);
    if (!idResponsavel) return fail(400, 'ID inválido.');

    const body = await req.json().catch(() => null);
    const tipo = body?.tipo !== undefined ? normalizeTipo(body.tipo) : undefined;
    const nome = body?.nome !== undefined ? String(body.nome || '').trim() : undefined;
    const registroProfissional = body?.registroProfissional !== undefined ? (body.registroProfissional ? String(body.registroProfissional).trim() : null) : undefined;
    const cpf = body?.cpf !== undefined ? (body.cpf ? String(body.cpf).trim() : null) : undefined;
    const email = body?.email !== undefined ? (body.email ? String(body.email).trim() : null) : undefined;
    const telefone = body?.telefone !== undefined ? (body.telefone ? String(body.telefone).trim() : null) : undefined;
    const ativo = body?.ativo !== undefined ? Boolean(body.ativo) : undefined;

    if (tipo === null) return fail(422, 'tipo inválido.');
    if (nome !== undefined && !nome) return fail(422, 'nome é obrigatório.');

    const sets: string[] = [];
    const params: any[] = [];
    if (tipo) {
      sets.push('tipo = ?');
      params.push(tipo);
    }
    if (nome !== undefined) {
      sets.push('nome = ?');
      params.push(nome.slice(0, 255));
    }
    if (registroProfissional !== undefined) {
      sets.push('registro_profissional = ?');
      params.push(registroProfissional ? registroProfissional.slice(0, 64) : null);
    }
    if (cpf !== undefined) {
      sets.push('cpf = ?');
      params.push(cpf ? cpf.slice(0, 20) : null);
    }
    if (email !== undefined) {
      sets.push('email = ?');
      params.push(email ? email.slice(0, 120) : null);
    }
    if (telefone !== undefined) {
      sets.push('telefone = ?');
      params.push(telefone ? telefone.slice(0, 40) : null);
    }
    if (ativo !== undefined) {
      sets.push('ativo = ?');
      params.push(ativo ? 1 : 0);
    }
    if (!sets.length) return fail(422, 'Nenhum campo para atualizar.');

    params.push(current.tenantId, idResponsavel);
    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `UPDATE obras_responsaveis SET ${sets.join(', ')} WHERE tenant_id = ? AND id_responsavel_obra = ?`,
      params
    );
    if (!res?.affectedRows) {
      await conn.rollback();
      return fail(404, 'Registro não encontrado.');
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
    const idResponsavel = parseId(id);
    if (!idResponsavel) return fail(400, 'ID inválido.');

    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `DELETE FROM obras_responsaveis WHERE tenant_id = ? AND id_responsavel_obra = ?`,
      [current.tenantId, idResponsavel]
    );
    if (!res?.affectedRows) {
      await conn.rollback();
      return fail(404, 'Registro não encontrado.');
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
