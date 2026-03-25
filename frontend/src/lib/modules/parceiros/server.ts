import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import type { EmpresaParceiraDTO, ParceiroEntregaDocumentoDTO, ParceiroRequisitoDocumentalDTO } from './types';

function iso(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function assertSqlReady(err: unknown): never {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (
    msg.includes('empresas_parceiras') ||
    msg.includes('parceiros_usuarios_vinculos') ||
    msg.includes('parceiros_requisitos_documentais') ||
    msg.includes('parceiros_documentos_entregas') ||
    msg.includes("doesn't exist") ||
    msg.includes('unknown')
  ) {
    throw new ApiError(501, 'Banco sem tabelas do módulo Parceiros. Aplique o SQL desta etapa para habilitar.');
  }
  throw err as any;
}

export async function listarEmpresasParceiras(tenantId: number, q?: string | null, limit?: number): Promise<EmpresaParceiraDTO[]> {
  const max = Math.min(Math.max(Number(limit || 100), 1), 500);
  try {
    const params: any[] = [tenantId];
    let where = `WHERE tenant_id = ?`;
    if (q && q.trim()) {
      where += ` AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)`;
      const s = `%${q}%`;
      params.push(s, s, s);
    }
    const [rows]: any = await db.query(
      `
      SELECT
        id_empresa_parceira AS id,
        razao_social AS razaoSocial,
        nome_fantasia AS nomeFantasia,
        cnpj,
        email_principal AS emailPrincipal,
        telefone_principal AS telefonePrincipal,
        status_empresa AS statusEmpresa
      FROM empresas_parceiras
      ${where}
      ORDER BY atualizado_em DESC
      LIMIT ${max}
      `,
      params
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      razaoSocial: String(r.razaoSocial),
      nomeFantasia: r.nomeFantasia ? String(r.nomeFantasia) : null,
      cnpj: String(r.cnpj),
      emailPrincipal: r.emailPrincipal ? String(r.emailPrincipal) : null,
      telefonePrincipal: r.telefonePrincipal ? String(r.telefonePrincipal) : null,
      statusEmpresa: String(r.statusEmpresa) as any,
    }));
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function criarEmpresaParceira(tenantId: number, body: { razaoSocial: string; nomeFantasia?: string | null; cnpj: string; emailPrincipal?: string | null; telefonePrincipal?: string | null }) {
  const razao = String(body?.razaoSocial || '').trim();
  const cnpj = String(body?.cnpj || '').trim();
  if (!razao) throw new ApiError(422, 'razaoSocial obrigatório');
  if (!cnpj) throw new ApiError(422, 'cnpj obrigatório');
  try {
    const [res]: any = await db.query(
      `
      INSERT INTO empresas_parceiras (tenant_id, razao_social, nome_fantasia, cnpj, email_principal, telefone_principal, status_empresa)
      VALUES (?, ?, ?, ?, ?, ?, 'ATIVA')
      `,
      [tenantId, razao.slice(0, 180), body?.nomeFantasia ? String(body.nomeFantasia).slice(0, 180) : null, cnpj.slice(0, 20), body?.emailPrincipal ?? null, body?.telefonePrincipal ?? null]
    );
    return { id: Number(res.insertId) };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function listarRequisitosDocumentaisParceiro(tenantId: number, args: { empresaParceiraId?: number | null } = {}): Promise<ParceiroRequisitoDocumentalDTO[]> {
  try {
    const params: any[] = [tenantId];
    let where = `WHERE tenant_id = ? AND ativo = 1`;
    if (args.empresaParceiraId) {
      where += ` AND (id_empresa_parceira IS NULL OR id_empresa_parceira = ?)`;
      params.push(Number(args.empresaParceiraId));
    }
    const [rows]: any = await db.query(
      `
      SELECT
        id_parceiro_requisito_documental AS id,
        tipo_destinatario AS tipoDestinatario,
        categoria_documento AS categoriaDocumento,
        titulo_requisito AS tituloRequisito,
        tipo_local AS tipoLocal,
        id_obra AS idObra,
        id_unidade AS idUnidade,
        validade_dias AS validadeDias,
        obrigatorio
      FROM parceiros_requisitos_documentais
      ${where}
      ORDER BY id_parceiro_requisito_documental DESC
      `,
      params
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      tipoDestinatario: String(r.tipoDestinatario) as any,
      categoriaDocumento: String(r.categoriaDocumento),
      tituloRequisito: String(r.tituloRequisito),
      tipoLocal: r.tipoLocal ? (String(r.tipoLocal) as any) : null,
      idObra: r.idObra !== null && r.idObra !== undefined ? Number(r.idObra) : null,
      idUnidade: r.idUnidade !== null && r.idUnidade !== undefined ? Number(r.idUnidade) : null,
      validadeDias: r.validadeDias !== null && r.validadeDias !== undefined ? Number(r.validadeDias) : null,
      obrigatorio: Boolean(r.obrigatorio),
    }));
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function listarEntregasDocumentos(tenantId: number, empresaParceiraId: number): Promise<ParceiroEntregaDocumentoDTO[]> {
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        id_parceiro_documento_entrega AS id,
        id_parceiro_requisito_documental AS idRequisito,
        id_documento_registro AS idDocumentoRegistro,
        id_terceirizado_trabalhador AS idTerceirizadoTrabalhador,
        status_entrega AS statusEntrega,
        data_validade AS dataValidade,
        motivo_rejeicao AS motivoRejeicao,
        enviado_em AS enviadoEm,
        validado_em AS validadoEm
      FROM parceiros_documentos_entregas
      WHERE tenant_id = ? AND id_empresa_parceira = ?
      ORDER BY atualizado_em DESC
      LIMIT 500
      `,
      [tenantId, empresaParceiraId]
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      idRequisito: Number(r.idRequisito),
      idDocumentoRegistro: Number(r.idDocumentoRegistro),
      idTerceirizadoTrabalhador: r.idTerceirizadoTrabalhador !== null && r.idTerceirizadoTrabalhador !== undefined ? Number(r.idTerceirizadoTrabalhador) : null,
      statusEntrega: String(r.statusEntrega) as any,
      dataValidade: r.dataValidade ? iso(r.dataValidade) : null,
      motivoRejeicao: r.motivoRejeicao ? String(r.motivoRejeicao) : null,
      enviadoEm: iso(r.enviadoEm) || new Date().toISOString(),
      validadoEm: iso(r.validadoEm),
    }));
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function validarDocumentoParceiro(tenantId: number, entregaId: number, body: { aprovar: boolean; motivoRejeicao?: string | null; userIdValidador: number }) {
  try {
    const status = body.aprovar ? 'APROVADO' : 'REJEITADO';
    const [res]: any = await db.query(
      `
      UPDATE parceiros_documentos_entregas
      SET status_entrega = ?, motivo_rejeicao = ?, id_usuario_validador = ?, validado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_parceiro_documento_entrega = ?
      `,
      [status, body.aprovar ? null : body.motivoRejeicao ?? null, body.userIdValidador, tenantId, entregaId]
    );
    if (!Number(res.affectedRows || 0)) throw new ApiError(404, 'Entrega não encontrada.');
    return { ok: true };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}
