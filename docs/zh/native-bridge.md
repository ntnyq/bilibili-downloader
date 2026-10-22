# 本地助手直连

下载中心的「交给本地助手」使用浏览器 Native Messaging 启动 Python / FFmpeg，
直接显示素材下载、封装、保存结果。完成任务会写入下载历史；输出文件位于安装时
指定的目录。浏览器不需要把整个视频放入 WASM 内存。

## 安装

需要 Python 3.10+ 和可执行的 FFmpeg。安装器不会下载依赖；请先安装这些工具。
在仓库根目录运行以下命令，替换扩展 ID。这里只提供安装脚本，构建扩展不会自动安装。

Chrome：从 `chrome://extensions` 的开发者模式界面复制当前扩展 ID。

```sh
python3 scripts/install-native-host.py --browser chrome --extension-id 扩展ID
```

Chromium 使用 `--browser chromium`。Firefox 使用扩展清单
`browser_specific_settings.gecko.id` 的固定 ID：

```sh
python3 scripts/install-native-host.py --browser firefox --extension-id bilibili-downloader@ntnyq
```

请以实际构建清单的 ID 为准，不要使用 Firefox 为网页分配的临时 UUID。
若扩展 ID 因重新加载或更名而改变，重新运行对应浏览器的安装命令以更新精确的允许列表。

默认输出目录为用户的 `Downloads`。可通过 `--output-dir` 设置其他目录，或通过
`--ffmpeg` 指定 FFmpeg 的绝对路径。安装器记录当前 Python 和 FFmpeg 的绝对路径，
浏览器无需继承终端 PATH。路径含空格时请加引号。

```sh
python3 scripts/install-native-host.py --browser chrome --extension-id 扩展ID --output-dir "$HOME/Movies" --ffmpeg /opt/homebrew/bin/ffmpeg
```

Windows 使用 `py -3` 替代 `python3`。安装器生成 `.cmd` 启动器、启用 UTF-8 和二进制
消息流，并在当前用户 `HKCU\Software\Google\Chrome\NativeMessagingHosts`、
`HKCU\Software\Chromium\NativeMessagingHosts` 或
`HKCU\Software\Mozilla\NativeMessagingHosts` 注册对应浏览器；不需要管理员权限。
Windows 安装路径不能包含 `%`、`!` 或双引号。Windows 实机验证需在 Windows 环境完成。

macOS / Linux 会将清单写入对应浏览器的当前用户目录。助手程序默认复制到
`~/.local/share/bilibili-downloader/native`，之后移动源码仓库不影响已安装助手。
升级助手时重新运行安装命令。`--install-dir` 和 `--manifest-dir` 可用于自定义安装或
隔离测试；不要把测试清单目录误当作浏览器实际注册位置。

## 使用与恢复

1. 在下载中心暂停视频 / 音频任务，或选择失败、已取消、已完成的任务。
2. 点击「交给本地助手」，按浏览器提示授予可选的本地通信权限。
3. 保持下载中心打开。切换队列筛选不会中断任务，关闭页面会停止当前任务。
4. 查看素材字节数、封装阶段和最终文件路径。完成记录也可在下载历史中查看。

签名链接返回 401 / 403 / 410 且备用线路也失败时，助手会要求浏览器按原任务重新
取流，最多刷新两次。浏览器和助手都校验视频、分 P、画质、媒体身份和输出名没有
变化；只续传通过哈希、强 ETag、资源身份和 Range 校验的缓存。画质改变、身份不符
或反复过期时停止并保留缓存，不拼接未经验证的媒体。网络暂时断开时可再次交接同一
任务恢复；如果服务器不能证明原资源未变，则重新下载对应素材。

主动取消会请求助手保存检查点、停止 FFmpeg 并释放任务锁。网络读取最多等待约
30 秒才能响应取消。浏览器崩溃或系统强制终止可能来不及清理锁；此时先确认助手及
FFmpeg 已退出，再删除错误消息对应缓存任务下的 `.lock` 目录，然后重试。

## 通信与权限

只有扩展页面申请的 `nativeMessaging` 可选权限可连接助手；内容脚本不能直连。
浏览器清单精确限制扩展 ID，不使用通配符。后台通过任务 ID 与本次运行 token 验证
进度和完成消息，取消后的旧运行无法覆盖新状态。助手不接收 Cookie、任意请求头、
任意输出目录或任意 FFmpeg 命令，也不启动 HTTP 服务。

消息通过 stdin / stdout 传递，以原生字节序的 32 位长度加 UTF-8 JSON 编码，单条
限制 1 MiB。stdout 只写协议消息，诊断输出到 stderr。下载沿用手动助手对 HTTPS
CDN、重定向、路径穿越、符号链接、缓存哈希和原子保存的校验。

协议依据 [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
及 [Firefox Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)。

## 卸载

移除浏览器用户目录中名为 `com.ntnyq.bilibili_downloader.json` 的清单，并删除安装
目录中的助手文件。Windows 同时删除对应浏览器 HKCU 注册表下的
`com.ntnyq.bilibili_downloader` 键。卸载不会删除已下载的文件；缓存目录是安装时
输出目录中的 `.bilibili-cache`，可在没有运行任务时自行清理。

开发验证命令：`pnpm test:native`、`pnpm test`、`pnpm typecheck`。
原生协议和安装路径测试使用临时目录，不会注册到开发者正在使用的浏览器。
