# 本地代码清理验收 · 2026-09-17

## 范围和结果

以本次开始时的工作目录为基线，不以 Git HEAD 覆盖既有修改。清理只在本地生效，未更新公网测试构建、重启隧道或发布。

- 移除58个无引用的模板组件、旧样式及辅助文件；9张无引用旧图片。
- 移除8个无使用点的直接依赖：@shadcn/react、cmdk、date-fns、embla-carousel-react、input-otp、react-day-picker、react-resizable-panels、recharts，并更新锁文件。
- 练习页改为按路由加载，介绍页不再提前下载整套练习页面代码和样式；加载时保留双语提示。
- 删除依据为源码与测试入口依赖遍历、样式引用及图片名称检索，不以文件年龄作为删除依据。

## 保留理由

| 内容 | 用途 |
|---|---|
| Practice、地图、朗读、语法、通关组件 | 当前路由及业务流程 |
| score、assessment、round store、stage progress | 评分、重试、关卡及成绩保存，未改语义 |
| 真实接口适配器及条件启用的调试模块 | 当前或可选配置入口，不能仅按默认页面判断废弃 |
| contracts、generated types、mock | 契约、类型及本地演示数据 |
| tests、浏览器测试页、scripts | 回归测试及项目运维入口 |
| 当前图片、音频样本、授权说明 | 页面显示、试听和素材署名 |
| shadcn、Base UI及保留公共组件 | theme.css仍导入shadcn样式；控件有实际引用 |
| server及配置 | 本地服务、评分接口和测试网关 |

“全部留下的都必要”不能只由一次静态扫描证明；有运行条件或外部调用可能的模块保留并说明用途，避免误删。

## 可重复的体积比较

同机同配置执行 `pnpm build --outDir work/cleanup-before` 与 `pnpm build --outDir work/cleanup-after`，统计磁盘字节，十进制单位：

| 项目 | 清理前 | 清理后 |
|---|---:|---:|
| 完整构建产物 | 45.51 MB | 22.39 MB |
| 入口JavaScript | 644 KB | 382 KB |
| 入口CSS | 295 KB | 69 KB |

完整产物约减少51%；首次入口JS约减少41%。练习页另有约263 KB JS与79 KB CSS按需加载。这里是资源体积，不代表真实网络耗时同比下降；也不解决临时公网隧道掉线。

## 验证

- typecheck：通过。
- production build：通过。
- 九个tests/*.mjs脚本全部通过：assessment-client、assessment-request、assessment-round、round-store、rules、score-details、score、stage-progress、target-catalog。没有调用收费评分服务。
- 浏览器：介绍页开始入口进入练习成功；单词和句子地图背景、人物、题目及满分预览显示正常。
- 本次截图：../artifacts/testing/2026-09-17-cleanup/ 下intro.png、words.png、sentences.png（相对路径从项目上一级教师目录定位）。
- 全量lint仍有10条原有诊断：通关页语义标签2条、测试const与effect依赖2条、Practice effect/React Compiler/依赖6条。对应源文件与本次备份一致。未把lint记为通过，也未通过屏蔽规则掩盖诊断。
- 保留下来的src文件仅src/app/main.tsx与本次基线不同。评分、题库、成绩保存、接口调用文件保持原样。

## 回滚

备份：/Users/guhongji/Desktop/教师/代码清理备份-20260917

before保存清理前源码、测试、package.json及锁文件；removed按原相对目录存放本次移除文件。恢复时只复制需要恢复的文件，避免覆盖清理后新增工作。

## 移除清单

- `public/images/otome-guide.png`
- `public/images/sentence-atlas-otome.png`
- `public/images/sentence-atlas-scenic-v2.png`
- `public/images/sentence-atlas-valley.png`
- `public/images/training-intro-scene.png`
- `public/images/word-atlas-otome.png`
- `public/images/word-atlas-reference.png`
- `public/images/word-atlas-scenic-v2.png`
- `public/images/word-atlas.png`
- `src/features/practice/OtomeAtlas.css`
- `src/features/practice/ReadingMap.css`
- `src/features/practice/StageProgressSummary.tsx`
- `src/shared/hooks/use-mobile.ts`
- `src/shared/ui/accordion.tsx`
- `src/shared/ui/alert-dialog.tsx`
- `src/shared/ui/alert.tsx`
- `src/shared/ui/aspect-ratio.tsx`
- `src/shared/ui/attachment.tsx`
- `src/shared/ui/avatar.tsx`
- `src/shared/ui/badge.tsx`
- `src/shared/ui/breadcrumb.tsx`
- `src/shared/ui/bubble.tsx`
- `src/shared/ui/button-group.tsx`
- `src/shared/ui/calendar.tsx`
- `src/shared/ui/card.tsx`
- `src/shared/ui/carousel.tsx`
- `src/shared/ui/chart.tsx`
- `src/shared/ui/checkbox.tsx`
- `src/shared/ui/collapsible.tsx`
- `src/shared/ui/combobox.tsx`
- `src/shared/ui/command.tsx`
- `src/shared/ui/context-menu.tsx`
- `src/shared/ui/direction.tsx`
- `src/shared/ui/drawer.tsx`
- `src/shared/ui/dropdown-menu.tsx`
- `src/shared/ui/empty.tsx`
- `src/shared/ui/field.tsx`
- `src/shared/ui/hover-card.tsx`
- `src/shared/ui/input-group.tsx`
- `src/shared/ui/input-otp.tsx`
- `src/shared/ui/input.tsx`
- `src/shared/ui/item.tsx`
- `src/shared/ui/kbd.tsx`
- `src/shared/ui/label.tsx`
- `src/shared/ui/marker.tsx`
- `src/shared/ui/menubar.tsx`
- `src/shared/ui/message-scroller.tsx`
- `src/shared/ui/message.tsx`
- `src/shared/ui/native-select.tsx`
- `src/shared/ui/navigation-menu.tsx`
- `src/shared/ui/pagination.tsx`
- `src/shared/ui/popover.tsx`
- `src/shared/ui/resizable.tsx`
- `src/shared/ui/scroll-area.tsx`
- `src/shared/ui/separator.tsx`
- `src/shared/ui/sheet.tsx`
- `src/shared/ui/sidebar.tsx`
- `src/shared/ui/skeleton.tsx`
- `src/shared/ui/slider.tsx`
- `src/shared/ui/spinner.tsx`
- `src/shared/ui/switch.tsx`
- `src/shared/ui/table.tsx`
- `src/shared/ui/textarea.tsx`
- `src/shared/ui/toast.tsx`
- `src/shared/ui/toggle-group.tsx`
- `src/shared/ui/toggle.tsx`
- `src/shared/ui/tooltip.tsx`
