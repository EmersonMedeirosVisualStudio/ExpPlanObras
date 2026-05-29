---
name: gitflow-skill
description: >
  Use esta skill para operações git no expertObras: GitFlow completo com branches
  feature/release/hotfix, commits semânticos, verificações obrigatórias pré-commit
  (tsc + vitest + build), regras de push, tags de release e proteção de main/develop.
  Aplicável a todo trabalho no monorepo (backend + frontend).
---

# GitFlow Skill — expertObras
## Monorepo: backend (Fastify) + frontend (Next.js)

---

## Branches permanentes

| Branch    | Propósito                                          |
|-----------|----------------------------------------------------|
| `main`    | Código em produção. **Nunca commitar diretamente** |
| `develop` | Integração de features prontas. Base de todo trabalho |

---

## Fluxo de Feature (mais comum)

```
develop → feature/<nome> → PR → develop
```

```bash
# 1. Partir de develop atualizado
git checkout develop
git pull origin develop
git checkout -b feature/<nome-em-kebab-case>

# 2. Desenvolver com commits atômicos semânticos
git add <arquivos-específicos>
git commit -m "feat(contratos): add contract expiry alert calculation"

# 3. Antes de qualquer commit — VERIFICAÇÕES OBRIGATÓRIAS (ver seção abaixo)

# 4. Merge em develop (via PR ou local)
git checkout develop
git pull origin develop
git merge --no-ff feature/<nome>
git push origin develop
git branch -d feature/<nome>
```

---

## Fluxo de Release

```
develop → release/<versão> → main + develop
```

```bash
git checkout develop && git pull origin develop
git checkout -b release/<versão>    # ex: release/2.1.0

# Ajustes finais: só bugfixes, bump de versão, changelog
git commit -m "chore(release): bump version to <versão>"

# Merge em main + tag
git checkout main && git pull origin main
git merge --no-ff release/<versão>
git tag -a v<versão> -m "Release v<versão>"
git push origin main --tags

# Back-merge em develop (obrigatório)
git checkout develop
git merge --no-ff release/<versão>
git push origin develop
git branch -d release/<versão>
```

---

## Fluxo de Hotfix (bug crítico em produção)

```
main → hotfix/<descricao> → main + develop
```

```bash
git checkout main && git pull origin main
git checkout -b hotfix/<descricao-curta>

# Corrigir + testar
git commit -m "fix(auth): return 401 for expired JWT instead of 500"

# Merge em main + tag de patch
git checkout main
git merge --no-ff hotfix/<descricao-curta>
git tag -a v<versão-patch> -m "Hotfix v<versão-patch>"
git push origin main --tags

# Back-merge em develop
git checkout develop
git merge --no-ff hotfix/<descricao-curta>
git push origin develop
git branch -d hotfix/<descricao-curta>
```

---

## ⚠️ Verificações OBRIGATÓRIAS antes de qualquer commit

Executar **nesta ordem**. Falha em qualquer etapa = **não commitar**.

### 1. TypeScript — backend + frontend

```bash
cd backend && npm run typecheck    # npx tsc --noEmit
cd ../frontend && npm run typecheck
```

Nenhum erro tolerado. Nunca usar `// @ts-ignore` como atalho.

### 2. Testes — backend

```bash
cd backend && npm run test    # vitest run
```

Todo novo use-case e função de domínio deve ter teste. Criar no mesmo commit se novo.

### 3. Build — backend + frontend

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

Build deve passar sem erros (warnings aceitáveis).

### 4. Revisar diff antes de commitar

```bash
git diff --staged          # revisar o que será commitado
git status                 # confirmar arquivos
```

Verificar: nenhum `.env`, segredo, `console.log` de debug ou `any` acidental.

---

## Commits semânticos (Conventional Commits)

### Formato

```
<tipo>(<escopo>): <descrição no imperativo, inglês, sem ponto final>

[corpo: explica o POR QUÊ — opcional]

[footer: BREAKING CHANGE ou closes #xxx — opcional]
```

### Tipos

| Tipo       | Quando usar                                            |
|------------|--------------------------------------------------------|
| `feat`     | Nova funcionalidade                                    |
| `fix`      | Correção de bug                                        |
| `test`     | Adiciona ou corrige testes                             |
| `refactor` | Refatoração sem mudança de comportamento               |
| `chore`    | Dependências, build, configuração, scripts             |
| `docs`     | Documentação, README, comentários                      |
| `perf`     | Melhoria de performance                                |
| `ci`       | CI/CD, workflows                                       |
| `style`    | Formatação pura (sem lógica alterada)                  |

### Escopos recomendados para expertObras

```
backend, frontend, contratos, obras, rh, engenharia, auth, billing,
prisma, infra, ci, deps
```

### Exemplos corretos

```
feat(contratos): add contract expiry alert calculation
fix(auth): return 401 for missing JWT instead of 500
test(contratos): add unit tests for CreateContractUseCase
refactor(obras): extract address validation to domain entity
chore(deps): upgrade fastify to 5.9.0
feat(frontend): add contract filter by status in querystring
```

---

## Nomeação de branches

| Tipo       | Padrão                              | Exemplo                                |
|------------|-------------------------------------|----------------------------------------|
| Feature    | `feature/<descrição-kebab>`         | `feature/contract-expiry-alerts`       |
| Bugfix     | `fix/<descrição-kebab>`             | `fix/auth-401-on-missing-token`        |
| Hotfix     | `hotfix/<descrição-kebab>`          | `hotfix/billing-null-pointer`          |
| Release    | `release/<versão-semver>`           | `release/2.1.0`                        |
| Chore      | `chore/<descrição-kebab>`           | `chore/upgrade-prisma-6`               |

---

## Regras absolutas

```
❌ Nunca commitar diretamente em main ou develop
❌ Nunca usar git add . ou git add -A — adicionar arquivos específicos
❌ Nunca commitar .env, .env.local, segredos, credenciais
❌ Nunca --no-verify para pular hooks
❌ Nunca --force em main ou develop
✅ Sempre merge --no-ff para preservar histórico de branches
✅ Sempre tag em releases (SemVer: v1.2.3) e hotfixes
✅ Sempre back-merge develop após release ou hotfix
✅ Commits atômicos: uma mudança coesa por commit
```

---

## Script de instalação do pre-commit hook

```bash
# Executar uma vez no clone do repositório
cp scripts/pre-commit-check.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

O hook roda automaticamente `tsc + vitest + build` em todo `git commit`.

---

## Quick reference — comandos mais usados

```bash
# Iniciar feature
git checkout develop && git pull origin develop
git checkout -b feature/minha-feature

# Commitar (após verificações)
git add src/modules/contratos/application/use-cases/CreateContract.ts
git commit -m "feat(contratos): add contract creation use case"

# Sincronizar com develop durante desenvolvimento
git fetch origin
git rebase origin/develop    # ou merge --no-ff dependendo da política

# Finalizar feature
git checkout develop && git pull origin develop
git merge --no-ff feature/minha-feature
git push origin develop
git branch -d feature/minha-feature
```
