# Trunk-based 分支与发布

Sylis 使用 protected `main` 作为唯一长期集成分支，不维护 `develop` 或
`release/*`。代码合并、staging 部署和 production release 是三个不同动作。

## 分支规则

- 从最新 `main` 创建短期 `feature/*`、`fix/*`、`docs/*` 或 `chore/*` 分支。
- 所有变更通过 Pull Request 合入 `main`，禁止直接 push。
- PR 必须通过 required CI、review 和 branch policy；分支落后时先同步 `main`。
- 合并后删除短期分支，避免形成第二条长期集成线。

```bash
git switch main
git pull --ff-only upstream main
git switch -c feature/typed-notebooks

# 完成修改和本地验证后
git push -u origin feature/typed-notebooks
# 创建 feature/typed-notebooks -> main 的 Pull Request
```

## Staging

每个 green `main` commit 只构建一次十二个应用镜像。CI 先用这批镜像完成 E2E，
再推送不可变 GHCR digest 并自动部署 staging。Railway 不从 Git source 重建，也不因
应用部署自动运行付费模型、词典构建或词典 activation。

## Production

production 不是另一个分支。维护者检查 staging evidence 后，手工启动 protected
release workflow，输入已经验证的 `main` commit 和版本（从 `v0.0.1` 开始）。workflow
创建 immutable tag/release，并将 staging 验证过的同一组 digest 提升到 production。
任何服务都不能在 promotion 时重新 build。

## 修复与回滚

普通和紧急修复都从 `main` 建短期 `fix/*` 分支并通过 required CI。运行时紧急情况先
用受保护的 release rollback 把十二个服务恢复到上一份 manifest，再提交修复；不要
绕过 CI 直接修改 Railway image source。

## 提交与合并

提交和 PR 标题使用 Conventional Commits，例如：

```text
feat(agent): add typed proposal approval
fix(database): preserve job fencing ownership
docs(delivery): document immutable promotion
```

合并策略以 GitHub branch protection 为准。无论使用 squash 还是 merge commit，最终
`main` commit 必须能唯一关联 required checks、image manifest、staging evidence 和
production release。
