type Segment = { key: string; wildcard: boolean };

function parsePattern(pattern: string): Segment[] {
  const parts = String(pattern || '').split('.').filter(Boolean);
  return parts.map((p) => {
    const m = p.match(/^(.*)\[\*\]$/);
    if (m) return { key: m[1], wildcard: true };
    return { key: p, wildcard: false };
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function visitRec(
  current: unknown,
  segments: Segment[],
  idx: number,
  cb: (parent: unknown, key: string | number, value: unknown, fullPath: string) => void,
  pathParts: Array<string>
) {
  if (idx >= segments.length) return;
  const seg = segments[idx];

  if (!isObject(current)) return;
  const container = current as Record<string, unknown>;
  const next = container[seg.key];
  if (seg.wildcard) {
    if (!Array.isArray(next)) return;
    for (let i = 0; i < next.length; i++) {
      const pp = [...pathParts, `${seg.key}[${i}]`];
      if (idx === segments.length - 1) {
        cb(next, i, next[i], pp.join('.'));
      } else {
        visitRec(next[i], segments, idx + 1, cb, pp);
      }
    }
    return;
  }

  const pp = [...pathParts, seg.key];
  if (idx === segments.length - 1) {
    cb(container, seg.key, next, pp.join('.'));
    return;
  }

  visitRec(next, segments, idx + 1, cb, pp);
}

export function visitByPattern(
  root: unknown,
  pattern: string,
  cb: (parent: unknown, key: string | number, value: unknown, concretePath: string) => void
) {
  const segments = parsePattern(pattern);
  if (segments.length === 0) return;
  visitRec(root, segments, 0, cb, []);
}

export function setAt(parent: unknown, key: string | number, value: unknown) {
  if (Array.isArray(parent) && typeof key === 'number') {
    parent[key] = value;
    return;
  }
  if (parent && typeof parent === 'object' && !Array.isArray(parent) && typeof key === 'string') {
    (parent as any)[key] = value;
  }
}

export function deleteAt(parent: unknown, key: string | number) {
  if (Array.isArray(parent) && typeof key === 'number') {
    parent[key] = null;
    return;
  }
  if (parent && typeof parent === 'object' && !Array.isArray(parent) && typeof key === 'string') {
    delete (parent as any)[key];
  }
}

