# Podux Agent 开发指南

## 项目定位与技术栈

Podux 是集中管理 frpc 服务器配置、代理、连接状态、网络延迟和运行日志的 Web 管理平台。当前代码基线为 Go 1.25.5、PocketBase 0.35.0 和内嵌的 frp 0.68.0；业务前端位于 `site/`，使用 React 19、TypeScript 5.9、Vite 7、Radix Themes 3、Tailwind CSS 4。`docs/` 是 VitePress 1 文档站，其 Vue 依赖不代表业务前端使用 Vue。

版本号及依赖以 `go.mod`、`site/package.json` 和 `docs/package.json` 为准，不要从文档示例反推版本。

## 目录地图

| 路径 | 职责 |
| --- | --- |
| `main.go` | PocketBase 启动与依赖装配、hook/自定义路由、监控调度、静态资源服务入口 |
| `internal/domain/` | server/proxy 领域模型和 repository 接口 |
| `internal/application/` | dashboard、frpc、importer、monitoring、proxy、server、system、version 等用例服务 |
| `internal/infrastructure/persistence/` | 基于 PocketBase/dbx 的 repository 实现 |
| `internal/interfaces/http/` | 自定义 HTTP handler 和鉴权中间件 |
| `migrations/` | PocketBase collection schema 的唯一版本化事实来源 |
| `pkg/` | build info、响应、通用类型和工具 |
| `site/` | React 业务前端；可直接调用 PocketBase collection API，也调用 `/api/*` 自定义接口 |
| `docs/` | 独立 VitePress 文档站 |
| `pb_public/` | `site/dist` 的复制目标；由 `main.go` 的 `go:embed` 打入 Go 二进制，不提交 |
| `pb_data/` | PocketBase SQLite、上传文件及 `frpc/<server-id>` 日志/证书运行数据，不提交 |
| `build/`、`deploy/` | 多平台构建脚本和 Docker 部署文件 |

完整设计入口见 [开发设计文档](docs/development/README.md)。

## 本地开发与验证

前置条件：`go.mod` 所要求的 Go 1.25.5、Node.js 20（CI 基线）和 pnpm 10（CI 基线）。

```bash
# 后端（先确保 pb_public/index.html 存在；完整前端构建见下）
go run . serve

# 业务前端；Vite 将 /api 代理到 127.0.0.1:8090
pnpm --dir site install --frozen-lockfile
pnpm --dir site run dev

# 文档站
pnpm --dir docs install --frozen-lockfile
pnpm --dir docs run docs:dev
```

提交前执行：

```bash
pnpm --dir site install --frozen-lockfile
pnpm --dir site run lint
pnpm --dir site run build
pnpm --dir docs install --frozen-lockfile
pnpm --dir docs run docs:build

# Go 工具加载 main package 前必须先满足 go:embed
rm -rf pb_public
mkdir -p pb_public
cp -R site/dist/. pb_public/
go vet ./...
go test ./...
go build ./...
```

`build/build.sh` 会构建前端、复制 `site/dist` 到 `pb_public`、执行 `go mod tidy` 并构建平台包；它会改写生成目录和可能调整模块文件，不应作为普通文档或局部改动的首选验证命令。

## 修改约定

- 后端：依赖方向保持 `interfaces -> application -> domain`，基础设施实现 domain repository；在 `main.go` 统一装配。handler 负责传输层校验/响应，业务编排进入 application service。
- 前端：保持 React + TypeScript；页面沿用 `index.tsx`（状态/编排）、`*.view.tsx`（展示）的现有分工，优先复用 `site/src/components/` 和 Radix Themes。API 请求复用 `site/src/lib/api.ts` 或 `pocketbase.ts`。
- migration：schema 变更必须新增可审查、可回滚的 `migrations/*.go`，以 migration 为事实来源；不得直接修改运行中 SQLite 或通过管理 UI 攚改生产 schema 来替代 migration。
- API：自定义路由放在 `internal/interfaces/http/` 并默认使用 `requireAuth`；PocketBase collection rule 也必须同步审查。改变路径、请求/响应、鉴权或 collection 字段时同步更新相关设计文档。
- 样式：遵循 [UI 规范](docs/development/ui-spec.md)，优先 Radix token、组件 props 和 Tailwind utility；不要新增另一套无依据的品牌 token。
- 国际化：用户可见文案同时更新 `site/src/locales/zh.json`、`en.json`，通过 `react-i18next` 的 `t()` 使用；避免新增裸字符串。
- 文档：实现变化触发 [架构](docs/development/architecture.md)、[数据库](docs/development/database-design.md) 或 [UI](docs/development/ui-spec.md) 同步更新；文档事实要链接到仓库路径或注明“待确认”。

## 安全边界

- 不提交密钥、token、证书、用户数据、`pb_data/`、`pb_public/`、`site/dist/`、`docs/.vitepress/dist/` 或构建包。
- `fh_servers.auth`、TLS 私钥、用户密码/tokenKey 等为敏感数据；禁止记录原值。涉及 SSE 查询参数 token 时避免日志、复制和外泄。
- 不用手工数据库操作代替 migration；删除关系当前均未配置级联，删除父记录前必须评估孤儿数据。
- 不做与任务无关的全仓格式化，不覆盖工作树中已有改动。
- 接口、鉴权规则或数据结构变更必须同时更新测试/调用方与本目录设计文档。

## 提交前检查清单

- [ ] `git diff` 只包含目标范围，未混入运行数据、构建产物或无关格式化。
- [ ] Go vet/test/build、业务前端 lint/build、文档 build 均执行并如实记录结果。
- [ ] 新增或修改的 API、collection、关系、rule 已同步数据库/架构文档。
- [ ] UI 复用了公共组件，双主题、760px 移动布局、中英文和基本键盘操作已检查。
- [ ] Markdown 相对链接有效，Mermaid 名称与代码一致且可渲染。
- [ ] 敏感值未进入代码、日志、截图或提交历史。
