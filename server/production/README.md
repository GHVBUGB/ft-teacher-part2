# 真实后端（本地集成已实现，云端尚未接入）

此入口不加载旧演示身份或 localhost 评测路由。必须使用 PostgreSQL；不允许回退到内存或本地模拟通过状态。

## 运行

Python 3.12+，安装 server/pyproject.toml 依赖后，在 server 目录运行：

```sh
uvicorn production.web:app --host 0.0.0.0 --port 8000
```

前端使用 `FT_FRONTEND_MODE=live pnpm run build` 构建到 dist-production。`production.web` 同源托管静态文件和API；反向代理负责HTTPS。也提供 Dockerfile.production，尚未实际容器构建或云部署。

服务端环境配置：

| 名称 | 用途 |
|---|---|
| DATABASE_URL | FT 项目专用 PostgreSQL 连接，生产必须验证 TLS |
| APP_ORIGIN | 页面完整 HTTPS 来源（不含路径、末尾斜线） |
| SPEECHSUPER_APP_KEY / SPEECHSUPER_SECRET_KEY | 仅后端保存的评分密钥 |
| SPEECHSUPER_TRIAL_EXPIRES_AT | 供应商确认的免费截止时间，含时区；空值/过期拒绝评分 |
| OTP_SECRET | 验证码 HMAC 密钥，随机高熵值 |
| SMTP_HOST / SMTP_PORT / SMTP_FROM / SMTP_USER / SMTP_PASSWORD | SSL 发信服务；未配置明确返回 EMAIL_NOT_CONFIGURED |

数据库按顺序应用 001—009。009 新增限流表、语音请求摘要和并发租约表，不启用旧模拟教师。迁移应由迁移账号执行；运行账号只授予所需表的 SELECT/INSERT/UPDATE 和 identity sequence 权限，禁止 DDL。连接池或代理必须保留事务语义。

会话使用 `__Host-ft_session`、Secure、HttpOnly、SameSite=Strict；前端与后端必须同站部署或通过同源代理 `/api/v1`。不得为了跨域运行去掉 Cookie/Origin 校验。

## API

所有成功返回 `{data, request_id}`；错误不回显密码、验证码、录音、SQL 或密钥。

| 接口 | 功能 |
|---|---|
| POST /api/v1/auth/password | 独立白名单账号密码登录 |
| POST /api/v1/auth/email | 发送验证码，仅启用的白名单邮箱可收到 |
| POST /api/v1/auth/verify | 有效期、失败次数和单次使用校验 |
| POST /api/v1/auth/logout | 撤销会话并清除 Cookie |
| GET /api/v1/me | 当前认证教师 |
| GET /api/v1/enrollments | 只返回当前教师的培训分配 |
| GET /api/v1/enrollments/{id}/progress | 当前教师各关各轮状态、时间 |
| POST /api/v1/enrollments/{id}/stages/{word,sentence,grammar}/round | 恢复进行中轮次，返回已通过轮次，失败语法重新打乱；严格前置关卡 |
| POST /api/v1/grammar/rounds/{id}/answers | 服务端题序、答案和80%规则；禁止前端传分数 |
| POST /api/v1/speech/rounds/{id}/assessments | 已分配题目、WAV验证、供应商评分、分数落库 |
| POST /api/v1/feedback | 反馈保存及请求去重 |
| GET /api/v1/health | 数据库和迁移版本就绪检查，不返回连接信息 |

语法答错仅返回对错和下一题，不泄露答案解析。评分失败存为 failed/score=NULL，不计作教师答错。未将教师实际资质与测试账号身份混淆。

`active_duration_ms` 是客户端报告的有效答题时间，上限2小时；不能称为防作弊的权威计时。服务器创建/完成时间单独保存。录音只在内存中处理，不写文件、不保存完整供应商请求。

## 测试

使用项目工作目录中的独立临时 PostgreSQL，不连接 Neon 正式库。测试集自动创建 schema，目标必须是全新空数据库：

```sh
FT_TEST_DATABASE_URL='...' PYTHONPATH=server server/.venv/bin/python -m unittest discover -s server/production/tests -p 'test_*.py' -v
```

供应商和SMTP在测试中被替代。测试通过不等于SpeechSuper真实可用，不等于云端部署，不等于现有前端已经接通。

## 仍未完成

- 原演示入口保留。新增真实接口验收入口 LiveApp，通过 FT_FRONTEND_MODE=live 构建；不引用题库答案/模拟身份。该入口已编译，尚未完成浏览器视觉验收，不冒充已上线。
- Sites当前是静态站点，不能直接运行这个Python入口。要保持原URL，需同源支持的服务器运行时或改写为Workers兼容后端。
- 本机缺Neon专用应用连接配置和实际发信配置；没有在公网启用此服务。
- SpeechSuper延期邮件已发，免费延长期和准确截止时间待供应商确认。
- 语音请求先落库 pending，再调用供应商。同一请求重试不会再次调用；进程中断遗留 pending 时明确阻止本轮新评分，需用供应商请求编号核查后人工恢复，不编造分数。
- 需补齐双账号完整浏览器流程、30账号并发及供应商真实音频测试。
