# 公开测试运行说明

入口：https://dealing-provisions-profiles-lover.trycloudflare.com/training/11111111-1111-4111-8111-111111111111/practice?test=acceptance

前端发布构建：VITE_PUBLIC_TEST=true pnpm exec vite build --outDir work/public-test/dist
隔离入口：server/public_test.py，uvicorn public_test:app --host 127.0.0.1 --port 8088 --no-proxy-headers
本地评分：原有127.0.0.1:8000。公开入口仅转发SpeechSuper的status与assess，其他API不开放。

Cloudflare官方临时测试连接使用HTTP2，当前网络不支持QUIC；连接进程与gateway PID见work/public-test/processes.json，日志同目录。可核对PID对应命令后发送SIGTERM停止；未安装开机启动或自动化。

试用有效期经用户Chrome控制台核实为2026-09-23 00:00 UTC+8。入口到期拒绝新评测请求。正式长期部署、域名、认证、题库冻结和成本需另行落实。
