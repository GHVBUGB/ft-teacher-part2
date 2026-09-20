> 2026-09-09 新增 [SpeechSuper 本地接入试点](SPEECHSUPER.md)，包含真实供应商适配代码；需密钥后联调。下方只读 mock 说明仍适用于原公共身份与进度接口。

# 公共后端契约样板

本目录采用 Python/FastAPI/Pydantic，使用 uv.lock 锁定依赖；SQLAlchemy/Alembic/PostgreSQL 驱动已列入共同依赖。当前只实现只读 mock API，以 contracts/mock.json 为共同样本，不连接数据库，不提供生产登录、上传或评分功能。

```sh
uv sync --locked
uv run uvicorn main:app --host 127.0.0.1 --port 8000
uv run pytest
uv run python -c "from main import app; import json; from pathlib import Path; Path('../contracts/openapi.json').write_text(json.dumps(app.openapi(), indent=2))"
```

当前四个读取接口有真实可运行的 FastAPI 实现。教师身份固定为 mock；实际身份、归属校验、PostgreSQL 表和 Alembic 迁移、S3 存储需要公共基础负责人一起合并。不要把这个 mock API 上线为真实业务 API。没有客户端直接写 passed 的端点。

前端默认使用相同 fixture 的浏览器 mock transport；静态演示网站不运行 Python。正式 API 接入后，通过 VITE_API_BASE_URL 指向已实现身份与权限的 API（同源代理优先）。不能把生产账号指向本 mock 服务。

### macOS 本地持续运行

从项目根目录执行 `python3 scripts/backend-service.py start`，由当前登录会话的 launchd 管理后端，避免临时开发终端结束时评测断开。已经运行时会复用该服务；不要再同时启动另一份 `run_local.py`。

- 查看状态：`python3 scripts/backend-service.py status`
- 停止服务：`python3 scripts/backend-service.py stop`
- 日志：`artifacts/runtime/backend-service/`

仍仅监听 `127.0.0.1:8000`，密钥仍读取忽略提交的 `server/.env`。没有安装开机/登录启动项；电脑重启或重新登录后需再次执行 `start`。
