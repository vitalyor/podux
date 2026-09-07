# UI 规范

## 技术栈、入口与主题

业务 UI 是 `site/` 下的 React 19 + TypeScript + Vite 7 应用，使用 Radix Themes、Tailwind CSS 4、Iconify、Framer Motion、Recharts、Sonner、react-i18next；不是 Vue。Vue 只服务于 `docs/` 的 VitePress。

`site/src/main.tsx` 依次载入 Radix CSS、`index.css` 和 i18n，并将应用包在 `ThemeProvider`、`LanguageProvider` 与 Radix `<Theme>` 中。主题配置为 `accentColor="indigo"`、`grayColor="slate"`、`radius="large"`；appearance 为 light/dark，初次取系统 `prefers-color-scheme`，随后存入 `localStorage.theme`。`index.css` 是 Tailwind 和全局状态点样式入口；`App.css` 仍是 Vite 模板残留且未被 `App.tsx` 导入，不应当作当前页面基线。

## 已使用的 design tokens

当前没有项目自定义 token 文件，主要直接消费 Radix CSS variables 和组件 size/gap 标度。

| 类别 | 已验证取值/用法 |
| --- | --- |
| 品牌/强调色 | Radix indigo 映射的 `--accent-2/3/4/6/9/10/11`、`--accent-a3`；不要硬编码一个新的“Podux 蓝” |
| 中性色/表面 | slate 映射的 `--gray-1..12`、alpha gray、`--color-background`、`--color-panel-solid`；主页面背景 `--gray-2` |
| 状态色 | Radix green/red/amber/orange/blue/purple scales；在线点 `--green-9`，离线点 `--red-9`，未知点 `--gray-9` |
| 字体 | 未设置项目字体族，继承 Radix/browser；正文常用 `<Text size="1|2|3|4">`，页标题 `<Heading size="6">`，区块标题常用 size 3/4 |
| 间距 | 优先 Radix `gap/mb/px/py` 标度和 Tailwind（如 px-4、sm:px-6、lg:px-8）；局部常见 8/12/16/20/24/32px |
| 圆角 | Radix 全局 `large`；变量 `--radius-2/3`；局部 8/12/16/24px 与 full circle |
| 边框 | 通常 `1px solid var(--gray-5|6)`，强调区域用 `--accent-6` |
| 阴影 | 少量局部 `0 4px 12px rgba(0,0,0,.05/.2)`、`0 4px 16px rgba(0,0,0,.1)`；Card/Dialog 优先组件默认 |
| 层级 | 顶栏 `z-50` sticky；全屏 Loading `z-index: 9999`；其余优先组件自身 overlay 层级 |

硬编码 `#22c55e`、`#E5484D`、`#30A46C`、`#6b7280` 等仍散落在图表/状态实现中；应优先使用现有 Radix token，清理需单独任务验证图表 SVG 兼容，不能在普通功能改动中批量替换。

## 布局与组件模式

- 应用壳：复用 `layouts/MainLayout.tsx`。桌面为 sticky 顶栏、logo、Dashboard/Servers/Proxies 导航与右侧控制；移动端在 `760px` 以下切换底部导航。内容宽度使用 `max-w-7xl`，最小视口宽度 320px，并给移动底栏留空间。
- 页面标题：复用 `components/PageHeader.tsx`，标题/说明/右侧操作保持同一层级；区块标题复用 `SectionHeading`。
- 表单：优先 Radix `TextField/Select/Switch/Button`，标签和 required 标记复用 `FormItem`；页面状态与提交逻辑保留在 hook/index，view 负责布局。
- 卡片与统计：一般内容用 Radix `Card`；dashboard 数值卡复用 `StatCard` 和 `AnimateNumber`，不要复制动画/颜色判定。
- 列表：Servers/Proxies 已形成桌面 table + 移动 card、搜索、分页、Badge/DropdownMenu 模式。新增同类资源应优先沿用。
- 对话框：确认删除使用 Radix `AlertDialog`；编辑/密码等用 Radix `Dialog`。危险动作明确使用 red、取消和确认分离，异步期间禁用重复提交。
- 图表：延迟趋势复用 `LatencyChart/ProbeHistory`，拓扑复用 Dashboard `TopologyChart`；容器需可响应，颜色在深浅主题均有足够对比。
- 通知：操作成功/失败优先 `sonner` toast（全局 top-center richColors）；不要新增 alert，现有 ProfileSettings 的 `alert` 是待治理遗留。
- 空/加载/错误：空列表复用 `EmptyState`；路由/页面加载复用 `Loading`；错误应提供用户可理解提示及可恢复动作。当前尚无统一 ErrorState/ErrorBoundary，新增前先评估是否应形成公共组件。

## 真实页面参考

- Dashboard：`site/src/pages/Dashboard/DashboardPage.view.tsx` 使用 `PageHeader`、`StatCard`、Radix Grid/Card 和 `TopologyChart` 组合统计及拓扑；数据编排位于 `useDashboard.ts`。
- Servers/Proxies：`site/src/pages/Servers/ServersPage.view.tsx` 与 `site/src/pages/Proxies/ProxiesPage.view.tsx` 是响应式列表、状态 Badge、操作菜单和 AlertDialog 的主要参考；表单分别位于对应 `*FormPage`。
- Settings：`site/src/pages/Settings/SettingsPage.view.tsx` + `SettingsPage.css` 使用 240px 侧栏、active accent 状态和内容区；`GeneralSettings.tsx` 展示 `FormItem`、loading、save toast，`ProfileSettings.tsx` 展示资料卡和安全区块。

## 响应式、主题、国际化与可访问性

- 响应式：应用壳真实断点为 `max-width: 760px`（注释中的 640px 已过时）。测试至少覆盖 320px 移动宽度和桌面；表格内容在移动端采用卡片或可控滚动，不依赖 hover 才能操作。
- 双主题：所有新颜色优先 `var(--accent-*)`、`var(--gray-*)` 与语义色；避免固定白底/黑字。图表、overlay、边框、focus 在 light/dark 都需检查。
- 国际化：所有用户文案通过 `t()`，并同步 `locales/zh.json` 与 `en.json`。LanguageContext/localStorage 负责语言；不要以中文或英文裸字符串作为 fallback UI。
- 可访问性：使用 Radix 语义组件，Icon-only button 必须有可访问名称/tooltip；图片提供 alt；表单 label 与控件关联；键盘焦点不可隐藏。`index.css` 当前对 Recharts surface 强制移除 outline，只能限于非交互图表；若加入图表键盘交互需重新评估。
- 动效：页面切换标准为 `PageTransition` 的 0.3s cubic-bezier；标题 0.5s easeOut；状态点 1.6–2.5s 循环。交互可用轻量 hover/tap，不应阻塞操作。当前仅 Vite 模板残留 `App.css` 使用 `prefers-reduced-motion`，实际 Framer/状态点尚未统一尊重 reduced motion，属于待治理项。

## 复用与新增规则

1. 先查 Radix Themes，再查 `site/src/components/`，再查相邻页面的 view/hook 模式。
2. 跨两个以上页面且语义稳定的模式才提取公共组件；页面专属组合留在页面目录。
3. 新公共组件应使用 token、支持 className/必要 props、覆盖 loading/disabled/error，并在双主题和移动布局验证。
4. 局部样式可用于第三方图表、复杂布局或 Radix props/Tailwind 难表达的状态；命名限定页面/组件，避免全局选择器和 `!important`。现有 Settings CSS 的 `!important` 是兼容性现状，不是新增样式范式。
5. 不恢复或扩展未使用的 `App.css` 模板样式；需要全局规则时进入 `index.css` 并说明影响面。

## 待治理项

- 没有集中定义的自有 spacing、shadow、z-index、motion token；当前依赖 Radix 标度并夹杂局部像素值。
- Settings 仅有桌面 240px sidebar，未发现专门移动适配规则，需要实机确认。
- error state、ErrorBoundary、表单错误呈现尚未形成统一公共模式。
- ProfileSettings 使用原生 `alert`，Loading 默认英文 `Loading...`，仍有国际化不一致。
- 实际交互动效尚未系统支持 `prefers-reduced-motion`。

