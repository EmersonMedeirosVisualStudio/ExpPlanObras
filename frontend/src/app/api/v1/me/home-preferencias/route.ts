import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireAuthenticatedApiUser();
    try {
      const [[row]]: any = await db.query(
        `
        SELECT modo_inicio AS modoInicio, rota_fixa AS rotaFixa, exibir_favoritos_menu AS exibirFavoritosMenu, exibir_recentes AS exibirRecentes
        FROM usuarios_home_preferencias
        WHERE tenant_id = ? AND id_usuario = ?
        LIMIT 1
        `,
        [user.tenantId, user.id]
      );
      if (row) return ok(row);
    } catch {}

    return ok({ modoInicio: 'HOME', rotaFixa: null, exibirFavoritosMenu: true, exibirRecentes: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const body = (await req.json().catch(() => null)) as any;
    const modoInicio = String(body?.modoInicio || 'HOME');
    const rotaFixa = body?.rotaFixa ? String(body.rotaFixa) : null;
    const exibirFavoritosMenu = !!body?.exibirFavoritosMenu;
    const exibirRecentes = !!body?.exibirRecentes;

    try {
      await db.execute(
        `
        INSERT INTO usuarios_home_preferencias
          (tenant_id, id_usuario, modo_inicio, rota_fixa, exibir_favoritos_menu, exibir_recentes)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          modo_inicio = VALUES(modo_inicio),
          rota_fixa = VALUES(rota_fixa),
          exibir_favoritos_menu = VALUES(exibir_favoritos_menu),
          exibir_recentes = VALUES(exibir_recentes)
        `,
        [user.tenantId, user.id, modoInicio, rotaFixa, exibirFavoritosMenu ? 1 : 0, exibirRecentes ? 1 : 0]
      );
    } catch {}

    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

