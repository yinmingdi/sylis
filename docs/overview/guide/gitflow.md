# GitFlow 工作流指南

## 分支策略

我们采用 GitFlow 工作流来管理代码版本和发布流程。

### 主要分支

- **`main`**: 生产环境分支，只包含稳定的、可发布的代码
- **`develop`**: 开发集成分支，用于集成各个功能分支

### 支持分支

- **`feature/*`**: 功能分支，从 `develop` 分出，完成后合并回 `develop`
- **`release/*`**: 发布分支，从 `develop` 分出，准备发布时合并到 `main` 和 `develop`
- **`hotfix/*`**: 热修复分支，从 `main` 分出，修复后合并到 `main` 和 `develop`
- **`bugfix/*`**: 错误修复分支，从 `develop` 分出，修复后合并回 `develop`

## 分支命名规范

```bash
# 功能分支
feature/user-authentication
feature/payment-integration
feature/dashboard-ui

# 错误修复分支
bugfix/login-validation
bugfix/api-timeout

# 发布分支
release/v1.2.0
release/v2.0.0-beta

# 热修复分支
hotfix/critical-security-fix
hotfix/payment-bug
```

## 工作流程

### 1. 开发新功能

```bash
# 从 develop 创建功能分支
git checkout develop
git pull origin develop
git checkout -b feature/new-feature

# 开发完成后推送并创建 PR
git push origin feature/new-feature
# 在 GitHub 上创建 PR: feature/new-feature -> develop
```

### 2. 修复错误

```bash
# 从 develop 创建修复分支
git checkout develop
git pull origin develop
git checkout -b bugfix/fix-issue

# 修复完成后推送并创建 PR
git push origin bugfix/fix-issue
# 在 GitHub 上创建 PR: bugfix/fix-issue -> develop
```

### 3. 准备发布

```bash
# 从 develop 创建发布分支
git checkout develop
git pull origin develop
git checkout -b release/v1.1.0

# 进行发布准备（版本号更新、最终测试等）
# 完成后创建两个 PR:
# 1. release/v1.1.0 -> main (发布到生产)
# 2. release/v1.1.0 -> develop (同步回开发分支)
```

### 4. 紧急热修复

```bash
# 从 main 创建热修复分支
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix

# 修复完成后创建两个 PR:
# 1. hotfix/critical-fix -> main (立即修复生产问题)
# 2. hotfix/critical-fix -> develop (同步到开发分支)
```

## 合并规则

我们的 GitFlow 检查 workflow 会自动验证以下规则：

### 允许的合并

- `feature/*` → `develop` ✅
- `bugfix/*` → `develop` ✅
- `release/*` → `main` ✅
- `release/*` → `develop` ✅
- `hotfix/*` → `main` ✅
- `hotfix/*` → `develop` ✅

### 禁止的合并

- `feature/*` → `main` ❌
- `develop` → `main` ❌
- 任何分支 → `release/*` (除了 `feature/*` 和 `bugfix/*`) ❌

## 提交信息规范

推荐使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
feat: add user authentication
fix: resolve login validation issue
docs: update API documentation
style: format code with prettier
refactor: restructure user service
test: add unit tests for payment
chore: update dependencies
perf: optimize database queries
ci: update GitHub Actions workflow
build: configure webpack
revert: revert "feat: add user auth"
```

## 有用的 Git 命令

```bash
# 查看所有分支
git branch -a

# 切换到分支
git checkout branch-name

# 创建并切换到新分支
git checkout -b new-branch-name

# 推送分支到远程
git push origin branch-name

# 更新本地分支
git pull origin branch-name

# 删除本地分支
git branch -d branch-name

# 删除远程分支
git push origin --delete branch-name

# 查看分支图
git log --oneline --graph --all

# 查看未合并的分支
git branch --no-merged

# 查看已合并的分支
git branch --merged
```

## 常见问题

### Q: 我的 PR 被 GitFlow 检查拒绝了，怎么办？

1. 检查分支命名是否符合规范
2. 确认合并目标分支是否正确
3. 查看 workflow 输出的具体错误信息
4. 根据错误信息调整分支或重新创建正确的分支

### Q: 如何处理冲突？

```bash
# 更新目标分支
git checkout target-branch
git pull origin target-branch

# 回到你的分支并合并目标分支
git checkout your-branch
git merge target-branch

# 解决冲突后提交
git add .
git commit -m "resolve merge conflicts"
git push origin your-branch
```

### Q: 发布分支应该何时创建？

- 当 develop 分支包含了计划发布的所有功能时
- 准备进行最终测试和版本号更新时
- 不要在发布分支中添加新功能，只做 bug 修复

### Q: 热修复分支什么时候使用？

- 生产环境出现严重 bug 需要立即修复时
- 不能等到下个正常发布周期的紧急修复
- 安全漏洞修复

## 工作流程图

```
main     ──●────●────●────●──
            │    │    │    │
            │    │    │   hotfix/
            │    │    │    │
develop  ───●────●────●────●──
            │    │    │
         feature/ │ release/
            │    │    │
            ●────●────●
```

## 最佳实践

1. **保持分支简洁**: 及时删除已合并的分支
2. **频繁同步**: 定期从目标分支拉取最新代码
3. **小步提交**: 保持提交粒度适中，便于 review
4. **清晰描述**: PR 标题和描述要清楚说明变更内容
5. **及时测试**: 在本地充分测试后再推送
6. **代码审查**: 认真进行和参与代码审查
7. **文档更新**: 涉及 API 或功能变更时同步更新文档

---

如有任何关于 GitFlow 的问题，请联系开发团队或查看项目文档。
