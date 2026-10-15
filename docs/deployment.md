# 本地运行与部署

[返回项目首页](../README.md) · [使用教程](usage.md)

## 环境要求

- Node.js 22.13 或以上版本，npm。
- 可公开访问的 Emby 服务器及有效账号。
- 运行机器能够连接 Emby、其域名解析服务及最终视频来源。

当前项目包含服务端 API 和视频代理，不能只把静态文件放到 GitHub Pages。GitHub 仓库存放源码，运行应用仍需要启动开发服务或部署 Worker。

## 开发启动

```bash
git clone https://github.com/liyongliao/emby-flow.git
cd emby-flow
npm ci
npm run dev -- --port 8787
```

打开 http://127.0.0.1:8787 。macOS 可双击根目录 `启动.command`，首次启动会安装依赖并等待服务就绪后打开浏览器。

仓库不包含测试服务器、登录凭证、`.env` 或原站点项目 ID。无需把 Emby 账号写入配置文件；启动后在界面填写。

## 构建与本地生产预览

```bash
npm test
npm run typecheck
npm run build
npm start -- --port 8787
```

`build` 生成 `dist/client` 和 `dist/server`；`start` 使用 Wrangler 在本机运行生成的 Worker，默认只监听 `127.0.0.1`。这适合本地生产检查，不会自动发布公网服务。

## Cloudflare Workers 自行部署

本项目使用 Cloudflare Vite 插件生成 Worker 配置。需要你自己的 Cloudflare 账号及部署权限，先完成上面的构建，再运行：

```bash
npx wrangler login
npx wrangler deploy --config dist/server/wrangler.json --name emby-flow
```

按 Wrangler 的实际输出确认域名、账号和部署结果。不要上传别人机器的 `.wrangler`、`.sites-runtime`、登录令牌或环境文件。

`.openai/hosting.json` 仅保留构建使用的空存储声明，无原托管站点的项目标识。已有的 Sites 构建辅助文件保留在源码中，但自行运行和上述 Worker 部署无需原项目的私有凭证。

## 网络与下载成本

服务端承担 Emby API、图片和媒体流请求。下载采用流式转发，不在应用服务器永久保存整个视频，但代理视频仍会消耗网络流量、请求配额和运行资源。大量下载前请确认自己的部署平台限制及费用。

当前代码所有运行方式都会拒绝内网、回环、链路本地和保留地址，并验证重定向目标。此版本不支持直接连接 `localhost`、`192.168.*` 或类似局域网 Emby 地址。

域名解析使用 DoH 查询公共 DNS。反向代理需要放行视频流、Range 请求，并避免对超长媒体响应进行整体缓冲。最终视频源的网络可达性、签名和请求头限制也会影响结果。

## 浏览器选择

| 场景 | 建议 |
| --- | --- |
| 批量保存到指定文件夹 | 桌面 Chrome / Edge，localhost 或 HTTPS |
| 不支持文件夹权限 | 使用浏览器逐个保存，并允许多文件下载 |
| 高清 / HEVC / MKV | 先用自动引擎，再按情况切兼容或增强兼容 |
| 高要求 HDR / Dolby Vision / Atmos | 使用支持该片源的外部播放器和设备；浏览器不保证完整支持 |

## 验证范围

自动化测试覆盖队列顺序与去重、暂停、Range 正常续传、Range 被忽略、错误偏移、短流、登录续期，以及地址规范化和 HTTPS / HTTP 检测。测试不需要任何真实账号。

```bash
npm test
npm run typecheck
npm run build
```

仓库教程图片在实际应用界面中使用虚构演示资料生成；不代表下载过截图中的大型文件，也不代表任何特定浏览器都能正确解码所有片源。
