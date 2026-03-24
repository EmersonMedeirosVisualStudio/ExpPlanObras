import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const MODULES = ['RH', 'SST', 'SUPRIMENTOS', 'ENGENHARIA', 'ADMIN'] as const;

export async function GET() {
  try {
    const user = await requireAuthenticatedApiUser();
    try {
      const [rows]: any = await db.query(
        `
        SELECT
          modulo,
          recebe_no_app AS recebeNoApp,
          recebe_email AS recebeEmail,
          modo_email AS modoEmail,
          somente_criticas_email AS somenteCriticasEmail,
          horario_digesto AS horarioDigesto,
          timezone,
          ativo
        FROM notificacoes_preferencias_usuario
        WHERE tenant_id = ? AND id_usuario = ?
        ORDER BY modulo
        `,
        [user.tenantId, user.id]
      );
      return ok(rows as any[]);
    } catch {
      return ok(
        MODULES.map((m) => ({
          modulo: m,
          recebeNoApp: true,
          recebeEmail: false,
          modoEmail: 'IMEDIATO',
          somenteCriticasEmail: true,
          horarioDigesto: null,
          timezone: null,
          ativo: true,
        }))
      );
    }
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const body = (await req.json().catch(() => null)) as any;
    if (!Array.isArray(body)) return ok(null);

    try {
      for (const pref of body) {
        if (!pref?.modulo) continue;
        await db.execute(
          `
          INSERT INTO notificacoes_preferencias_usuario
            (tenant_id, id_usuario, modulo, recebe_no_app, recebe_email, modo_email, somente_criticas_email, horario_digesto, timezone, ativo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            recebe_no_app = VALUES(recebe_no_app),
            recebe_email = VALUES(recebe_email),
            modo_email = VALUES(modo_email),
            somente_criticas_email = VALUES(somente_criticas_email),
            horario_digesto = VALUES(horario_digesto),
            timezone = VALUES(timezone),
            ativo = VALUES(ativo)
          `,
          [
            user.tenantId,
            user.id,
            String(pref.modulo),
            pref.recebeNoApp ? 1 : 0,
            pref.recebeEmail ? 1 : 0,
            String(pref.modoEmail || 'IMEDIATO'),
            pref.somenteCriticasEmail ? 1 : 0,
            pref.horarioDigesto ? String(pref.horarioDigesto) : null,
            pref.timezone ? String(pref.timezone) : null,
            pref.ativo ? 1 : 0,
          ]
        );
      }
    } catch {}

    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}
