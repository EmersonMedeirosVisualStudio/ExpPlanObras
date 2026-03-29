export function materiaisModeloCsv() {
  return [
    'codigo,descricao,unidade,grupo,categoria,preco_unitario,estoque_minimo,ativo',
    'MAT-0001,Cimento CP II 50kg,SC,INSUMOS,CIMENTO,42.50,100,1',
    'MAT-0002,Areia média,m3,INSUMOS,AGREGADOS,135.00,20,1',
    '',
  ].join('\n');
}

export function servicosModeloCsv() {
  return [
    'codigo,descricao,unidade,grupo,preco_unitario,ativo',
    'SER-0001,Alvenaria de vedação,m2,ALVENARIA,89.90,1',
    'SER-0002,Chapisco,m2,REVESTIMENTO,12.50,1',
    '',
  ].join('\n');
}

export function composicoesModeloCsv() {
  return ['codigo,descricao,unidade,bdi,ativo', 'COMP-0001,Alvenaria de vedação 14cm,m2,0.25,1', 'COMP-0002,Chapisco interno,m2,0.20,1', ''].join('\n');
}

export function composicoesItensModeloCsv() {
  return [
    'codigo_composicao,tipo_item,codigo_item,quantidade,perda_percentual',
    'COMP-0001,MATERIAL,MAT-0001,0.120,5',
    'COMP-0001,SERVICO,SER-0001,1.000,0',
    'COMP-0002,SERVICO,SER-0002,1.000,0',
    '',
  ].join('\n');
}

