import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { db } from '@/lib/db';
import { processPushQueue } from '@/lib/notifications/push/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const body = (await req.json().catch(() => null)) as any;
    const titulo = String(body?.titulo || 'Push de teste').slice(0, 180);
    const mensagem = String(body?.mensagem || 'Se você recebeu isso, o push está funcionando.').slice(0, 255);
    const rota = String(body?.rota || '/dashboard/notificacoes').slice(0, 255);

    const [[sub]]: any = await db.query(
      `
      SELECT id_push_dispositivo_assinatura AS id
      FROM push_dispositivos_assinaturas
      WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
      ORDER BY atualizado_em DESC
      LIMIT 1
      `,
      [user.tenantId, user.id]
    );
    if (!sub?.id) return fail(422, 'Nenhum dispositivo com push ativo');

    const dedupe = `u${user.id}.push.teste.${Date.now()}`;
    await db.execute(
      `
      INSERT INTO notificacoes_push_fila
        (tenant_id, id_notificacao_evento, id_usuario_destinatario, id_push_dispositivo_assinatura, titulo, mensagem, rota, payload_json, status_envio, tentativas, proxima_tentativa_em, chave_deduplicacao)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'PENDENTE', 0, NOW(), ?)
      `,
      [
        user.tenantId,
        user.id,
        Number(sub.id),
        titulo,
        mensagem,
        rota,
        JSON.stringify({ title: titulo, body: mensagem, route: rota, module: 'ADMIN' }),
        dedupe,
      ]
    );

    const out = await processPushQueue({ tenantId: user.tenantId, limit: 5 });
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

