# FT 云端部署准备与验收状态

日期：2026-09-20。范围：ft-teacher-part2。预算：用户明确要求免费。
状态：准备中；Neon免费空库已创建，应用未部署、未建业务表、未完成生产验收。

## 已核实的当前状态
- Login.tsx 为固定演示验证码，不发送邮件、不验证公司教师身份。
- server/main.py 的身份、分配、进度接口仍为固定 fixture。
- 前端 Progress 使用浏览器存储；语法答案随前端题库发送。
- server/production/grammar.py 新增服务端规则核心，尚未接到接口或数据库。
- 服务端规则测试覆盖：24/30 通过、第7道错题提前结束、跨教师拒绝、跳题拒绝、重复提交拒绝、重考乱序与非法选项。
- 当前后端测试17项通过。评分供应商测试使用模拟响应，不代表付费接口实测。
- 本机 Docker daemon 未运行；没有因此修改系统服务。
- 当前仓库没有配置 Git remote；部署代码来源尚未建立。

## 免费资源选择
- Render Free：可运行现有 Python 后端并提供平台域名。
  官方明确不建议用于生产；15分钟无请求休眠，唤醒约1分钟。
  本地文件不持久；不能把数据库或上传录音保存在实例磁盘。
  https://render.com/docs/free
- Neon Free：独立 PostgreSQL，当前官方说明每项目0.5GB、每月100 CU-hours。
  https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md
- 不使用 Render 免费 PostgreSQL 存正式成绩：其30天到期。
- 不绑付费、不启用自动升级。语音评分供应商额度不包含在上述免费资源内。
- 控制台尚需用户登录；新建账号的条款与身份验证由用户完成。

## 未完成的上线必需工作
- 确认教师身份来源：公司系统或受控教师邮箱名单；仅能收邮件不等于教师资格。
- 真实邮箱验证码、发送限流、会话撤销与安全Cookie。
- 创建项目专属数据库与最小权限应用角色，迁移及备份/恢复实测。
- 服务端题库、考核轮次、作答幂等、事务锁；前端不得下发正确答案或自行决定通过。
- 词句评分端点绑定教师会话与任务，限制并发、大小、频率和供应商额度。
- 语法规则核心接到受保护接口；刷新、断线及跨设备恢复。
- 移除生产构建中的演示登录、acceptance 全通预览及调试绕过。
- HTTPS部署；域名、日志脱敏、健康检查、故障恢复。
- 验收：登录、账号隔离、三关考核、错7题、24题通过、重复提交、断线重试、数据库重启后数据、备份恢复。
- 免费云端试用通过不等于全天候生产服务。最终验收须记录部署URL、版本、数据库迁移版本和真实测试证据。

## 2026-09-20 云资源实时回读
- Render：已通过Google登录，停在New Web Service的代码来源选择。未创建Web服务。
- Neon：Google登录完成；项目ft-teacher-part2，ID orange-water-77702819。
- 区域AWS Singapore；Free plan；PostgreSQL18；1 database、1 compute。
- 分支production，ID br-weathered-wave-b3zbtukj。分支名不代表业务已上线。
- 未绑定付费卡，未启用AI gateway、对象存储、Functions或Auth。
- 待提供/登录GitHub以确定私有代码仓库，未上传代码或秘密。

## 2026-09-20 15:29 后续执行回执
- GitHub CLI经用户明确授权，已登录GHVBUGB。
- 私有仓库 https://github.com/GHVBUGB/ft-teacher-part2 已创建；API独立回读private=true。
- 339个文件的隔离源码快照已推送main（6d08dfa）；原本地工作树未重置。当前源码仍含明确标记的Demo实现，不可当生产服务发布。
- Neon的ft_training schema迁移001已执行，独立SQL查询回读8张表及schema_versions=1；没有导入真实教师或成绩。
- Render Web服务未创建。真实邮箱认证、公司教师资格来源、发信服务及前后端接库仍未完成。
- 等待用户确认白名单或公司身份系统方案，不以任意邮箱自动获得教师资格。
