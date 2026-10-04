#!/usr/bin/env python3
"""Native Messaging transport for the existing, validated local downloader."""

import argparse
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import queue
import re
import signal
import struct
import sys
import threading


SPEC = importlib.util.spec_from_file_location('native_downloader', Path(__file__).with_name('native-downloader.py'))
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)
MAX_MESSAGE_BYTES = 1024 * 1024
MAX_REFRESHES = 2


def read_exact(source, length):
    chunks = bytearray()
    while len(chunks) < length:
        chunk = source.read(length - len(chunks))
        if not chunk:
            if not chunks:
                return None
            raise helper.DownloadError('本地通信消息不完整。')
        chunks.extend(chunk)
    return bytes(chunks)


def read_message(source):
    header = read_exact(source, 4)
    if header is None:
        return None
    length = struct.unpack('=I', header)[0]
    helper.require(0 < length <= MAX_MESSAGE_BYTES, '本地通信消息不能超过 1 MiB。')
    body = read_exact(source, length)
    helper.require(body is not None, '本地通信消息不完整。')
    try:
        message = json.loads(body, object_pairs_hook=helper.unique_object)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise helper.DownloadError('本地通信消息不是有效 JSON。') from error
    helper.require(isinstance(message, dict), '本地通信消息必须是对象。')
    return message


def write_message(target, message):
    body = json.dumps(message, ensure_ascii=True, allow_nan=False).encode('utf-8')
    helper.require(len(body) <= MAX_MESSAGE_BYTES, '本地通信响应过大。')
    target.write(struct.pack('=I', len(body)))
    target.write(body)
    target.flush()


def validate_request(message, expected_type, request_id=None):
    helper.require(message.get('type') == expected_type and message.get('version') == 1
                   and type(message.get('version')) is int,
                   '不支持的本地通信请求，请更新助手。')
    identity = message.get('requestId')
    helper.require(isinstance(identity, str)
                   and re.fullmatch(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}', identity)
                   and (request_id is None or request_id == identity), '本地任务标识不匹配。')
    helper.require(set(message) == {'type', 'version', 'requestId', 'manifest'},
                   '本地任务包含未知字段。')
    return helper.validate_manifest(message['manifest'])


def refresh_manifest(previous, message, request_id):
    current = validate_request(message, 'refresh', request_id)
    helper.require(helper.cache_key(previous) == helper.cache_key(current)
                   and previous['filename'] == current['filename']
                   and previous['job'] == current['job'],
                   '重新取流后的素材或画质发生变化，请重新发起本地任务。')
    return current


def load_config(path):
    source = Path(path)
    helper.require(helper.check_regular(source), '找不到本地助手配置，请重新安装。')
    with source.open('rb') as stream:
        data = stream.read(16385)
    helper.require(len(data) <= 16384, '本地助手配置过大。')
    try:
        config = json.loads(data, object_pairs_hook=helper.unique_object)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise helper.DownloadError('本地助手配置无效，请重新安装。') from error
    helper.require(isinstance(config, dict), '本地助手配置无效。')
    for name in ('outputDir', 'cacheDir', 'ffmpeg'):
        value = config.get(name)
        helper.require(helper.is_text(value, 4096) and Path(value).is_absolute(),
                       '本地助手必须使用安装时设置的绝对路径。')
    return config


def serve(source, target, config, runner=None):
    runner = runner or helper.run_task
    first = read_message(source)
    if first is None:
        return
    manifest = validate_request(first, 'start')
    request_id = first['requestId']
    cancelled = threading.Event()
    inbox = queue.Queue(maxsize=2)

    def emit(event):
        write_message(target, {'version': 1, 'requestId': request_id, **event})

    def check_cancelled():
        if cancelled.is_set():
            raise helper.DownloadCancelled('本地下载已停止；素材缓存已保留，可重新交接同一任务。')

    def receive():
        try:
            while True:
                message = read_message(source)
                if message is None:
                    cancelled.set()
                    return
                if (set(message) == {'version', 'type', 'requestId'}
                        and message.get('version') == 1 and type(message.get('version')) is int
                        and message.get('type') == 'cancel' and message.get('requestId') == request_id):
                    cancelled.set()
                    return
                validate_request(message, 'refresh', request_id)
                inbox.put_nowait(message)
        except (helper.DownloadError, OSError, queue.Full):
            cancelled.set()

    def stop(signum, frame):
        cancelled.set()

    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
    threading.Thread(target=receive, daemon=True).start()
    emit({'type': 'started'})
    try:
        for attempt in range(MAX_REFRESHES + 1):
            check_cancelled()
            try:
                # stdout is exclusively framed JSON. Legacy CLI output goes to stderr.
                with contextlib.redirect_stdout(sys.stderr):
                    destination = runner(
                        manifest, config['outputDir'], config['cacheDir'], config['ffmpeg'],
                        on_event=lambda event: emit({'type': 'progress', **event}),
                        check_cancelled=check_cancelled,
                    )
                emit({'type': 'completed', 'filename': str(destination),
                      'quality': manifest['quality']})
                return
            except helper.ExpiredMediaError:
                if attempt == MAX_REFRESHES:
                    raise helper.DownloadError('素材链接刷新后仍然不可用，缓存已保留；请检查登录状态后重试。')
                emit({'type': 'refreshRequired'})
                while True:
                    check_cancelled()
                    try:
                        message = inbox.get(timeout=0.2)
                        break
                    except queue.Empty:
                        continue
                manifest = refresh_manifest(manifest, message, request_id)
    except (helper.DownloadError, OSError) as error:
        detail = str(error) if isinstance(error, helper.DownloadError) else '本地文件操作失败，请检查目录权限及磁盘空间。'
        emit({'type': 'failed', 'error': detail})


def main():
    parser = argparse.ArgumentParser(description='由浏览器启动的 Bilibili Native Messaging 助手。')
    parser.add_argument('--config', required=True)
    args, _browser_arguments = parser.parse_known_args()
    if os.name == 'nt':
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    try:
        # A daemon blocked on BufferedReader can crash CPython during shutdown.
        # FileIO has no buffered-reader lock and keeps terminal responses safe.
        source = os.fdopen(sys.stdin.fileno(), 'rb', buffering=0, closefd=False)
        serve(source, sys.stdout.buffer, load_config(args.config))
    except (helper.DownloadError, OSError, ValueError, RecursionError) as error:
        detail = str(error) if isinstance(error, helper.DownloadError) else '本地助手通信失败。'
        print(detail, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
