import { ok, handleApiError, ApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { buildMenuResponse, type BuildMenuContext } from '@/lib/navigation/build';
import type { MenuItemDTO, MenuScopeType } from '@/lib/navigation/types';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

function collectKeys(items: MenuItemDTO[], out: Set<string>) {
  for (const it of items) {
    if (it.href) out.add(it.key);
    if (it.children?.length) collectKeys(it.children, out);
  }
}

export async function GET() {
  try {
    const user = await requireAuthenticatedApiUser();
    try {
      const [rows]: any = await db.query(
        `SELECT menu_key AS menuKey, ordem FROM usuarios_menu_favoritos WHERE tenant_id = ? AND id_usuario = ? ORDER BY ordem ASC, menu_key ASC`,
        [user.tenantId, user.id]
      );
      return ok(rows as any[]);
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const body = (await req.json().catch(() => null)) as any;
    const items = Array.isArray(body?.items) ? body.items : [];

    const permissions = await getCurrentUserPermissions(user.id);
    const scope = await getDashboardScope(user);
    const scopeTypes = [
      scope.empresaTotal ? 'EMPRESA' : null,
      ...(scope.diretorias?.length ? ['DIRETORIA'] : []),
      ...(scope.obras?.length ? ['OBRA'] : []),
      ...(scope.unidades?.length ? ['UNIDADE'] : []),
    ].filter(Boolean) as MenuScopeType[];
    const ctx: BuildMenuContext = { permissions, scopeTypes };
    const menu = buildMenuResponse(ctx);
    const allowed = new Set<string>();
    for (const s of menu.secoes) collectKeys(s.items, allowed);

    const validItems = items
      .filter((x: any) => x && typeof x.menuKey === 'string' && Number.isFinite(Number(x.ordem)))
      .filter((x: any) => allowed.has(String(x.menuKey)));

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`DELETE FROM usuarios_menu_favoritos WHERE tenant_id = ? AND id_usuario = ?`, [user.tenantId, user.id]);
      for (const it of validItems) {
        await conn.execute(
          `INSERT INTO usuarios_menu_favoritos (tenant_id, id_usuario, menu_key, ordem) VALUES (?, ?, ?, ?)`,
          [user.tenantId, user.id, String(it.menuKey), Number(it.ordem)]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

