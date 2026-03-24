import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { buildMenuResponse, type BuildMenuContext } from '@/lib/navigation/build';
import type { MenuItemDTO, MenuScopeType } from '@/lib/navigation/types';
import { buildMenuBadges } from '@/lib/navigation/build-menu-badges';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

function collectMap(items: MenuItemDTO[], map: Map<string, MenuItemDTO>) {
  for (const it of items) {
    map.set(it.key, it);
    if (it.children?.length) collectMap(it.children, map);
  }
}

export async function GET() {
  try {
    const user = await requireAuthenticatedApiUser();
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

    const allowed = new Map<string, MenuItemDTO>();
    for (const s of menu.secoes) collectMap(s.items, allowed);

    let favoritos: any[] = [];
    try {
      const [rows]: any = await db.query(
        `SELECT menu_key AS menuKey, ordem FROM usuarios_menu_favoritos WHERE tenant_id = ? AND id_usuario = ? ORDER BY ordem ASC, menu_key ASC`,
        [user.tenantId, user.id]
      );
      favoritos = (rows as any[]).filter((r) => allowed.has(String(r.menuKey)));
    } catch {
      favoritos = [];
    }

    let atalhos: any[] = [];
    try {
      const [rows]: any = await db.query(
        `
        SELECT id_usuario_atalho AS id, tipo_atalho AS tipo, titulo, href, menu_key AS menuKey, icone, cor, ordem, ativo
        FROM usuarios_atalhos_rapidos
        WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
        ORDER BY ordem ASC, id_usuario_atalho DESC
        LIMIT 12
        `,
        [user.tenantId, user.id]
      );
      atalhos = (rows as any[]).filter((r) => !r.menuKey || allowed.has(String(r.menuKey)));
    } catch {
      atalhos = [];
    }

    let preferencias: any = {
      modoInicio: 'HOME',
      rotaFixa: null,
      exibirFavoritosMenu: true,
      exibirRecentes: true,
    };
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
      if (row) preferencias = row;
    } catch {}

    const badges = await buildMenuBadges(
      {
        tenantId: user.tenantId,
        userId: user.id,
        permissions,
        scope: {
          empresaTotal: !!scope.empresaTotal,
          diretorias: scope.diretorias ?? [],
          obras: scope.obras ?? [],
          unidades: scope.unidades ?? [],
        },
      },
      new Set(Array.from(allowed.keys()))
    );

    let notificacoes: any[] = [];
    try {
      const [rows]: any = await db.query(
        `
        SELECT
          e.id_notificacao_evento AS id,
          e.modulo,
          e.severidade,
          e.titulo,
          e.mensagem,
          e.rota,
          (d.status_leitura = 'LIDA') AS lida,
          e.atualizado_em AS atualizadoEm
        FROM notificacoes_destinatarios d
        INNER JOIN notificacoes_eventos e ON e.id_notificacao_evento = d.id_notificacao_evento
        WHERE d.tenant_id = ? AND d.id_usuario = ?
        ORDER BY (d.status_leitura = 'NAO_LIDA') DESC, e.atualizado_em DESC
        LIMIT 20
        `,
        [user.tenantId, user.id]
      );
      notificacoes = rows as any[];
    } catch {
      notificacoes = [];
    }

    const widgets: any[] = [
      { widgetKey: 'BEM_VINDO', titulo: 'Bem-vindo', dados: { nome: user.nome || user.email } },
      { widgetKey: 'ATALHOS_RAPIDOS', titulo: 'Atalhos rápidos', dados: atalhos },
      { widgetKey: 'FAVORITOS', titulo: 'Favoritos', dados: favoritos.map((f) => ({ ...f, href: allowed.get(f.menuKey)?.href || null, label: allowed.get(f.menuKey)?.label || f.menuKey })) },
      { widgetKey: 'NOTIFICACOES', titulo: 'Notificações recentes', dados: notificacoes },
      {
        widgetKey: 'PENDENCIAS_MODULOS',
        titulo: 'Pendências por módulo',
        dados: Object.entries(badges).map(([k, v]: any) => ({ key: k, value: v?.value || 0, tone: v?.tone || 'NEUTRAL', label: v?.label || k })),
      },
    ];

    return ok({
      preferencias,
      favoritos,
      atalhos,
      recentes: [],
      widgets,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

