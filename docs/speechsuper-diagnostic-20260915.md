# SpeechSuper 实测诊断

2026-09-15：用户同意继续后，限一次真实请求，使用项目 ft-word-apple.wav。
回执：errId=41030，error=connect with invalid sig。未取得有效评分。
签名拼接和 SHA1 算法已与 speechsuper/SpeechSuper-API-Samples 的 http_samples/python_http_sample/sample.py 对照一致。
截图录入的凭据尚未与原始 .env 文件独立对照；需要原文件或准确复制值，不能猜测字符。
已将错误提示改为具体错误码及签名校验失败，不再一律提示额度和权限。后端 12 项测试通过。
未保存密钥值、请求签名或音频正文。


## 后续修复与真实验收

从用户 Chrome 已登录控制台直接读取现有凭证，确认并修正本地 Secret Key 不一致。单词 apple 返回总分 96，句子 I like red cherries. 返回总分 99；均经 localhost:3000 代理调用真实供应商成功。验收回执保存在项目 artifacts/testing/2026-09-15-speechsuper。未改变用户通关记录。
