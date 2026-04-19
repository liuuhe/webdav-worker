# Cloudflare WebDAV Worker

[English](README.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/liuuhe/webdav-worker)

基于 Cloudflare Workers、R2、KV 和 Durable Object 的路径式 WebDAV 服务，并带一个重做后的 React 管理后台，适合统一管理多个应用的同步目录。

## 功能

- 固定路径式 WebDAV 地址，例如 `https://webdav.example.com/obsidian-notes/`
- 每个应用使用独立存储目录
- 每个应用可选开启 WebDAV Basic Auth
- 支持带锁语义的 WebDAV 流程，包括 `LOCK`、`UNLOCK`、`COPY`、`MOVE` 和 `PROPFIND`
- 基于 React + shadcn 的管理后台地址为 `https://<你的域名>/manage`
- 不需要自建服务器，直接运行在 Cloudflare Workers 上

## WebDAV 兼容性

- 支持路径式文件同步所需的 Class 1 WebDAV 能力
- 支持 `LOCK` 和 `UNLOCK` 这类 Class 2 锁语义
- 支持 `Depth: infinity` 的集合锁，可保护整棵子目录
- 在 `PROPFIND` 中暴露锁信息
- `MOVE` 会保留锁状态，`COPY` 不会复制锁

## 路由模型

- WebDAV 地址：`https://<你的域名>/<应用路径>/`
- 管理后台：`https://<你的域名>/manage`
- 首次初始化：在后台设置页中使用 `ADMIN_TOKEN` 创建正式管理员密码

示例：

- `https://webdav.example.com/obsidian-notes/`
- `https://webdav.example.com/manage`

## 技术结构

- 运行时：Cloudflare Workers
- 文件存储：Cloudflare R2
- 配置镜像：Cloudflare KV
- 串行化后台写入：Durable Object
- 后台前端：位于 [admin/](admin) 的 React + Vite + shadcn/ui
- 主入口：[src/index.ts](src/index.ts)
- Worker 配置：[wrangler.jsonc](wrangler.jsonc)

## Cloudflare 快捷链接

- Deploy to Cloudflare 按钮文档：
  https://developers.cloudflare.com/workers/tutorials/deploy-button
- 创建 R2 bucket：
  https://developers.cloudflare.com/r2/buckets/create-buckets/
- 创建 KV namespace：
  https://developers.cloudflare.com/kv/get-started/
- Worker secrets：
  https://developers.cloudflare.com/workers/configuration/secrets/
- 自定义域名：
  https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Wrangler 配置参考：
  https://developers.cloudflare.com/workers/wrangler/configuration/

## 一键部署

这个仓库现在已经带了可直接使用的 Deploy to Cloudflare 按钮：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/liuuhe/webdav-worker)

它能做的事：

- 从这个公开仓库直接导入 Cloudflare
- 根据 `wrangler.jsonc` 创建受支持的绑定
- 让部署者自己填写 Worker 名称和资源名称

仍然需要手动处理的部分：

- `ADMIN_TOKEN` 仍然需要作为 secret 单独填写
- 自定义域名仍然需要在 Cloudflare 里单独绑定
- 真正使用的 bucket 名和 KV ID 仍然属于部署者自己，不会沿用本仓库占位值

## 如何部署你自己的 WebDAV 服务

有三种实际可用的部署方式。

### 方案 A：直接从这个公开仓库部署

1. 点击上面的 Deploy to Cloudflare 按钮。
2. 在 Cloudflare 里确认导入的项目和绑定。
3. 设置一个足够长的 `ADMIN_TOKEN`，作为首次后台初始化的 bootstrap token。
4. 完成部署。
5. 打开 `https://<workers-默认域名>/manage`，先用 `ADMIN_TOKEN` 设置管理员密码，再创建第一个应用。
6. 如果不想使用 `workers.dev` 域名，再绑定自己的域名。

### 方案 B：使用 Wrangler 手动部署

#### 1. 安装依赖

```powershell
npm install
npm --prefix admin install
```

#### 2. 登录 Cloudflare

```powershell
wrangler login
```

#### 3. 创建 R2 bucket

请使用你自己的全局唯一 bucket 名称。

```powershell
wrangler r2 bucket create your-webdav-bucket
```

#### 4. 创建 KV namespace

```powershell
wrangler kv namespace create WEBDAV_CONFIG
```

如果你希望远程开发时使用独立的 preview namespace：

```powershell
wrangler kv namespace create WEBDAV_CONFIG --preview
```

#### 5. 修改 `wrangler.jsonc`

你需要替换这些值：

- `name`
- `r2_buckets[0].bucket_name`
- `kv_namespaces[0].id`
- 如果创建了 preview namespace，再补上 `kv_namespaces[0].preview_id`

如果后面要直接在配置里挂自定义域名，可以加上：

```jsonc
{
  "routes": [
    {
      "pattern": "webdav.example.com",
      "custom_domain": true
    }
  ]
}
```

#### 6. 设置 bootstrap token

这个值建议使用足够长的随机字符串，它会在 `/manage` 的首次初始化表单里使用一次，用来设置正式管理员密码。

```powershell
wrangler secret put ADMIN_TOKEN
```

#### 7. 部署

```powershell
npm run deploy
```

#### 8. 打开后台

如果你暂时使用默认的 Workers 域名：

- `https://<你的-worker>.<你的-subdomain>.workers.dev/manage`

如果你后来绑定了自己的域名：

- `https://webdav.example.com/manage`

### 方案 C：使用 GitHub Actions 自动部署

仓库现在已经带了 `.github/workflows/deploy.yml`，可以在推送到 `main` 时自动部署。

启用前需要先在 GitHub 仓库里配置这些 Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_WORKER_NAME`
- `CF_R2_BUCKET`
- `CF_KV_NAMESPACE_ID`
- `CF_KV_PREVIEW_ID`
- `CF_ADMIN_TOKEN`

执行流程如下：

1. GitHub Actions 拉取代码后会执行 `npm ci` 和 `npm --prefix admin install`。
2. 用公开仓库里的 `wrangler.jsonc` 模板配合 GitHub Secrets 生成临时的 `wrangler.prod.jsonc`。
3. 先对这份生产配置执行测试、类型检查和 `wrangler deploy --dry-run`。
4. 验证通过后，再用 Wrangler CLI 和临时 secrets 文件做正式部署。
5. 工作流会把 `CF_ADMIN_TOKEN` 同步为 Worker 的 `ADMIN_TOKEN` secret。

注意：

- 本地 `git commit` 本身不会触发部署。
- `git push` 到 `main` 后会同时触发 CI 和自动部署工作流。
- 自定义域名仍然需要在 Cloudflare 里管理，不放在这个公开模板里。

## 自定义域名

如果你希望用自己的域名或子域名提供 WebDAV 服务：

1. 先把域名托管到 Cloudflare。
2. 在 Cloudflare 控制台里给 Worker 添加 Custom Domain，或者在 `wrangler.jsonc` 中通过 `routes` + `"custom_domain": true` 配置。
3. 如果改了 Wrangler 配置，重新部署一次。
4. 等待 DNS 和证书签发完成。

推荐形式：

- Worker 域名：`webdav.example.com`
- 每个应用的 WebDAV 地址：`https://webdav.example.com/<应用路径>/`

## 后台使用方式

部署完成后，打开：

- `https://<你的域名>/manage`

在后台里你可以：

- 用 `ADMIN_TOKEN` 完成首次管理员初始化
- 使用管理员密码登录，并通过会话访问后台
- 在安全设置里轮换管理员密码
- 创建应用
- 分配固定访问路径
- 分配存储目录
- 设置可选的 WebDAV 用户名和密码
- 编辑备注
- 删除应用
- 删除应用时可选是否同时清空存储数据

## 认证模型

每个应用可以是两种模式：

- 仅 URL 访问：
  用户名和密码都留空
- Basic Auth：
  给这个应用单独设置 WebDAV 用户名和密码

示例：

- 仅 URL 访问：
  `https://webdav.example.com/obsidian-notes/`
- Basic Auth：
  地址不变，但 WebDAV 客户端需要携带用户名和密码

## 本地开发

先根据 `.dev.vars.example` 创建本地 `.dev.vars`：

```env
ADMIN_TOKEN=replace-with-a-long-random-string
```

先安装后台前端依赖：

```powershell
npm --prefix admin install
```

在启动 Worker 本地开发前，先构建后台静态资源：

```powershell
npm run build:admin
```

然后运行 Worker：

```powershell
npm run dev
```

## 发布建议

如果你要发布你自己的版本：

- 不要把 `.dev.vars` 提交到 Git
- 把占位 bucket、KV ID 都替换成你自己的
- 如果要做 Deploy to Cloudflare 按钮，使用你自己的公开仓库地址
- 不要提交生产环境 secrets
- 如果启用 GitHub Actions 自动部署，把生产配置放在 GitHub Secrets 里，不要写进仓库
