import { randomUUID } from 'crypto';

const cats = new Set([
  'AUTH',
  'AUTHZ',
  'SECURITY',
  'DADOS_SENSIVEIS',
  'EXPORTACAO',
  'DOCUMENTOS',
  'WORKFLOW',
  'APROVACAO',
  'NOTIFICACAO',
  'INTEGRACAO',
  'JOB',
  'API',
  'SISTEMA',
  'PWA_SYNC',
  'PORTAL_EXTERNO',
]);
const sevs = new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']);
const results = new Set(['SUCESSO', 'FALHA', 'NEGADO', 'PARCIAL', 'TIMEOUT']);
const origemTipos = new Set(['WEB', 'API', 'JOB', 'WORKER', 'WEBHOOK', 'INTERNAL', 'MOBILE', 'PORTAL_PARCEIRO']);

export function normalizeEvent(input: any) {
  const categoria = String(input.categoria || '').toUpperCase();
  const severidade = String(input.severidade || 'INFO').toUpperCase();
  const resultado = String(input.resultado || 'SUCESSO').toUpperCase();
  const origemTipo = String(input.origemTipo || 'INTERNAL').toUpperCase();
  return {
    eventId: String(input.eventId || randomUUID()),
    categoria: cats.has(categoria) ? categoria : 'SISTEMA',
    subcategoria: input.subcategoria ?? null,
    nomeEvento: String(input.nomeEvento || 'event.unknown'),
    severidade: sevs.has(severidade) ? severidade : 'INFO',
    resultado: results.has(resultado) ? resultado : 'SUCESSO',
    origemTipo: origemTipos.has(origemTipo) ? origemTipo : 'INTERNAL',
    origemChave: input.origemChave ?? null,
    modulo: input.modulo ?? null,
    entidadeTipo: input.entidadeTipo ?? null,
    entidadeId: typeof input.entidadeId === 'number' ? input.entidadeId : null,
    actorTipo: input.actorTipo ?? null,
    actorUserId: typeof input.actorUserId === 'number' ? input.actorUserId : null,
    actorEmail: input.actorEmail ?? null,
    targetTipo: input.targetTipo ?? null,
    targetId: typeof input.targetId === 'number' ? input.targetId : null,
    requestId: input.requestId ?? null,
    correlationId: input.correlationId ?? null,
    sessionId: input.sessionId ?? null,
    traceId: input.traceId ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    rota: input.rota ?? null,
    metodoHttp: input.metodoHttp ?? null,
    statusHttp: typeof input.statusHttp === 'number' ? input.statusHttp : null,
    labelsJson: input.labelsJson ?? null,
    ocorridoEm: input.ocorridoEm ? new Date(input.ocorridoEm) : new Date(),
  };
}
