# Speechace 本地试点

页面默认使用 Speechace；SpeechSuper 作为另一个可切换入口保留。当前未配置 Speechace API Key，真实供应商联调尚未完成。

## 配置

从 https://www.speechace.com/api-plans/ 申请 API 试用。自由表达需要 Premium 权限。将以下配置写入 server/.env（保留已有 SpeechSuper 配置）：

```
SPEECHACE_API_KEY=实际密钥
SPEECHACE_REGION=us
```

区域必须与密钥一致：us 美国、sg 新加坡、eu 爱尔兰、in 印度。默认 us 不是自动选择最合适区域。
重启本地后端：在 server 目录执行 `uv run python run_local.py`；前端使用原 dev 命令启动于 localhost:3000。

## 接口与边界

词句使用 `/api/scoring/text/v9/json`，传 text 和 user_audio_file；本地试点限制30秒，不额外请求 Pro 流利度功能。
自由表达使用 `/api/scoring/speech/v9/json`，传 relevance_context、include_ielts_feedback=1、pronunciation_score_mode=default，最长120秒。参考英语配置为 en-us；不根据国籍或口音标签淘汰老师。
密钥只在服务端传给供应商；错误消息不回显带密钥的URL。没有自动重试收费请求。
将 speechace_score 或词句 quality_score 展示为供应商百分制，IELTS/CEFR 等其他量表保留在原始结果中；相关性/警告也保留供复核。没有自动通过判断。
原有演示成绩不混入。题目和录音本轮仍不持久保存。身份、正式数据库和上线部署尚未完成，Python后端仅监听本机；静态网站不能独立运行此评测服务。

官方协议：https://api-docs.speechace.com/api-reference/score-text-pronunciation
自由表达：https://api-docs.speechace.com/api-reference/score-speech-open-ended
区域：https://api-docs.speechace.com/getting-started/pre-requisites/api-regions-and-endpoints

测试：后端10项、原前端10组规则、TypeScript及构建通过。供应商成功返回通过 stub 验证映射，不代表真实账号调用通过。
