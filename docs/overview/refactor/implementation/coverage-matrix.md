# 架构要求覆盖矩阵

逐项实现状态、验证证据和未决事项记录在 [`0.0.1` 重构验收清单](./acceptance-checklist.md)。任何条目只有在该清单中达到 `ACCEPTED` 才能作为完成项汇报。

| 要求                            | 权威文档                                                                                                                                 | 主要验证证据                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 十二个可部署 app、12 个 package | [系统](../architecture/system.md)、[Workspace](./workspace-projects.md)                                                                  | workspace/import graph、十二个 image build/start                    |
| 前端 Web/Admin 分离             | [前端](./frontend-structure.md)                                                                                                          | bundle scan、audience/session e2e、Playwright                       |
| 十个 backend 所有权             | [后端](./backend-structure.md)                                                                                                           | architecture imports、DB role integration                           |
| Learning Agent 统一能力         | [Agent 架构](../architecture/learning-agent-system.md)、[产品](../product/learning-agent.md)                                             | capability contract、Run/Wait/ChildRun property tests               |
| Agent typed command isolation   | [ADR 0012](../../adr/0012-learning-agent-typed-command-isolation.md)                                                                     | executor forbidden write、Grant/digest/schema tests                 |
| Job/JobAttempt 与 fencing       | [Job](../architecture/background-jobs.md)、[ADR 0013](../../adr/0013-relational-truth-agent-events-and-job-attempts.md)                  | Redis-loss、claim race、late result、drain tests                    |
| Identity、MFA、Grant、BYOK      | [身份](../product/identity-user.md)、[凭证](../architecture/credential-management.md)、[Model Gateway](../architecture/model-gateway.md) | auth/audience/revocation、encryption/rewrap、BYOK no-fallback tests |
| Lexicon 五层结构与来源          | [关系模型](../data/relational-schema.md)、[标准](../architecture/standards.md)                                                           | schema/ref/provenance/lineage tests                                 |
| 单一标准 JSON                   | [标准 JSON](../data/standard-json.md)、[映射](../data/artifact-database-mapping.md)                                                      | 200 词/full stream、hash、round-trip、empty DB                      |
| Builder/Publisher 分离          | [Compiler](../pipeline/lexicon-compiler.md)、[发布](../pipeline/import-release.md)                                                       | dependency rule、publisher no-model/no-activation tests             |
| 练习 13 task/4 response         | [学习与测评](../product/learning-assessment.md)                                                                                          | combination matrix、renderer、grading tests                         |
| Agent 私人练习与全局门禁        | [Agent 架构](../architecture/learning-agent-system.md)                                                                                   | PRACTICE_ONLY、consent/review/release tests                         |
| User-controlled retention       | [ADR 0015](../../adr/0015-user-controlled-content-retention.md)                                                                          | immediate hide、30-day purge、SupportGrant audit                    |
| main -> staging -> release      | [CI/CD](../delivery/cicd-security.md)、[ADR 0014](../../adr/0014-trunk-based-immutable-digest-delivery.md)                               | branch protection、manifest/digest equality、approval               |
| 一次性绿地迁移                  | [迁移](../delivery/migration.md)                                                                                                         | no legacy references、full clean-db acceptance                      |
