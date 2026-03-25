type Condition =
  | { field: string; operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not_in' | 'contains' | 'is_true' | 'is_false' | 'is_null' | 'not_null'; value?: any }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

function getByPath(obj: any, path: string): any {
  const parts = String(path || '').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function isEmptyCondition(c: any): boolean {
  if (!c) return true;
  if (typeof c !== 'object') return true;
  return false;
}

export function evaluateCondition(cond: unknown, ctx: Record<string, unknown>): boolean {
  if (isEmptyCondition(cond)) return true;
  const c = cond as Condition;

  if ('all' in c && Array.isArray((c as any).all)) return (c as any).all.every((x: any) => evaluateCondition(x, ctx));
  if ('any' in c && Array.isArray((c as any).any)) return (c as any).any.some((x: any) => evaluateCondition(x, ctx));
  if ('not' in c) return !evaluateCondition((c as any).not, ctx);

  const field = String((c as any).field || '');
  const op = String((c as any).operator || '');
  const left = getByPath(ctx, field);
  const right = (c as any).value;

  if (op === '=') return left === right;
  if (op === '!=') return left !== right;
  if (op === '>') return Number(left) > Number(right);
  if (op === '>=') return Number(left) >= Number(right);
  if (op === '<') return Number(left) < Number(right);
  if (op === '<=') return Number(left) <= Number(right);
  if (op === 'in') return Array.isArray(right) ? right.includes(left) : false;
  if (op === 'not_in') return Array.isArray(right) ? !right.includes(left) : false;
  if (op === 'contains') return typeof left === 'string' ? left.includes(String(right ?? '')) : Array.isArray(left) ? left.includes(right) : false;
  if (op === 'is_true') return left === true || left === 1 || left === '1' || left === 'true';
  if (op === 'is_false') return left === false || left === 0 || left === '0' || left === 'false';
  if (op === 'is_null') return left === null || left === undefined;
  if (op === 'not_null') return left !== null && left !== undefined;

  return false;
}

