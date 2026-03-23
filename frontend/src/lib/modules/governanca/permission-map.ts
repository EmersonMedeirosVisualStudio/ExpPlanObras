export function parsePermissionCode(code: string) {
  const parts = code.split('.');
  if (parts.length < 3) {
    return { modulo: 'geral', janela: code, acao: 'view' };
  }
  const acao = parts[parts.length - 1];
  const janela = parts[parts.length - 2];
  const modulo = parts.slice(0, parts.length - 2).join('.');
  return { modulo, janela, acao };
}

export function stringifyPermission(p: { modulo: string; janela: string; acao: string }) {
  return `${p.modulo}.${p.janela}.${p.acao}`;
}
