import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { parseCsvText } from '@/lib/modules/engenharia-importacao/csv';
import { previewMateriais } from '@/lib/modules/engenharia-importacao/validators';
import { auditBasica, ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

async function readUtf8CsvFile(file: File) {
  if (!file) throw new Error('Arquivo ausente');
  if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande (limite 5MB)');
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Error('Arquivo CSV deve estar em UTF-8');
  }
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function toNumber(v: string) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toBool01(v: string) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'sim' ? 1 : 0;
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ENGENHARIA_MATERIAIS_IMPORTAR);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail(422, 'Arquivo CSV é obrigatório (campo "file")');
    const csvText = await readUtf8CsvFile(file);
    const preview = previewMateriais(csvText);
    if (preview.result.invalidas > 0) return fail(422, 'Arquivo possui erros. Corrija antes de importar.', preview.result);

    await ensureEngenhariaImportTables();

    const { headers, rows } = parseCsvText(csvText);
    const idx = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));

    const conn = await db.getConnection();
    let inseridos = 0;
    let atualizados = 0;
    let ignorados = 0;
    try {
      await conn.beginTransaction();
      for (const r of rows) {
        const codigo = String(r[idx.codigo] ?? '').trim();
        if (!codigo) {
          ignorados++;
          continue;
        }
        const params = [
          current.tenantId,
          codigo,
          String(r[idx.descricao] ?? '').trim(),
          String(r[idx.unidade] ?? '').trim(),
          String(r[idx.grupo] ?? '').trim() || null,
          String(r[idx.categoria] ?? '').trim() || null,
          toNumber(String(r[idx.preco_unitario] ?? '0')),
          toNumber(String(r[idx.estoque_minimo] ?? '0')),
          toBool01(String(r[idx.ativo] ?? '1')),
        ];
        const [res]: any = await conn.query(
          `
          INSERT INTO engenharia_materiais
            (tenant_id, codigo, descricao, unidade, grupo, categoria, preco_unitario, estoque_minimo, ativo)
          VALUES
            (?,?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE
            descricao = VALUES(descricao),
            unidade = VALUES(unidade),
            grupo = VALUES(grupo),
            categoria = VALUES(categoria),
            preco_unitario = VALUES(preco_unitario),
            estoque_minimo = VALUES(estoque_minimo),
            ativo = VALUES(ativo)
          `,
          params
        );
        const affected = Number(res?.affectedRows || 0);
        if (affected === 1) inseridos++;
        else if (affected >= 2) atualizados++;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await auditBasica({
      tenantId: current.tenantId,
      userId: current.id,
      acao: 'IMPORT_CSV',
      entidade: 'ENGENHARIA_MATERIAIS',
      resumo: { inseridos, atualizados, ignorados, totalLinhas: rows.length },
    });

    return ok({ inseridos, atualizados, ignorados, erros: 0 });
  } catch (e) {
    return handleApiError(e);
  }
}

