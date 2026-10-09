# 腾讯云口语评测本地 Demo

本 Demo 只接入英语单词和句子评测。浏览器录音会先转换为 16kHz、16bit、单声道 WAV，再由后端建立腾讯 WSS 连接；SecretId、SecretKey 和 AppID 不会发送到浏览器。

## 本机配置

把 `tencent.env.example` 中的变量写入 `server/.env`，不要把真实值写入 Git、截图或聊天：

```text
TENCENT_SOE_APP_ID=
TENCENT_SOE_SECRET_ID=
TENCENT_SOE_SECRET_KEY=
TENCENT_SOE_SCORE_COEFF=4.0
```

启动后端：

```sh
uv run uvicorn main:app --host 127.0.0.1 --port 8000
```

页面调用 `/api/tencent/status` 查看是否已配置，调用 `/api/tencent/assess` 完成一次评测。腾讯返回的 `PronAccuracy`、`PronFluency`、`PronCompletion` 会统一成前端的 0–100 展示值，`SuggestedScore`、单词 `MatchTag` 和音素明细保留在结果中。

当前本地 Demo：单词总分取准确度；腾讯句子总分直接取 `SuggestedScore`。不展示独立韵律项，也不使用旧供应商的含韵律加权公式。单词页展示准确度、流利度，句子页另展示完整度；“腾讯建议分”不再作为重复卡片出现。此说明不代表正式环境部署状态。

完整规则、字段单位、通过线及官方依据见 [腾讯评测规则](../docs/tencent-scoring-rules.md)。

官方字段说明：[腾讯云口语评测（新版）评测维度](https://cloud.tencent.com/document/product/1774/107384)。
