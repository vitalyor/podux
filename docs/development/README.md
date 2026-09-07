# Podux 开发设计文档

本目录记录当前 `main` 基线的可验证设计，为后续开发和 Agent 改动提供入口：

- [系统架构](architecture.md)：进程内组件、分层、请求/启动链路、构建部署和 CI 边界。
- [数据库设计](database-design.md)：全部业务 collection、关系、规则、索引、生命周期和实现差异。
- [UI 规范](ui-spec.md)：React 业务前端的主题、真实 token、布局和组件复用规则。

## 事实来源与适用范围

文档基于仓库代码和配置，而不是目标架构推测。数据库以 `migrations/*.go` 为首要事实来源，并用 domain model、repository、application service、HTTP handler 和 `site/src/` 调用交叉校验；UI 以 `site/src/index.css`、主题上下文、布局、公共组件和页面为准；构建与部署以 `go.mod`、package manifest、`main.go`、CI、`build/build.sh`、Docker 文件为准。

“已验证现状”描述当前实现；“现状差异/待确认”及“待治理”表示代码无法闭环或尚无统一约束，不能据此擅自改变 schema 或行为。

## 同步更新触发条件

- 组件边界、启动流程、自定义路由、后台任务、持久化或部署方式改变时更新架构文档。
- migration、collection rule/index/relation、字段映射或保留/删除策略改变时更新数据库文档。
- 主题配置、design token、布局断点、公共组件、交互状态、国际化或可访问性约束改变时更新 UI 文档。
- 上述变更同时影响 Agent 工作约定时更新仓库根目录 `AGENT.md`。
