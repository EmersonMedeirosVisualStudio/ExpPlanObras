import type { ActionContext, PolicyConditionNode, ResourceContext, SubjectContext } from './types';

function getPath(obj: any, path: string): unknown {
  const parts = String(path || '').split('.').filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function resolveValue(args: { subject: SubjectContext; resource: ResourceContext; context: ActionContext; v: unknown }): unknown {
  if (typeof args.v === 'string') {
    const s = args.v.trim();
    if (s.startsWith('subject.')) return getPath(args.subject, s.slice('subject.'.length));
    if (s.startsWith('resource.')) return getPath(args.resource, s.slice('resource.'.length));
    if (s.startsWith('context.')) return getPath(args.context, s.slice('context.'.length));
  }
  return args.v;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function eq(a: unknown, b: unknown) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

function compare(op: '>' | '>=' | '<' | '<=', left: unknown, right: unknown): boolean {
  const ln = asNumber(left);
  const rn = asNumber(right);
  if (ln !== null && rn !== null) {
    if (op === '>') return ln > rn;
    if (op === '>=') return ln >= rn;
    if (op === '<') return ln < rn;
    return ln <= rn;
  }
  const ls = left ? String(left) : '';
  const rs = right ? String(right) : '';
  if (!ls || !rs) return false;
  if (op === '>') return ls > rs;
  if (op === '>=') return ls >= rs;
  if (op === '<') return ls < rs;
  return ls <= rs;
}

export function evaluateCondition(
  node: PolicyConditionNode,
  args: { subject: SubjectContext; resource: ResourceContext; context: ActionContext }
): boolean {
  if (!node) return false;
  const anyNode: any = node as any;

  if (Array.isArray(anyNode.all)) return anyNode.all.every((n: any) => evaluateCondition(n, args));
  if (Array.isArray(anyNode.any)) return anyNode.any.some((n: any) => evaluateCondition(n, args));

  const leftRaw = String(anyNode.left || '');
  const op = String(anyNode.op || '');
  const left = resolveValue({ ...args, v: leftRaw });
  const right = resolveValue({ ...args, v: anyNode.right });

  if (op === '=') return eq(left, right);
  if (op === '!=') return !eq(left, right);
  if (op === '>' || op === '>=' || op === '<' || op === '<=') return compare(op as any, left, right);
  if (op === 'in') return asArray(right).some((r) => eq(left, r));
  if (op === 'not_in') return !asArray(right).some((r) => eq(left, r));
  if (op === 'contains') return asArray(left).some((r) => eq(r, right));
  if (op === 'intersects') {
    const la = asArray(left);
    const ra = asArray(right);
    return la.some((x) => ra.some((y) => eq(x, y)));
  }
  if (op === 'is_true') return Boolean(left) === true;
  if (op === 'is_false') return Boolean(left) === false;
  if (op === 'is_null') return left === null || left === undefined;
  if (op === 'not_null') return left !== null && left !== undefined;
  return false;
}

