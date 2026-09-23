# FT 教师培训 Part 2 合并交接

本分支提供 Part 2（单词、句子、语法练习）的当前本地源码快照，以及接入 Part 1（Orientation）需要的公共字段、接口和数据来源清单。它是**合并候选**，不是已合并或已上线的教师端。Part 1 的实际代码、知识库数据和接口仍需由该模块负责人提供。

## 先读三份对接清单

- [共同身份与字段表](docs/integration/01-共同身份与字段表.md)
- [接口清单](docs/integration/02-接口清单.md)
- [数据来源与知识库交接表](docs/integration/03-数据来源与知识库交接表.md)

公共 mock 契约在 `contracts/openapi.json` 和 `server/common/schemas.py`。Part 2 本地真实后端候选在 `server/production/`，运行说明见 [后端 README](server/production/README.md)。两个入口的 `/api/v1/me`、`/enrollments` 和 `/progress` 当前返回结构不同；合并时须先统一契约，不可直接把同名路由视为兼容。

## 运行与验证

前端要求 Node.js 22.13+、pnpm。`pnpm dev` 是演示入口；`FT_FRONTEND_MODE=live pnpm build` 构建本地真实后端的验收前端。`pnpm typecheck`、`pnpm test`、`pnpm build` 可用于基础检查。

本地真实后端要求 Python 3.12+ 和 PostgreSQL；环境配置、迁移顺序、会话和测试见 [后端 README](server/production/README.md)。数据库迁移脚本为 `server/production/migrations/001_initial.sql` 至 `009_runtime_limits.sql`。不要在未核对迁移版本和备份的数据库直接重跑脚本。

## 当前边界

已发布的 Sites 网页仍是演示版：模拟登录、浏览器保存练习状态。`server/production/` 在本地隔离环境验证过部分流程，尚未作为公网后端完成云端接库、真实邮件、真实语音供应商评分和真人教师验收。题库源表和部分项目背景资料位于本仓库之外，详情见数据来源表。真实教师资料、数据库连接串和供应商密钥不在本仓库。

首次合并应先让两部分共用同一个教师 ID、课程版本和 `enrollment_id`，再接入两个模块的页面与进度。Part 1 的知识库、问答和教学内容可保留独立存储，通过有权限的检索接口接入；需先核实批准资料、版本及访问范围。
