# 本地 FFmpeg 下载助手

日期：2026-10-05。

浏览器内封装仍有 512 MiB 总输入上限。超过上限或希望把素材缓存放到本地磁盘时，在下载中心为视频 / 音频任务导出 `.bili.json`，再用本仓库的 Python 助手下载与无损封装。助手直接流式写入磁盘，不把整个视频读入内存。

本文记录手动命令行流程：导出时重新获取当前账号实际可用的素材链接；独立运行时完成结果不会回写扩展队列。导出任务本身不会把原任务标记为已保存，也无需 `nativeMessaging` 权限。需要一键交接、进度回传和地址刷新时，使用 [原生助手集成](native-bridge.md)。两种方式共用下载内核，均不读取浏览器 Cookie、不提供本地 HTTP 服务。

## 使用

需要 Python 3.10 或更高版本和已安装的 FFmpeg。助手只使用 Python 标准库，不需要 `pip install`。Python 和 FFmpeg 安装信息分别见 [Python 下载](https://www.python.org/downloads/)与 [FFmpeg 下载](https://ffmpeg.org/download.html)。

在仓库根目录运行，按实际位置替换任务文件和保存目录：

```sh
python3 --version
ffmpeg -version
python3 scripts/native-downloader.py /path/task.bili.json --output-dir /path/downloads
```

Windows 可在 PowerShell 中使用：

```powershell
py -3 scripts/native-downloader.py "C:\Users\you\Downloads\task.bili.json" --output-dir "D:\Downloads"
```

如果 FFmpeg 不在 `PATH` 中，可显式指定。这个路径只能由本地命令提供，任务 JSON 不能选择可执行文件：

```sh
python3 scripts/native-downloader.py /path/task.bili.json --output-dir /path/downloads --ffmpeg /path/to/ffmpeg
```

默认将缓存写入保存目录下的 `.bilibili-cache`。可使用 `--cache-dir /path/cache` 指定其他磁盘。最终文件放在保存目录下的 `Bilibili/`，沿用任务的文件名与目录快照。同名文件自动加 ` (1)` 等序号，不覆盖原文件。先在输出目录写入随机 `.part` 临时文件并刷盘，再原子发布最终名称；macOS / Linux 的输出文件系统需支持硬链接，Windows 使用不覆盖已有文件的重命名。如果进程被强制杀死，可能留下 `.part` 文件，但不会把复制到一半的内容发布为 MP4 / M4A。

封装使用 `-c copy`，支持 DASH 视频加 AAC 音频、仅音频 M4A，以及按顺序连接 progressive 分段。FFmpeg 只接收助手生成的本地素材路径和固定参数，不接收 JSON 内的命令或额外参数。封装超时为 1 小时。磁盘需容纳素材、封装临时文件和保存副本，空间不足时会保留素材缓存并报错。

## 中断、续传与链接过期

按 Ctrl+C 停止后，重复相同命令即可重试。助手根据视频、CID、素材类型、画质和素材身份定位缓存；素材身份变化会使用新的缓存目录，不能混用旧素材。

- 每份缓存保存已提交字节数和 SHA-256 摘要。重试先校验磁盘中已提交前缀的长度和完整摘要；缺失或损坏会重新下载该份素材。强制退出留下的未提交尾部在前缀校验通过后丢弃，从最近的有效检查点续传。
- 只有同一 CDN 主机及资源路径、强 ETag 和已知总长度都符合时，才发送 `Range` 与 `If-Range`。新的签名参数不改变资源路径；CDN / 路径变化则从头下载这一份素材。
- `206` 的起点、终点、总长、响应长度和 ETag 必须全部符合。`200` 表示重新下载完整素材，绝不会追加到旧前缀。`416` 或校验不符会尝试一次完整请求。
- 即使素材已完整缓存，也会用强 ETag 发出 `If-None-Match`。只有返回携带相同 ETag 的 `304` 才复用；缺少可靠校验器或服务器素材发生变化时会重新下载。
- 没有强 ETag、服务器不支持 Range、缓存损坏或素材变更时，重试可能从头下载。没有承诺任意 CDN 都能续传。

链接过期时，回到扩展为同一任务重新导出 `.bili.json`，用新文件再次执行命令，并保持相同的保存 / 缓存目录。助手不会自动登录或刷新链接。任务文件包含有时效的素材地址，应当像下载链接一样保存；助手的错误信息不会打印这些地址。

成功保存后自动删除本任务的已知素材与元数据缓存。失败或取消保留缓存。如果进程被强制杀死，可能留下 `.lock` 目录；确认对应助手已退出后，只删除终端显示的本任务缓存目录中的 `.lock`，再重试。弃用的缓存可以在助手全部退出后手动删除；脚本没有清空任意目录的功能。

续传使用 [HTTP 条件请求与字节范围](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-range)。强 ETag 的可靠性依赖服务器正确实现；本地 SHA-256 负责检测磁盘缓存损坏，不作为远端提供的内容签名。

## 输入与本地文件边界

任务文件上限 1 MiB，协议为 `version: 1`。助手重新检查任务身份、素材数量、输出扩展名、相对路径和 CDN 地址。素材链接只允许固定 CDN 域名范围内的 HTTPS 443 地址，重定向也重新校验；不接受任意下载地址、用户提供的请求头或 Cookie。每份素材的长度保护上限为 1 TiB，实际可用大小还受磁盘空间限制。

缓存文件名由助手固定生成，输出路径的每一层拒绝路径穿越、Windows 保留名和符号链接。缓存拒绝符号链接及硬链接；输出采用排他发布。并行运行同一任务会被任务锁拒绝。`--output-dir`、`--cache-dir` 和 `--ffmpeg` 是用户在本地命令中主动选择的路径。

FFmpeg 禁止网络输入协议，并限制媒体解复用器为 MP4/MOV、FLV 和助手生成的 concat 清单。该限制减少额外资源访问，不是操作系统沙箱；仍应使用维护中的 FFmpeg。参数依据 [FFmpeg 协议白名单](https://ffmpeg.org/ffmpeg-protocols.html#Protocol-Options)。

## 验证

```sh
python3 -m unittest discover -s scripts -p '*_test.py'
```

本轮在 macOS 运行通过 25 项测试，覆盖非法任务和重定向、条件 Range、忽略 Range 的 `200`、错位或变化的 `206`、`416`、弱 / 缺失 ETag、CDN 切换、完整缓存重验证、缓存损坏、检查点恢复、压缩或过长响应、符号链接拒绝、同名输出保护、中断保存的原子发布和保存后的缓存清理失败。

两项集成测试使用本地 FFmpeg 生成短 H.264 / AAC 素材，以模拟 HTTPS 响应进入真实助手，再通过真实 FFmpeg 完成 DASH / M4A / 两段 progressive 封装；`ffprobe` 确认输出轨道，并验证缓存清理失败不影响保存结果。没有 FFmpeg 或 ffprobe 时集成测试会明确跳过。测试不访问真实 CDN，不证明账号授权、真实 CDN 续传或超大文件耗时；Windows 命令与路径规则已覆盖设计，尚未在 Windows 主机实测。

## 浏览器方案与原生集成

本地助手是超过浏览器内存边界的出口。OPFS 和 WORKERFS 可减少浏览器输入缓冲，但 [WORKERFS 仅提供 File / Blob 的只读访问](https://emscripten.org/docs/api_reference/Filesystem-API.html#workerfs)，当前 FFmpeg 封装输出仍需要内存；不能据此宣称已消除 WASM 限制。[ffmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq/)也记录了其大文件限制。

Native Messaging 集成现已提供，使用可选权限、独立注册脚本、Chrome 扩展 origin 白名单和 Firefox 扩展 ID 白名单；浏览器不会替扩展安装原生宿主。本仓库开发过程不自动注册宿主或修改用户系统注册信息，安装命令和平台边界见 [集成说明](native-bridge.md)。参考 [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)与 [Firefox Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)。
