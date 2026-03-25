import { db } from '@/lib/db';

export async function auditPolicyDecision(args: {
  tenantId: number;
  userId: number;
  recurso: string;
  acao: string;
  entidadeId?: number | null;
  resultado: 'ALLOW' | 'DENY';
  motivoCodigo?: string | null;
  policyId?: number | null;
  ruleId?: number | null;
  latenciaMs?: number | null;
  contexto?: unknown | null;
}) {
  try {
    await db.query(
      `
      INSERT INTO seguranca_decisoes_auditoria
        (tenant_id, id_usuario, recurso, acao, entidade_id, resultado, motivo_codigo, id_politica, id_regra, latencia_ms, contexto_json)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        args.tenantId,
        args.userId,
        String(args.recurso),
        String(args.acao),
        args.entidadeId ?? null,
        args.resultado,
        args.motivoCodigo ?? null,
        args.policyId ?? null,
        args.ruleId ?? null,
        args.latenciaMs ?? null,
        args.contexto ? JSON.stringify(args.contexto) : null,
      ]
    );
  } catch {}
}

