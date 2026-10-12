# VidFetch

B 站 / 抖音公开视频下载网页，原生 JavaScript + Cloudflare Workers，无数据库、视频存储或付费解析服务。

## 本地运行

需要 Node.js 22 或更高版本。

```sh
npm install
npm run dev
```

打开终端显示的地址。检查：`npm test`、`npm run check`。

## 免费部署到 Cloudflare

1. 注册 Cloudflare 账号，保持 Workers Free 套餐。
2. 运行 `npx wrangler login`，通过浏览器登录。
3. 推荐运行 `npx wrangler secret put DOWNLOAD_SECRET`，输入至少 32 字节的随机字符串，启用签名代理下载。本地可在不提交的 `.dev.vars` 设置该变量。
4. 运行 `npm run deploy`，访问输出的 workers.dev 地址。

也可连接 GitHub 到 Cloudflare Workers Builds：构建命令 `npm run build && npm run check && npm test`，部署命令 `npm run deploy`，在设置中添加 `DOWNLOAD_SECRET` 密钥。部署目标是 Workers。

未设置密钥时仅提供视频直链，B 站直链可能受防盗链限制。代理流式转发，不缓冲整个视频；签名下载链接 30 分钟内有效。

免费 Worker 当前每日 100,000 次请求，每次 10ms CPU；静态资源请求免费。网络等待不计 CPU，但大页面解析可能超限。额度以官方文档为准：
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/

## 支持与限制

- B 站 BV / av、b23.tv 短链接、分 P，请求最高档并显示实际返回的清晰度。完整视频直接下载；更高的 DASH 档位提供画面和音频，并支持浏览器本地无损合并 MP4（下载总量上限 256MB，超限可分别下载）。多片段仍分别下载，不在 Worker 转码或合并。本地合并需设置 DOWNLOAD_SECRET。
- 抖音公开视频长链接、短链接、分享文本；优先使用移动端 Feed 主/备用接口（无需 Cookie），只匹配输入视频编号，失败后回退分享页及 Cookie 详情接口。按真实分辨率与码率排序，每个分辨率优先选择 H.264 兼容版本，再按码率选择；优先展示兼容版本，HEVC 明确标注需兼容播放器。图集、直播暂不支持，不承诺去水印。
- 平台可能拦截 Cloudflare 出口 IP，抖音可能返回验证页面或更改数据结构，不能保证所有链接成功。不绕过登录、验证码、会员或付费限制。
- 下载地址过期请重新解析；直链打开播放器时可通过播放器菜单保存。
- 下载代理限定媒体域名、验证签名并检查所有跳转。公开上线建议在 Cloudflare 添加速率限制或访问控制，防止耗尽免费额度。
- 仅下载您拥有权利或已获授权的内容。

## 抖音高清验证

获得视频媒体编号后，额外请求官方播放接口的高清版本，并读取最多 256KB 的 MP4 文件头确认真实画面尺寸、编码与音频轨道。只有核验成功的文件才加入高清选项，不直接用 ratio 参数或作品元数据标为 1080P。探测失败则保留其他可用版本。

2026-10-12：`7691293847204138267` 高清播放接口实测返回 1920×1080、H.264 视频及 AAC 音频，文件大小 17,705,152 字节（16.9MB）。此前实现只读取 Feed 默认流，漏掉了这个高清版本；现已支持。尚未在 Cloudflare 出口实测。

## Cookie 与高清解析

网页展开“解析设置”，填写当前链接所属平台的 Cookie；切换平台时请更换 Cookie。只保留在当前页面内存中，通过本站接口发送到对应平台，不写入存储，不在响应中返回，不打印到日志。点击“清除 Cookie”或关闭页面即可清除。凭证不会随请求跨主机跳转发送，也不会传给视频 CDN。

获取方法：登录平台网页，F12 → 网络 → Fetch/XHR，刷新视频并选择视频详情请求，在请求标头中复制 Cookie 的值。抖音需包含 UIFID 和有效会话；B 站需包含 SESSDATA。不要将 Cookie 发到聊天、截图或提交到代码仓库，只在自己信任的 HTTPS 站点使用。有效 Cookie 也可能因出口 IP 风控失效。

## 开源参考与依赖

解析流程参考了以下项目并按 Workers 环境重新实现，没有直接复制其源代码：
- [yt-dlp Bilibili extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py)：真实格式识别、DASH 音视频分离。
- [seetheworldwithme/douyin-downloader](https://github.com/seetheworldwithme/douyin-downloader)：会话详情接口、aid 回退、媒体地址选择。
- [ldsoy/douyin-video-parser](https://github.com/ldsoy/douyin-video-parser)：Workers 分享页与详情接口回退。
- [ucmao/media-parser](https://github.com/ucmao/media-parser/blob/main/docs/parsers/douyin.md)：移动端 Feed 主/备用公开视频通道。接口调用按文档重新实现，未复制源代码。
- [Evil0ctal/Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API)：更完整的抖音解析方案，依赖浏览器会话管理和服务端运行环境，未整套移植至免费 Worker。

浏览器本地合并使用 **Mediabunny 1.61.3（MPL-2.0）**，不修改其代码。构建时复制官方浏览器包并附带许可证，源代码见 https://github.com/Vanilagy/mediabunny 。所有媒体处理在浏览器进行，无额外付费解析接口。

## 验证范围

30 项自动测试覆盖输入安全、分 P、最高档请求、DASH、Cookie/UIFID、aid 回退、跨主机凭证隔离、Feed 精确 ID 匹配和备用回退、H.264 兼容选择、MP4 真实分辨率检查、高清解析、签名下载、字节范围以及本地合并后的轨道与压缩数据保留。合并测试使用媒体容器样本，不验证真实视频播放。

2026-10-12：本机实测 B 站 `BV1xx411c7mD` 返回 **1080P 含声音**视频流；`BV176ac62EAA` 匿名合并流为 720P，高清受平台权限限制。抖音 `7689691017376746790` 经 Feed 接口 **无需 Cookie 解析成功**，读取视频片段返回 206、video/mp4 和正确 MP4 文件头。此前 Web 详情接口的 403 不足以判断 Cookie 失效，已修正提示。尚未验证整个视频播放或 Cloudflare 出口 IP 下的兼容性。


## B 站云端 412

B 站请求统一使用桌面客户端信息；视频信息接口返回 412 时尝试匹配同一视频的公开页面，旧播放接口被拒绝时尝试动态 WBI 签名接口。回退失败会明确提示服务器访问限制，不把错误直接归因于 Cookie 过期。上述兼容逻辑不能保证消除 Cloudflare 出口 IP 风控。
