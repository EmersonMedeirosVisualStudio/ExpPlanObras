import { NextRequest } from 'next/server';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.NOTIFICACOES_TEMPLATES_ADMIN);
    try {
      const [rows]: any = await db.query(
        `
        SELECT template_key AS templateKey, assunto_template AS assuntoTemplate, ativo, versao, atualizado_em AS atualizadoEm
        FROM notificacoes_templates_tenant
        WHERE tenant_id = ?
        ORDER BY template_key
        `,
        [current.tenantId]
      );
      return ok(rows as any[]);
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.NOTIFICACOES_TEMPLATES_ADMIN);
    const body = (await req.json().catch(() => null)) as any;
    if (!body?.templateKey || !body?.assuntoTemplate) return ok(null);

    try {
      await db.execute(
        `
        INSERT INTO notificacoes_templates_tenant
          (tenant_id, template_key, assunto_template, html_template, text_template, ativo, versao)
        VALUES (?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          assunto_template = VALUES(assunto_template),
          html_template = VALUES(html_template),
          text_template = VALUES(text_template),
          ativo = VALUES(ativo),
          versao = versao + 1
        `,
        [
          current.tenantId,
          String(body.templateKey),
          String(body.assuntoTemplate),
          body.htmlTemplate ? String(body.htmlTemplate) : null,
          body.textTemplate ? String(body.textTemplate) : null,
          body.ativo ? 1 : 0,
        ]
      );
    } catch {}

    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

