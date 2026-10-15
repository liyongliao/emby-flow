# 第三方声明

Emby Flow 原创代码使用根目录 MIT 许可。下列依赖及分发文件继续遵守其自身许可，不能因本项目采用 MIT 而替换。

| 组件 | 分发位置 | 许可与来源 |
| --- | --- | --- |
| libmedia AVPlayer 1.3.1 | `public/libmedia/` | LGPL-3.0；完整许可见 `COPYING.LGPLv3`，源码及构建信息见 `NOTICE.txt` |
| Movi Player 0.4.1 | `public/movi/` | Apache-2.0 及其第三方许可，见 `LICENSE` 和 `NOTICE.txt`；包含 FFmpeg LGPL 组件，按上游许可及重新链接要求分发 |
| hls.js | `public/hls.min.js` | Apache-2.0，见 `public/HLS-LICENSE.txt` |
| Sites 构建插件 | `build/sites-vite-plugin.ts` | 见 `build/sites-vite-plugin.LICENSE` |
| shadcn Tailwind 样式 | `vendor/` | 见 `vendor/shadcn-tailwind-4.13.0.LICENSE.md` |
| npm 依赖 | 见 `package.json`、`package-lock.json` | 各包随附的许可 |

播放器 JS / Wasm 均保持独立文件，可以替换或从对应版本的源代码重新构建；未合并进项目原创代码。对应源代码、版本、下载及构建入口保留在各自 NOTICE 中。所分发解码模块不包含 GPL x264/x265 编码器。

教程截图中的封面与演示画面为本项目制作，不使用真实账号、第三方电影海报或影视画面。
