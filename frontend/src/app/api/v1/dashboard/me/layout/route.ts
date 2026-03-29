import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

const DEFAULTS: Record<string, any[]> = {
  DIRETOR: [
    { widgetCodigo: 'CARDS_OPERACIONAIS', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'FINANCEIRO_DIRETORIA', ordemExibicao: 2, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'ALERTAS_DIRETORIA', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
  ],
  CEO: [
    { widgetCodigo: 'CARDS_EXECUTIVOS', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'FINANCEIRO_EXECUTIVO', ordemExibicao: 2, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'ALERTAS_EXECUTIVOS', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
  ],
  GERENTE: [
    { widgetCodigo: 'CARDS_GERENTE', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'FINANCEIRO_GERENTE', ordemExibicao: 2, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'ALERTAS_GERENTE', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
  ],
  RH: [
    { widgetCodigo: 'CARDS_RH', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'MOVIMENTACAO_RH', ordemExibicao: 2, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'ALERTAS_RH', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'SERIES_RH', ordemExibicao: 4, largura: 12, altura: 1, visivel: true },
  ],
  SST: [
    { widgetCodigo: 'CARDS_SST', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'ALERTAS_SST', ordemExibicao: 2, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'SERIES_SST', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'RANKING_SST', ordemExibicao: 4, largura: 12, altura: 1, visivel: true },
  ],
  SUPRIMENTOS: [
    { widgetCodigo: 'CARDS_SUPRIMENTOS', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'ALERTAS_SUPRIMENTOS', ordemExibicao: 2, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'SERIES_SUPRIMENTOS', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'ESTOQUE_CRITICO', ordemExibicao: 4, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'COMPRAS_ANDAMENTO', ordemExibicao: 5, largura: 12, altura: 1, visivel: true },
  ],
  ENGENHARIA: [
    { widgetCodigo: 'CARDS_ENGENHARIA', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'ALERTAS_ENGENHARIA', ordemExibicao: 2, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'SERIES_ENGENHARIA', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'OBRAS_RISCO', ordemExibicao: 4, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'MEDICOES_PENDENTES', ordemExibicao: 5, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'CRONOGRAMA_ACOMPANHAMENTO', ordemExibicao: 6, largura: 12, altura: 1, visivel: true },
  ],
  FISCALIZACAO: [
    { widgetCodigo: 'CARDS_FISCALIZACAO', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'DIARIO_OBRA', ordemExibicao: 2, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'CALENDARIO_OBRA', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'PROGRESSO_OBRA', ordemExibicao: 4, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'PROGRESSO_CONTRATO', ordemExibicao: 5, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'PRAZO_EXECUCAO', ordemExibicao: 6, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'MEDICOES_FISCALIZACAO', ordemExibicao: 7, largura: 6, altura: 1, visivel: true },
  ],
  HOME: [
    { widgetCodigo: 'BEM_VINDO', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'ATALHOS_RAPIDOS', ordemExibicao: 2, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'PENDENCIAS_MODULOS', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'NOTIFICACOES', ordemExibicao: 4, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'FAVORITOS', ordemExibicao: 5, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'RECENTES', ordemExibicao: 6, largura: 6, altura: 1, visivel: true },
  ],
  PORTAL_GESTOR: [
    { widgetCodigo: 'RESUMO_LOCAL', ordemExibicao: 1, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'EQUIPE_HOJE', ordemExibicao: 2, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'PENDENCIAS_CRITICAS', ordemExibicao: 3, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'AGENDA_OPERACIONAL', ordemExibicao: 4, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'ATALHOS_CAMPO', ordemExibicao: 5, largura: 12, altura: 1, visivel: true },
    { widgetCodigo: 'STATUS_SST_LOCAL', ordemExibicao: 6, largura: 6, altura: 1, visivel: true },
    { widgetCodigo: 'SUPRIMENTOS_LOCAL', ordemExibicao: 7, largura: 6, altura: 1, visivel: true },
  ],
};

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_USUARIO_PERSONALIZAR);
    const dashboard = (req.nextUrl.searchParams.get('contexto') || req.nextUrl.searchParams.get('dashboard') || 'DIRETOR').toUpperCase();

    const [layoutRows]: any = await db.query(
      `SELECT *
       FROM dashboard_layouts_usuario
       WHERE tenant_id = ? AND id_usuario = ? AND dashboard_codigo = ? AND ativo = 1
       LIMIT 1`,
      [current.tenantId, current.id, dashboard]
    );

    if (!layoutRows.length) {
      return ok({
        dashboardCodigo: dashboard,
        widgets: DEFAULTS[dashboard] || [],
      });
    }

    const layout = layoutRows[0];
    const [widgetsRaw]: any = await db.query(
      `SELECT
              widget_codigo AS widgetCodigo,
              ordem_exibicao AS ordemExibicao,
              largura, altura, visivel, configuracao_json AS configuracaoJson
       FROM dashboard_widgets_usuario
       WHERE id_dashboard_layout = ?
       ORDER BY ordem_exibicao`,
      [layout.id_dashboard_layout]
    );

    const widgets = (Array.isArray(widgetsRaw) ? widgetsRaw : []).map((w: any) => ({
      ...w,
      visivel: Boolean(w.visivel),
      configuracaoJson: typeof w.configuracaoJson === 'string' ? JSON.parse(w.configuracaoJson) : w.configuracaoJson,
    }));

    return ok({
      idLayout: layout.id_dashboard_layout,
      dashboardCodigo: dashboard,
      widgets,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_USUARIO_PERSONALIZAR);
    const body = await req.json();

    const dashboardCodigo = String(body.contexto || body.dashboardCodigo || '').toUpperCase();
    if (!dashboardCodigo || !Array.isArray(body.widgets)) {
      return fail(422, 'dashboardCodigo e widgets são obrigatórios');
    }

    await conn.beginTransaction();

    const [layoutRows]: any = await conn.query(
      `SELECT *
       FROM dashboard_layouts_usuario
       WHERE tenant_id = ? AND id_usuario = ? AND dashboard_codigo = ? AND ativo = 1
       LIMIT 1`,
      [current.tenantId, current.id, dashboardCodigo]
    );

    let idLayout = layoutRows[0]?.id_dashboard_layout;

    if (!idLayout) {
      const [insert]: any = await conn.query(
        `INSERT INTO dashboard_layouts_usuario
         (tenant_id, id_usuario, dashboard_codigo, nome_layout, padrao, ativo)
         VALUES (?, ?, ?, 'Padrão', 1, 1)`,
        [current.tenantId, current.id, dashboardCodigo]
      );
      idLayout = insert.insertId;
    }

    await conn.query(`DELETE FROM dashboard_widgets_usuario WHERE id_dashboard_layout = ?`, [idLayout]);

    for (const w of body.widgets) {
      await conn.query(
        `INSERT INTO dashboard_widgets_usuario
         (id_dashboard_layout, widget_codigo, ordem_exibicao, largura, altura, visivel, configuracao_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          idLayout,
          w.widgetCodigo,
          w.ordemExibicao || 0,
          w.largura || 6,
          w.altura || 1,
          w.visivel ? 1 : 0,
          w.configuracaoJson ? JSON.stringify(w.configuracaoJson) : null,
        ]
      );
    }

    await conn.commit();
    return ok({ idLayout });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
