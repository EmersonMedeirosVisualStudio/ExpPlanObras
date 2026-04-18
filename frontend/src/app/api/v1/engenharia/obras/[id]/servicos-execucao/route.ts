import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function requireEngenhariaOrFiscalizacao() {
  try {
    return await requireApiPermission(PERMISSIONS.DASHBOARD_FISCALIZACAO_VIEW);
  } catch {
    return await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  }
}

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_servicos_execucao (
      id_servico_execucao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      descricao_servico VARCHAR(220) NULL,
      unidade_medida VARCHAR(32) NULL,
      justificativa TEXT NULL,
      anexos_json JSON NULL,
      status_aprovacao ENUM('NAO_APLICAVEL','PENDENTE','APROVADO','REJEITADO') NOT NULL DEFAULT 'NAO_APLICAVEL',
      motivo_rejeicao TEXT NULL,
      aprovado_em DATETIME NULL,
      id_usuario_aprovador BIGINT UNSIGNED NULL,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_servico_execucao),
      UNIQUE KEY uk_obra_servico (tenant_id, id_obra, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_status (tenant_id, status_aprovacao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(`ALTER TABLE obras_servicos_execucao ADD COLUMN motivo_rejeicao TEXT NULL`).catch(() => null);
}

function parseJsonArray(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireEngenhariaOrFiscalizacao();
    await ensureTables();
    const { id } = await ctx.params;
    const idObra = Number(id || 0);
    if (!idObra) return fail(400, 'ID da obra inválido');

    const [rows]: any = await db.query(
      `
      SELECT
        codigo_servico AS codigoServico,
        descricao_servico AS descricaoServico,
        unidade_medida AS unidadeMedida,
        justificativa,
        anexos_json AS anexosJson,
        status_aprovacao AS statusAprovacao,
        motivo_rejeicao AS motivoRejeicao,
        aprovado_em AS aprovadoEm,
        id_usuario_aprovador AS idUsuarioAprovador,
        id_usuario_criador AS idUsuarioCriador,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM obras_servicos_execucao
      WHERE tenant_id = ? AND id_obra = ?
      ORDER BY atualizado_em DESC, codigo_servico ASC
      `,
      [current.tenantId, idObra]
    );

    return ok(
      (rows as any[]).map((r) => ({
        codigoServico: String(r.codigoServico),
        descricaoServico: r.descricaoServico ? String(r.descricaoServico) : null,
        unidadeMedida: r.unidadeMedida ? String(r.unidadeMedida) : null,
        justificativa: r.justificativa ? String(r.justificativa) : null,
        anexos: parseJsonArray(r.anexosJson).map((x) => String(x)),
        statusAprovacao: r.statusAprovacao ? String(r.statusAprovacao) : 'NAO_APLICAVEL',
        motivoRejeicao: r.motivoRejeicao ? String(r.motivoRejeicao) : null,
        aprovadoEm: r.aprovadoEm ? new Date(r.aprovadoEm).toISOString() : null,
        idUsuarioAprovador: r.idUsuarioAprovador == null ? null : Number(r.idUsuarioAprovador),
        idUsuarioCriador: r.idUsuarioCriador == null ? null : Number(r.idUsuarioCriador),
        criadoEm: r.criadoEm ? new Date(r.criadoEm).toISOString() : null,
        atualizadoEm: r.atualizadoEm ? new Date(r.atualizadoEm).toISOString() : null,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_FISCALIZACAO_VIEW);
    await ensureTables();
    const { id } = await ctx.params;
    const idObra = Number(id || 0);
    if (!idObra) return fail(400, 'ID da obra inválido');

    const body = (await req.json().catch(() => null)) as any;
    const codigoServico = String(body?.codigoServico || '').trim().toUpperCase();
    const acao = String(body?.acao || '').trim().toUpperCase();
    const motivoRejeicao = body?.motivoRejeicao != null ? String(body.motivoRejeicao).trim() : '';
    if (!codigoServico) return fail(400, 'codigoServico é obrigatório');
    if (acao !== 'APROVAR' && acao !== 'REJEITAR') return fail(400, 'acao deve ser APROVAR ou REJEITAR');
    if (acao === 'REJEITAR' && motivoRejeicao.length < 5) return fail(422, 'motivoRejeicao obrigatório (mínimo 5 caracteres).');

    const status = acao === 'APROVAR' ? 'APROVADO' : 'REJEITADO';

    const [result]: any = await db.query(
      `
      UPDATE obras_servicos_execucao
      SET
        status_aprovacao = ?,
        motivo_rejeicao = ?,
        aprovado_em = CURRENT_TIMESTAMP,
        id_usuario_aprovador = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_obra = ? AND codigo_servico = ?
      `,
      [status, status === 'REJEITADO' ? motivoRejeicao : null, current.id, current.tenantId, idObra, codigoServico]
    );
    if (!result?.affectedRows) return fail(404, 'Serviço não previsto não encontrado para a obra');

    await db.query(
      `
      UPDATE engenharia_programacoes_semanais_itens
      SET aprovacao_excecao_status = ?, aprovacao_excecao_motivo = ?
      WHERE tenant_id = ? AND id_programacao IN (
        SELECT id_programacao FROM engenharia_programacoes_semanais WHERE tenant_id = ? AND id_obra = ?
      ) AND codigo_servico = ? AND servico_origem = 'EXECUCAO'
      `,
      [status, status === 'REJEITADO' ? motivoRejeicao : null, current.tenantId, current.tenantId, idObra, codigoServico]
    ).catch(() => null);

    return ok({ codigoServico, statusAprovacao: status, motivoRejeicao: status === 'REJEITADO' ? motivoRejeicao : null });
  } catch (e) {
    return handleApiError(e);
  }
}
