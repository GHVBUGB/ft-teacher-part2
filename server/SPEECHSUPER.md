# SpeechSuper 本地接入试点

2026-09-09 已配置本机试用凭据，单词、句子、自由表达均经项目界面取得真实供应商结果。测试音频均为合成音频，未验证真人评分准确性。试用到期为 2026-09-23 00:00 UTC+8，并发上限2。

## 开始使用

1. 将 `speechsuper.env.example` 复制为本目录 `.env`，在本机编辑 appKey、secretKey。不要填入前端或聊天。密钥可从 SpeechSuper 官方账号取得，需要开通 word.eval.promax、sent.eval.promax、speak.eval.pro 的相应权限。
2. 在 server 目录运行 `uv sync --locked`，然后 `uv run python run_local.py`。修改密钥后重启服务。
3. 在 ft-practice 目录运行项目原有 `dev` 命令，访问 http://localhost:3000/。Vite 将 `/api/speechsuper` 代理到本机8000端口。
4. 进入默认的 SpeechSuper 真实评测页，选择词句或自由表达，填写自己的内容，录音或上传音频，点击提交。结果可展开逐项查看或导出。

## 边界

- 三种类型分别映射 word.eval.promax / sent.eval.promax / speak.eval.pro；自由表达传 question_prompt、test_type=ielts、model=non_native、penalize_offtopic=1。
- 浏览器将音频转换为16kHz单声道16bit WAV；后端再次校验格式、时长、静音及体积。请求超时不生成成绩，不自动重试收费请求。
- appKey 与 secretKey 只在后端参与官方 SHA1 鉴权；没有客户端设定 passed 的接口。
- 不保存原音；返回供应商 result 与本次请求ID，界面刷新后结果清除，请及时导出。未实现跨设备题库、持久评分档案及真人资格判定。
- 自由表达保持供应商评分尺度，不把 IELTS 0–9 或其他量表冒充百分制。缺失分项不补零。
- 原有模拟分数/进度保持独立。新入口的真实分数不驱动原演示流程。
- 当前后端身份仍是 mock，本入口限制本地访问。上线前需要正式身份、权限、并发/额度限制、持久存储及 HTTPS 服务。静态 Sites 发布不能运行此 Python 后端，本轮未发布静态页面冒充完整集成。

## 验证

`uv run pytest -q`：协议映射、无密钥、静音、损坏音频、来源校验、供应商错误、超时；供应商成功结果的自动化测试使用明确的 stub，不是真实评分证明。
真实界面截图及测试报告见项目 `artifacts/testing/2026-09-09-speechsuper/`。

协议依据：https://github.com/speechsuper/SpeechSuper-API-Samples/blob/main/http_samples/python_http_sample/sample.py
自由表达参数：https://github.com/speechsuper/SpeechSuper-API-Samples/blob/main/README.md
