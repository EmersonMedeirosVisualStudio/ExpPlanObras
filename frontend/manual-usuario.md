## Manual do Usuário — ExpPlanObras

Este manual explica, de forma simples, como usar o sistema no dia a dia.

---

## 1. Conceito principal: Obra Ativa

O sistema funciona por contexto. Isso significa:

1. Você entra no sistema
2. Seleciona uma obra (vira a sua **Obra Ativa**)
3. O sistema passa a mostrar e filtrar as telas e dados para essa obra

---

## 2. Como selecionar ou trocar a obra

### ETAPA 1 — Onde acessar
- No menu lateral, acesse **Engenharia → Obras → Selecionar Obra**

### ETAPA 2 — O que clicar
- Clique na obra desejada para definir como **Obra Ativa**

### ETAPA 3 — O que esperar
- O sistema passa a operar no modo daquela obra
- Você será direcionado para a página da obra (janelas da obra)

### ETAPA 4 — Como validar
- A URL e o título da página indicam a obra (ex.: **Obra #ID**)
- As telas da obra ativa passam a abrir diretamente para a obra selecionada

Observação:

- Ao entrar em **/dashboard**, se não houver Obra Ativa definida, o sistema direciona automaticamente para a tela de **seleção de obra**.

---

## 2.1 Como cadastrar uma obra (regra: contrato obrigatório)

Para cadastrar uma obra, primeiro você precisa ter um **contrato** cadastrado.

### ETAPA 1 — Onde acessar
- Menu lateral → **Engenharia → Cadastro de Obra**

### ETAPA 2 — O que clicar
- Em **Contrato**, selecione um contrato existente
- Se não existir, preencha **Novo contrato** e clique em **Criar**

### ETAPA 3 — O que preencher
- Nome da obra
- Tipo e Status
- Endereço (Rua, Número, Bairro, Cidade, UF) ou cole um link/CEP quando disponível

### ETAPA 4 — O que esperar
- A obra será criada e aparecerá na lista
- O sistema cria a **planilha mínima** com o serviço `SER-0001` para liberar Programação e Apropriação

### ETAPA 5 — Como validar
- Vá em **Engenharia → Obras → Selecionar Obra** e confirme que a obra nova aparece

---

## 3. Menu da obra (Planejamento e Execução)

Depois que você define a obra ativa, o menu de **Engenharia → Obras** passa a ter atalhos para:

- **Dashboard da Obra**
- **Resumo do Contrato**
- **Documentos da Obra**
- **Eventos / Observações (do contrato)**
- **Planilha orçamentária**
- **Planejamento**
- **Execução**

Isso evita bagunça e garante que você está trabalhando na obra certa.

---

## 3.1 Planilha orçamentária (importar CSV com prévia)

Use esta tela para cadastrar/atualizar o orçamento da obra por versões (itens, subitens e serviços).

### ETAPA 1 — Onde acessar
- Abra **Obra #ID** → clique em **Planilha orçamentária**

### ETAPA 2 — O que clicar
- Clique em **Importar CSV**
- O sistema abre uma **prévia** com uma grade de conferência

### ETAPA 3 — O que preencher
- O CSV deve ter estas colunas (nesta ordem ou com estes nomes):
  - `item`
  - `codigo`
  - `fonte`
  - `servicos`
  - `und`
  - `quant`
  - `valor_unitario`

### ETAPA 4 — O que esperar
- A grade mostra as linhas do CSV antes de gravar
- Campos com erro ficam destacados (ex.: item vazio, serviço sem código, quant inválida)
- O sistema calcula o **valor parcial** automaticamente (quant × valor_unitario)
- Itens e subitens ficam em **negrito** para facilitar leitura
- Você pode ajustar o **tamanho da fonte** e as **cores de fundo** de Item/Subitem (essas preferências ficam salvas no seu usuário)
- A tela mostra o **Valor total** da planilha
- A tela mostra o **valor parcial consolidado** de cada **Item** e **Subitem**
- Na **prévia**, o sistema mostra o **total consolidado** antes de confirmar a importação

### ETAPA 5 — Como validar
- Clique em **Confirmar importação**
- A nova versão aparece na lista de versões e pode ser selecionada

---

## 3.2 SINAPI (Excel) — Importar composições para a obra (com prévia)

Use esta tela quando você precisa trazer a composição de um serviço do SINAPI para a planilha da obra.

### ETAPA 1 — Onde acessar
- Engenharia → Obras → (abra a obra) → **Planilha orçamentária** → **Sinapi**

### ETAPA 2 — O que clicar
- Se o serviço já estiver na lista “Serviços SINAPI importados”, você pode:
  - marcar a caixa de seleção na frente do serviço e clicar em **Aplicar selecionados**, ou
  - clicar no **ícone de seta** (Aplicar na planilha) para aplicar apenas aquele serviço
- Se não estiver, clique em **Importar**

### ETAPA 3 — O que preencher
- Data-base (SINAPI)
- Aba (Relatório Analítico de Composições): normalmente “Analítico”
- UF
- Preços de insumos: ISD / ICD / ISE
- Arquivo XLSX (SINAPI)

### ETAPA 4 — O que esperar
- O topo da tela mostra:
  - **OBRA: id da obra - nome da obra**
  - **CONTRATO: id do contrato - objeto do contrato**
- A trilha (subtítulo) mostra o caminho completo até a tela (inclui o código da composição, e ao abrir Sinapi aparece “→ Sinapi”).
- O topo da tela também mostra:
  - **PLANILHA: id da planilha - versão da planilha**
  - **SINAPI (planilha): data-base e UF** (usados como padrão para filtros/importação)
- Clique em **Configurar tela** para abrir o card **Configuração de tela** (fica oculto por padrão) e ajustar colunas (exibir/ocultar) e larguras (isso fica gravado).
- Se os dados da lista “Serviços SINAPI importados” estiverem filtrados, aparece um aviso **Dados filtrados** com os filtros ativos.
- Quando a planilha tiver **data-base SINAPI** definida, a lista “Serviços SINAPI importados” considera automaticamente essa data-base como filtro (mesmo que você não preencha o campo “Data-base”).
- Use **Limpar filtros** para voltar rapidamente a lista completa.
- A opção **Ao aplicar na obra: substituir existente (padrão)** vem marcada (substitui quando já existir).
- Dê **duplo clique** em um serviço na lista “Serviços SINAPI importados” para abrir o card **Composição do serviço** com o detalhamento dos itens.
- Ao clicar em **Prévia**, o sistema abre um modal “Prévia” com:
  - tabela “Serviços na prévia” (com status “Já importado” quando for o caso)
  - ao clicar em um serviço, a tabela “Itens da prévia” mostra a composição do serviço selecionado
  - as colunas incluem **Tipo Item (SINAPI)** e **Tipo (sistema)** (ex.: INSUMO → MATERIAL / MAO DE OBRA / EQUIPAMENTO (AQUISIÇÃO) / EQUIPAMENTO (LOCAÇÃO) / SERVIÇOS / ESPECIAIS; COMPOSIÇÃO → COMPOSIÇÃO)
  - a coluna **Sel** permite selecionar vários serviços para importar em lote

### ETAPA 5 — Como validar
- (Prévia) Marque um ou mais serviços na tabela “Serviços na prévia” (coluna **Sel**) e clique em **Importar selecionados**
- (Aplicar) Na lista “Serviços SINAPI importados”, marque um ou mais serviços e clique em **Aplicar selecionados**
- Confirme:
  - que os serviços aparecem/atualizam na lista “Serviços SINAPI importados”
  - que a mensagem de “Aplicado na obra” aparece após aplicar

## 3.3 Análise de composição — Nova composição e composição auxiliar

### ETAPA 1 — Onde acessar
- Engenharia → Obras → (abra a obra) → Planilha orçamentária → Serviços → Análise de composição

### ETAPA 2 — O que clicar
- No card **Itens (composição)**, use os botões:
  - **Importar do SINAPI**
  - **Nova composição**
  - **Importar CSV**
- Informe o código da nova composição e confirme

### ETAPA 3 — O que preencher
- Na nova composição, preencha os itens normalmente (tipo, código, descrição, unidade, quantidade e valor unitário)
- Para item do tipo **Composição** ou **Composição Auxiliar**, informe o código da composição de referência
  - Para CSV, use separador decimal **vírgula** (ex.: `1.234,567` na quantidade; `12,34` no valor)

### ETAPA 4 — O que esperar
- A tabela aceita qualquer código de composição informado por você
- Se o código de composição de referência existir em outra composição da mesma planilha, o sistema procura o valor e grava esse valor unitário no item de referência
- Depois de encontrado, o valor fica fixado no item salvo da composição
- Os itens ficam separados em 2 blocos: **Composições** e **Insumos**. No bloco **Insumos**, o campo **Tipo** mostra a classificação e existe um filtro rápido por tipo.
- No grid da composição:
  - **Qtd** aparece com separador de milhar e **3** casas decimais
  - **Total** aparece com separador de milhar e **2** casas decimais

### ETAPA 5 — Como validar
- Salve a composição
- Reabra a mesma análise e confirme que os valores unitários das linhas de composição auxiliar/composição continuam preenchidos
- Abra a composição pai e confirme que o total foi recalculado com o valor fixado da composição referenciada

## 3.3.1 Como as composições da planilha são cadastradas

### ETAPA 1 — O que significa “cadastrar composição”
- A planilha (o orçamento) tem uma lista de **Serviços**.
- Além disso, o sistema mantém uma lista de **Composições cadastradas** para a obra (inclusive composições auxiliares), que podem existir mesmo quando não são um “Serviço” da planilha.

### ETAPA 2 — Como cadastrar (3 formas)
- Pelo SINAPI: na tela **Sinapi**, aplique uma composição (ícone de seta).
- Pela Análise: abra a **Análise de composição** e salve os itens.
- Por CSV: na Análise, use **Importar CSV** e depois **Salvar**.

### ETAPA 3 — O que esperar
- Uma composição passa a existir no sistema quando ela tem itens salvos (ela fica registrada para a obra).
- Se uma composição não estiver na lista de Serviços da planilha, ainda assim ela pode ser aplicada se ela for parte de outra composição da planilha (1º, 2º, 3º… grau).

### ETAPA 4 — Como validar
- Abra a composição “pai” (a que tem o item de composição auxiliar) e confira se o código aparece na tabela como item do tipo composição.
- Aplique a composição “filha” no SINAPI e volte para a composição “pai” para conferir se o valor foi preenchido e ficou fixo.

## 3.4 SINAPI — mesma composição em UF diferente (AC, SP) e ISD/ICD/ISE

### ETAPA 1 — Onde acessar
- Engenharia → Obras → Planilha orçamentária → Sinapi

### ETAPA 2 — O que selecionar
- Selecione a **UF** (ex.: AC ou SP)
- Selecione o modo de preço de insumo (**ISD**, **ICD** ou **ISE**)

### ETAPA 3 — O que acontece no sistema
- A estrutura da composição (coeficientes e itens) é a mesma quando o código da composição é o mesmo
- O que muda entre AC/SP e ISD/ICD/ISE é principalmente o preço dos insumos
- O sistema mantém base por combinação de **data-base + UF + tipo de preço**

### ETAPA 4 — O que fazer quando mudar AC para SP
- Faça nova importação na tela Sinapi com a UF SP e o modo desejado (ISD/ICD/ISE)
- O sistema atualiza/regrava os dados da base interna para essa combinação
- Depois aplique a composição na planilha

### ETAPA 5 — Como validar
- No card “Serviços SINAPI importados”, confirme UF e tipo de preço da linha importada
- Abra a composição (duplo clique) e confira se os valores unitários dos insumos refletem a UF/tipo escolhidos
- Aplique na planilha e confirme o valor atualizado na análise

## 4. Contrato da obra (ver detalhes)

O contrato é uma informação associada à obra. Para ver:

### ETAPA 1 — Onde acessar
- Abra **Obra #ID** (janelas da obra)

### ETAPA 2 — O que clicar
- No bloco **Dados principais da obra**, clique em **Abrir contrato**

### ETAPA 3 — O que esperar
- Você verá:
  - Número do contrato
  - Status
  - Valores (contratado, executado, pago e saldo)

### ETAPA 4 — Como validar
- Confirme se o número do contrato exibido confere com o contrato principal da obra

---

## 4.2 Eventos / Observações do contrato (a partir da obra)

Use quando você está “dentro” de uma obra e quer registrar/consultar histórico do contrato sem precisar procurar o contrato na lista.

### ETAPA 1 — Onde acessar
- Abra **Obra #ID** (janelas da obra)

### ETAPA 2 — O que clicar
- Na seção **Cadastro**, clique em **Eventos / Observações**

### ETAPA 3 — O que esperar
- Abre a aba **Eventos / Observações** do contrato vinculado à obra
- Você consegue registrar observações e anexar evidências (PDF/imagem)

### ETAPA 4 — Como validar
- Salve uma observação e confira se ela aparece na linha do tempo

## 4.1 Documentos (Obra e Contrato)

Você pode gerenciar documentos tanto da **Obra** quanto do **Contrato** na mesma tela.

### ETAPA 1 — Onde acessar
- Para **Obra**: no menu lateral, acesse **Engenharia → Obras → Documentos**
- Para **Contrato**: abra o contrato e clique em **Documentos do contrato**

### ETAPA 2 — O que clicar
- Use o seletor **Obra / Contrato** quando você não entrou por um item específico
- No campo de ID, digite parte do texto para filtrar a lista (ex.: `#1`, nome da obra ou número do contrato)

### ETAPA 3 — O que preencher
- Para criar um documento:
  - Categoria
  - Título
  - (Opcional) Descrição
  - (Opcional) Arquivo (PDF/imagem)

### ETAPA 4 — O que esperar
- Se você entrou por uma obra/contrato específico, o contexto fica travado para evitar anexar no lugar errado
- O topo da tela mostra o caminho (breadcrumb) e existe botão **Voltar**

### ETAPA 5 — Como validar
- Na seção “Documentos cadastrados”, filtre por **Categoria prefixo** (Todos / Contrato / Obra) e confirme que os documentos aparecem

## 5. Responsável técnico e fiscal (por obra)

Esses dados são cadastrados por obra e aparecem nos dados principais.

### ETAPA 1 — Onde acessar
- Abra **Obra #ID**

### ETAPA 2 — O que clicar
- Se faltar cadastro, clique em **Cadastrar agora**

### ETAPA 3 — O que preencher
- Tipo: **Responsável Técnico** ou **Fiscal da Obra**
- Nome, registro (CREA/CAU) e contato

### ETAPA 4 — Como validar
- Volte para **Obra #ID** e confira se aparece no bloco “Dados principais da obra”

---

## 6. Dica de segurança (evite erros)

Antes de lançar diário, medição ou apropriação:
- Confirme se você selecionou a obra correta em **Engenharia → Obras → Selecionar Obra**.

Isso evita lançar dados na obra errada.

---

## 7. Suprimentos (como navegar)

O sistema separa suprimentos em contextos diferentes para evitar mistura de processos:

- **Suprimentos (Central)**: compras, parâmetros, fornecedores, monitoramento.
- **Suprimentos (Obra)**: solicitações, recebimento, transferências e apropriação.
- **Unidades de Estoque**: apoio logístico e armazenagem.
- **Unidades de Venda**: PDV e histórico de vendas.

### ETAPA 1 — Onde acessar
- Menu lateral → **Suprimentos**
- Para obra ativa: **Engenharia → Obras → Execução → Suprimentos (Obra)**

### ETAPA 2 — O que clicar
- Use **Dashboard** para ver KPIs e alertas
- Use **Solicitações** para pedir material
- Use **Recebimento/Transferências** para movimentar estoque

### ETAPA 3 — O que esperar
- O painel mostra indicadores de estoque, compras e consumo
- Cada contexto mostra apenas as ações permitidas para aquele tipo de operação

### ETAPA 4 — Como validar
- Crie uma solicitação e acompanhe o status
- Verifique se o saldo atualiza após recebimento
- Em obra, valide se a apropriação aceita apenas serviços válidos da planilha

---

## 8. Contratos (Engenharia) — como consultar e criar

Os contratos concentram as informações oficiais de prazo e valores.

### ETAPA 1 — Onde acessar
- Menu lateral → **Contratos (Engenharia) → Contratos → Lista**

### ETAPA 2 — O que clicar
- Clique em um contrato para ver o detalhe
- Para criar: **Contratos (Engenharia) → Contratos → Novo contrato**

### ETAPA 3 — O que esperar
- A lista mostra **ALERTA** (OK/Pendente/Crítico) e **STATUS** (Em andamento / A vencer / Vencido / etc.)
- No detalhe, você verá datas e valores do contrato (e botões de ação, como **Aditivos**)
- Em **Editar contrato**, existe botão **Voltar** e um subtítulo no topo que mostra o caminho real (breadcrumb)
- Em **Editar contrato**, ao preencher **Prazo** o sistema calcula a **Vigência (fim)**; ao preencher a **Vigência (fim)** o sistema calcula o **Prazo**; ao trocar a unidade (dias/semanas/meses/anos) o prazo é convertido automaticamente.

### ETAPA 4 — Como validar
- Volte para a lista e confirme se o contrato aparece e se o status/alerta fazem sentido

---

## 9. Aditivos do contrato — como atualizar prazo/valor

O aditivo é o histórico de mudanças. O contrato “vigente” é sempre o consolidado.

### ETAPA 1 — Onde acessar
- Menu lateral → **Contratos (Engenharia) → Contratos → Aditivos (selecionar contrato)**

### ETAPA 2 — O que clicar
- Primeiro selecione o contrato
- No topo da tela (à direita do título), clique em **Aditivos**
- Dentro de **Aditivos**, clique em **Novo aditivo**

### ETAPA 3 — O que preencher
- Em **Novo aditivo**, preencha o que mudou (ex.: dias adicionados, **valor total após o aditivo**, motivo/observação do aditivo)
- Salve como **rascunho**
- Quando estiver certo, clique em **aprovar**

### ETAPA 4 — O que esperar
- Ao aprovar, o sistema atualiza automaticamente o contrato (vigência atual e valores atuais)
- Se existir aditivo em rascunho, o contrato pode ficar com pendência “Aditivo em aberto” na coluna **ALERTA**

### ETAPA 5 — Como validar
- Volte em **Contratos (Engenharia) → Contratos → Lista** e confira se o contrato mudou (datas/valores e alerta/status)

---

## 10. Histórico (Eventos / Observações) + Anexos (PDF/imagem)

Use esta área para registrar justificativas do dia a dia e guardar evidências (PDFs e imagens) dentro do sistema.

### ETAPA 1 — Onde acessar
- Menu lateral → **Contratos (Engenharia) → Contratos → Aditivos (selecionar contrato)**
- Selecione o contrato e, no topo da tela (à direita do título), clique em **Eventos**

### ETAPA 2 — O que clicar
- Use os filtros (Contrato/Aditivos/Obras/Documentos/Observações) para “enxergar só o que interessa”
- Em **Adicionar observação**, selecione o nível (Normal/Alerta/Crítico)

### ETAPA 3 — O que preencher
- Digite sua observação
- Se quiser, selecione um ou mais arquivos (PDF/imagem)
- Clique em **Salvar**

### ETAPA 4 — O que esperar
- A observação aparece na **Linha do tempo**
- Os anexos aparecem como links (📎) e você consegue abrir/baixar
- Para arquivos selecionados antes de salvar, você pode clicar em **Preview** para ver PDF/imagem dentro do sistema

### ETAPA 5 — Como validar
- Reabra a aba **Eventos / Observações** e confirme se a observação e os anexos continuam listados
