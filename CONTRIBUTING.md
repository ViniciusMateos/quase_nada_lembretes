# Contributing - Quase Nada Lembretes

## Branches
| Tipo | Formato | Exemplo |
|---|---|---|
| Feature | `feature/<descricao>` | `feature/theme-toggle` |
| Fix | `fix/<descricao>` | `fix/timezone-reminders` |
| Release | `release/vX.Y.Z` | `release/v0.3.0` |
| Hotfix | `hotfix/<descricao>` | `hotfix/login-error` |

## Conventional Commits
- `feat:` nova funcionalidade
- `fix:` correcao de bug
- `docs:` mudanca em documentacao
- `test:` testes
- `refactor:` refatoracao sem alterar comportamento
- `chore:` tarefas de manutencao

Exemplos:
```text
feat: add account screen and password update flow
fix: parse reminder timestamp with client timezone
docs: update deployment and rollback guide
```

## Checklist de PR
- [ ] `pytest tests/ -v` passou
- [ ] lint sem erros
- [ ] sem segredo hardcoded
- [ ] changelog atualizado
- [ ] API docs atualizadas quando endpoint mudar
- [ ] README atualizado quando fluxo de release/deploy mudar
- [ ] Para release com dependência nativa no app iOS, plano de `eas build` descrito no PR

## Processo de review
1. Abrir PR com contexto claro.
2. Aguardar CI verde.
3. Resolver comentarios de review.
4. Merge via squash.
