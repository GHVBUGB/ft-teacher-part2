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

腾讯句子结果没有独立 `rhythm` 时，页面显示“韵律：未返回”，不把流利度或完整度改名成韵律，也不计算现有句子总分。正式训练接口和数据库评分仍未切换到腾讯。

官方字段说明：[腾讯云口语评测（新版）评测维度](https://cloud.tencent.com/document/product/1774/107384)。
