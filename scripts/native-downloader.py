#!/usr/bin/env python3
"""Download an exported Bilibili task with Python 3.10+ and local FFmpeg."""

import argparse
import contextlib
import hashlib
import http.client
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


DOMAINS = ('bilivideo.com', 'bilivideo.cn', 'bilivideo.net', 'akamaized.net', 'hdslb.com')
CHUNK_BYTES = 1024 * 1024
CHECKPOINT_BYTES = 8 * CHUNK_BYTES
MAX_MANIFEST_BYTES = 1024 * 1024
MAX_INPUT_BYTES = 1024 ** 4
SAFE_INTEGER = 2 ** 53 - 1


class DownloadError(Exception):
    """A safe, user-visible error which never contains signed CDN URLs."""


class ExpiredMediaError(DownloadError):
    """All available attempts failed and at least one signed URL has expired."""


class DownloadCancelled(DownloadError):
    """The caller requested a clean stop, retaining verified media checkpoints."""


def require(condition, message):
    if not condition:
        raise DownloadError(message)


def is_integer(value, minimum=0, maximum=SAFE_INTEGER):
    return type(value) is int and minimum <= value <= maximum


def is_text(value, maximum, minimum=1):
    return isinstance(value, str) and minimum <= len(value) <= maximum


def validate_url(value):
    require(is_text(value, 16384), '素材链接无效。')
    require(value.isascii() and not any(ord(char) <= 32 or ord(char) == 127 for char in value),
            '素材链接包含无效字符。')
    try:
        url = urllib.parse.urlsplit(value)
        valid = (url.scheme == 'https' and not url.username and not url.password
                 and url.port in (None, 443) and not url.fragment
                 and re.fullmatch(r'[a-z0-9.-]+', url.hostname or '')
                 and any(url.hostname == domain or (url.hostname or '').endswith('.' + domain)
                         for domain in DOMAINS))
    except ValueError:
        valid = False
    require(valid, '只接受 HTTPS Bilibili 素材 CDN 链接（443 端口）。')
    return value


def validate_filename(value, kind):
    require(is_text(value, 1024), '输出文件名无效。')
    parts = value.split('/')
    require(2 <= len(parts) <= 4 and parts[0] == 'Bilibili', '输出路径必须位于 Bilibili 目录下。')
    for part in parts:
        try:
            encoded = part.encode('utf-8')
        except UnicodeError as error:
            raise DownloadError('输出路径包含无效 Unicode 字符。') from error
        require(bool(part) and part not in ('.', '..') and part == part.strip(' .')
                and not re.search(r'[<>:"/\\|?*\x00-\x1f\x7f]', part)
                and len(encoded) <= 244
                and not re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', part, re.I),
                '输出路径包含不安全的文件名。')
    require(parts[-1].endswith('.m4a' if kind == 'audio' else '.mp4'), '输出文件扩展名与素材类型不符。')
    return parts


def validate_manifest(task):
    require(isinstance(task, dict) and type(task.get('version')) is int and task['version'] == 1,
            '不支持此本地任务版本，请更新助手或重新导出。')
    require(is_integer(task.get('createdAt'), 1), '任务创建时间无效。')
    job = task.get('job')
    require(isinstance(job, dict) and is_text(job.get('bvid'), 32)
            and re.fullmatch(r'(?:BV[0-9A-Za-z]{10}|av\d+)', job['bvid'])
            and is_integer(job.get('cid'), 1) and is_integer(job.get('page'), 1)
            and is_text(job.get('title'), 10000, 0), '视频任务信息无效。')
    kind = task.get('kind')
    require(kind in ('dash', 'audio', 'progressive'), '不支持的素材类型。')
    require(is_text(task.get('quality'), 1000), '任务画质无效。')
    validate_filename(task.get('filename'), kind)
    inputs = task.get('inputs')
    require(isinstance(inputs, list) and 1 <= len(inputs) <= 512, '素材数量无效。')
    require((kind != 'dash' or len(inputs) == 2) and (kind != 'audio' or len(inputs) == 1),
            '音视频素材数量与类型不符。')
    ids = set()
    for item in inputs:
        require(isinstance(item, dict) and is_text(item.get('id'), 4096), '素材身份无效。')
        require(item['id'] not in ids, '素材身份重复。')
        ids.add(item['id'])
        bandwidth = item.get('bandwidth')
        require(type(bandwidth) in (int, float) and 0 <= bandwidth <= SAFE_INTEGER
                and math.isfinite(bandwidth), '素材码率无效。')
        require(isinstance(item.get('urls'), list) and 1 <= len(item['urls']) <= 16,
                '素材线路数量无效。')
        for url in item['urls']:
            validate_url(url)
    return task


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'JSON 包含重复字段。')
        result[key] = value
    return result


def load_manifest(path):
    with Path(path).open('rb') as source:
        data = source.read(MAX_MANIFEST_BYTES + 1)
    require(len(data) <= MAX_MANIFEST_BYTES, '任务文件不能超过 1 MiB。')
    try:
        task = json.loads(data, object_pairs_hook=unique_object)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise DownloadError('任务文件不是有效 JSON。') from error
    return validate_manifest(task)


def cache_key(task):
    identity = [task['job']['bvid'], task['job']['cid'], task['kind'],
                task['quality'], [item['id'] for item in task['inputs']]]
    return hashlib.sha256(json.dumps(identity, ensure_ascii=True).encode()).hexdigest()


def ensure_directory(root, parts=()):
    current = root
    for part in parts:
        current = current / part
        if not current.exists() and not current.is_symlink():
            current.mkdir(mode=0o700)
        require(not current.is_symlink() and current.is_dir(), '目录包含符号链接或不是文件夹。')
    return current


def check_regular(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1,
            '缓存文件不是普通独立文件，已停止以保护本地文件。')
    return True


@contextlib.contextmanager
def open_private(path, truncate=False):
    check_regular(path)
    flags = os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(path, flags, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, '不能写入此缓存文件。')
        if truncate:
            os.ftruncate(fd, 0)
        with os.fdopen(fd, 'r+b') as output:
            fd = None
            yield output
    finally:
        if fd is not None:
            os.close(fd)


def write_metadata(path, data):
    check_regular(path)
    fd, temporary = tempfile.mkstemp(prefix='.checkpoint-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            json.dump(data, output, ensure_ascii=True)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load_state(path, metadata, check_cancelled=lambda: None):
    if not check_regular(path) or not check_regular(metadata):
        return None
    try:
        with metadata.open('rb') as source:
            data = source.read(16385)
        if len(data) > 16384:
            return None
        state = json.loads(data)
        if (not isinstance(state, dict) or state.get('version') != 1
                or not is_integer(state.get('size'), 1, MAX_INPUT_BYTES)
                or not isinstance(state.get('complete'), bool)
                or not is_integer(state.get('total'), 0, MAX_INPUT_BYTES)
                or not isinstance(state.get('sha256'), str)
                or not re.fullmatch(r'[a-f0-9]{64}', state['sha256'])
                or not isinstance(state.get('resource'), str)
                or not isinstance(state.get('etag'), str)
                or path.stat().st_size < state['size']
                or (state['total'] and state['size'] > state['total'])
                or (state['complete'] and state['size'] != state['total'])):
            return None
        digest = hashlib.sha256()
        with path.open('rb') as source:
            remaining = state['size']
            while remaining:
                check_cancelled()
                chunk = source.read(min(CHUNK_BYTES, remaining))
                if not chunk:
                    return None
                digest.update(chunk)
                remaining -= len(chunk)
        return state if digest.hexdigest() == state['sha256'] else None
    except (ValueError, UnicodeError, RecursionError):
        return None


def resource_key(value):
    url = urllib.parse.urlsplit(value)
    # Signed query parameters can change while the stable manifest ID stays fixed.
    return hashlib.sha256((url.hostname + url.path).encode()).hexdigest()


def strong_etag(value):
    return value if isinstance(value, str) and re.fullmatch(r'"[\x21\x23-\x7e]{0,1024}"', value) else ''


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        validate_url(new_url)
        # A Range validator belongs to one resource; never carry it across a redirect.
        require(not request.has_header('Range'), '续传地址发生重定向，需从头下载此素材。')
        return super().redirect_request(request, response, code, message, headers, new_url)


def open_remote(url, headers):
    validate_url(url)
    opener = urllib.request.build_opener(SafeRedirect())
    try:
        return opener.open(urllib.request.Request(url, headers=headers), timeout=30)
    except urllib.error.HTTPError as error:
        if error.code == 304:
            return error
        raise


def content_length(headers):
    value = headers.get('Content-Length')
    if value is None:
        return 0
    require(bool(re.fullmatch(r'\d{1,13}', value)), '服务器返回无效的素材长度。')
    length = int(value)
    require(0 < length <= MAX_INPUT_BYTES, '素材长度必须大于 0 且不超过 1 TiB。')
    return length


def download_input(item, folder, index, opener=open_remote, progress=lambda size: None,
                   check_cancelled=lambda: None):
    path = folder / f'input-{index:04d}.media'
    metadata = folder / f'input-{index:04d}.json'
    last_error = '所有素材线路均不可用。'
    expired = False
    for url in item['urls']:
        validate_url(url)
        state = load_state(path, metadata, check_cancelled)
        resumable = bool(state and strong_etag(state['etag'])
                         and state['resource'] == resource_key(url)
                         and state['size'] < state['total'])
        revalidate = bool(state and state['complete'] and strong_etag(state['etag'])
                          and state['resource'] == resource_key(url))
        # One conditional request, followed by at most one fresh request per CDN.
        for fresh in range(2 if resumable or revalidate else 1):
            offset = state['size'] if resumable and fresh == 0 else 0
            conditional = revalidate and fresh == 0
            headers = {'Referer': 'https://www.bilibili.com/',
                       'User-Agent': 'Mozilla/5.0 BilibiliLocalDownloader/1.0',
                       'Accept-Encoding': 'identity'}
            if offset:
                headers.update({'Range': f'bytes={offset}-', 'If-Range': state['etag']})
            if conditional:
                headers['If-None-Match'] = state['etag']
            try:
                check_cancelled()
                with contextlib.closing(opener(url, headers)) as response:
                    validate_url(response.geturl())
                    etag = strong_etag(response.headers.get('ETag'))
                    if response.status == 304:
                        require(conditional and etag == state['etag']
                                and resource_key(response.geturl()) == state['resource'],
                                '已缓存素材的服务器校验失败。')
                        with open_private(path) as cached:
                            cached.truncate(state['size'])
                        progress(state['size'])
                        return path
                    require(response.headers.get('Content-Encoding', 'identity').lower() == 'identity',
                            '服务器返回压缩素材，无法安全校验字节范围。')
                    length = content_length(response.headers)
                    if response.status == 206 and offset:
                        match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',
                                             response.headers.get('Content-Range', ''))
                        valid = bool(match and int(match[1]) == offset
                                     and int(match[2]) == state['total'] - 1
                                     and int(match[3]) == state['total']
                                     and length == state['total'] - offset
                                     and etag == state['etag']
                                     and resource_key(response.geturl()) == state['resource'])
                        require(valid, '服务器续传校验失败，将从头下载此素材。')
                        total = state['total']
                    else:
                        require(response.status == 200 and not response.headers.get('Content-Range'),
                                f'服务器未返回完整素材（HTTP {response.status}）。')
                        offset = 0
                        total = length
                    if total:
                        require(shutil.disk_usage(folder).free >= total - offset + CHUNK_BYTES,
                                '缓存磁盘剩余空间不足。')
                    with open_private(path, truncate=offset == 0) as output:
                        digest = hashlib.sha256()
                        if offset:
                            output.truncate(offset)
                            while chunk := output.read(CHUNK_BYTES):
                                check_cancelled()
                                digest.update(chunk)
                        size = offset
                        checkpoint_size = offset

                        def checkpoint(complete=False):
                            output.flush()
                            os.fsync(output.fileno())
                            write_metadata(metadata, {
                                'version': 1, 'size': size, 'total': size if complete else total,
                                'complete': complete, 'sha256': digest.hexdigest(),
                                'etag': etag, 'resource': resource_key(response.geturl()),
                            })

                        try:
                            while chunk := response.read(CHUNK_BYTES):
                                check_cancelled()
                                require(size + len(chunk) <= (total or MAX_INPUT_BYTES),
                                        '素材长度超过服务器声明，已停止。')
                                output.write(chunk)
                                digest.update(chunk)
                                size += len(chunk)
                                progress(size)
                                if size - checkpoint_size >= CHECKPOINT_BYTES:
                                    checkpoint()
                                    checkpoint_size = size
                            require(size > 0 and (not total or size == total), '素材传输不完整，可再次运行以重试。')
                            checkpoint(complete=True)
                        except BaseException:
                            checkpoint()
                            raise
                    return path
            except urllib.error.HTTPError as error:
                expired = expired or error.code in (401, 403, 410)
                last_error = f'素材服务器返回 HTTP {error.code}。'
                error.close()
            except DownloadCancelled:
                raise
            except DownloadError as error:
                last_error = str(error)
            except (urllib.error.URLError, http.client.HTTPException, TimeoutError, ConnectionError) as error:
                last_error = f'素材网络读取中断（{type(error).__name__}）。'
            if not offset and not conditional:
                break
    error_type = ExpiredMediaError if expired else DownloadError
    raise error_type(last_error + ' 请在扩展中重新导出同一任务，使用相同缓存目录重试。')


def ffmpeg_command(executable, task, inputs, output):
    command = [executable, '-hide_banner', '-loglevel', 'error', '-nostdin', '-n']
    formats = 'mov,flv'
    if task['kind'] == 'progressive':
        listing = output.parent / 'inputs.txt'
        with open_private(listing, truncate=True) as target:
            target.write(''.join(f"file '{item.name}'\n" for item in inputs).encode())
        command += ['-protocol_whitelist', 'file', '-format_whitelist', 'concat,' + formats,
                    '-f', 'concat', '-safe', '1', '-i', str(listing),
                    '-map', '0:v:0', '-map', '0:a:0?']
    else:
        for item in inputs:
            command += ['-protocol_whitelist', 'file', '-format_whitelist', formats, '-i', str(item)]
        command += ['-map', '0:a:0', '-vn'] if task['kind'] == 'audio' else ['-map', '0:v:0', '-map', '1:a:0']
    return command + ['-c', 'copy', '-movflags', '+faststart', str(output)]


def publish_output(source, root, filename, check_cancelled=lambda: None):
    check_cancelled()
    parts = filename.split('/')
    folder = ensure_directory(root, parts[:-1])
    name = Path(parts[-1])
    fd, staging_name = tempfile.mkstemp(prefix='.bilibili-output-', suffix='.part', dir=folder)
    staging = Path(staging_name)
    try:
        with os.fdopen(fd, 'wb') as output:
            with source.open('rb') as stream:
                class CheckedReader:
                    def read(self, size):
                        check_cancelled()
                        return stream.read(size)
                shutil.copyfileobj(CheckedReader(), output, CHUNK_BYTES)
            output.flush()
            os.fsync(output.fileno())
        for index in range(10000):
            check_cancelled()
            destination = folder / (name.name if index == 0 else f'{name.stem} ({index}){name.suffix}')
            try:
                if os.name == 'nt':
                    # Windows rename fails if the destination already exists.
                    os.rename(staging, destination)
                else:
                    # Publish an already-fsynced file atomically without replacement.
                    os.link(staging, destination)
                return destination
            except FileExistsError:
                continue
            except OSError as error:
                raise DownloadError('无法安全发布输出文件，缓存已保留；请检查权限，或选择支持硬链接的本地文件系统。') from error
        raise DownloadError('同名文件过多，请更换输出目录。')
    finally:
        # A successfully published POSIX file temporarily has two hard links.
        try:
            if staging.exists() and not staging.is_symlink():
                staging.unlink()
        except OSError:
            print('输出临时文件清理失败，可在助手退出后手动删除 .bilibili-output-*.part。', file=sys.stderr)


def run_task(task, output_dir, cache_dir=None, ffmpeg=None, opener=open_remote,
             on_event=lambda event: None, check_cancelled=lambda: None):
    validate_manifest(task)
    check_cancelled()
    executable = shutil.which(ffmpeg or 'ffmpeg')
    require(bool(executable), '找不到 FFmpeg，请先安装并加入 PATH，或用 --ffmpeg 指定路径。')
    executable = str(Path(executable).resolve())
    output_dir = Path(output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_dir = output_dir.resolve()
    cache_root = Path(cache_dir).expanduser() if cache_dir else output_dir / '.bilibili-cache'
    cache_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if cache_dir is None:
        require(not cache_root.is_symlink(), '默认缓存目录不能是符号链接。')
    cache_root = cache_root.resolve()
    folder = ensure_directory(cache_root, (cache_key(task),))
    print(f'缓存目录：{folder}', flush=True)
    lock = folder / '.lock'
    try:
        lock.mkdir(mode=0o700)
    except FileExistsError as error:
        raise DownloadError('此任务已在运行或上次被强制终止；确认助手已退出后，手动删除该任务缓存中的 .lock 目录。') from error
    temporary = None
    saved = False
    try:
        inputs = []
        for index, item in enumerate(task['inputs']):
            check_cancelled()
            on_event({'status': 'downloading', 'inputIndex': index + 1,
                      'inputCount': len(task['inputs']), 'receivedBytes': 0})
            last_report = 0

            def progress(size):
                nonlocal last_report
                if time.monotonic() - last_report >= 1:
                    print(f'素材 {index + 1}/{len(task["inputs"])}：{size / 1024 / 1024:.1f} MiB', flush=True)
                    on_event({'status': 'downloading', 'inputIndex': index + 1,
                              'inputCount': len(task['inputs']), 'receivedBytes': size})
                    last_report = time.monotonic()

            inputs.append(download_input(item, folder, index, opener, progress, check_cancelled))
        print('正在无损封装，请等待 FFmpeg 完成……', flush=True)
        check_cancelled()
        on_event({'status': 'merging'})
        require(shutil.disk_usage(folder).free > sum(path.stat().st_size for path in inputs) + CHUNK_BYTES,
                '合并所需缓存磁盘空间不足。')
        fd, temporary_name = tempfile.mkstemp(prefix='merged-', suffix='.m4a' if task['kind'] == 'audio' else '.mp4', dir=folder)
        os.close(fd)
        temporary = Path(temporary_name)
        temporary.unlink()
        with tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(ffmpeg_command(executable, task, inputs, temporary),
                                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                       stderr=errors)
            started = time.monotonic()
            try:
                while process.poll() is None:
                    check_cancelled()
                    require(time.monotonic() - started < 3600,
                            'FFmpeg 封装超过 1 小时，素材缓存已保留。')
                    try:
                        process.wait(timeout=0.2)
                    except subprocess.TimeoutExpired:
                        pass
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
            require(process.returncode == 0 and temporary.is_file() and temporary.stat().st_size > 0,
                    'FFmpeg 封装失败，素材缓存已保留；请检查 FFmpeg 版本与可用空间。')
        require(shutil.disk_usage(output_dir).free > temporary.stat().st_size,
                '输出磁盘空间不足，素材缓存已保留。')
        check_cancelled()
        on_event({'status': 'saving'})
        destination = publish_output(temporary, output_dir, task['filename'], check_cancelled)
        saved = True
        print(f'已保存：{destination}', flush=True)
        # Success removes only the known inputs/metadata created by this helper.
        for index in range(len(inputs)):
            for suffix in ('media', 'json'):
                path = folder / f'input-{index:04d}.{suffix}'
                try:
                    if check_regular(path):
                        path.unlink()
                except (DownloadError, OSError):
                    print('文件已保存，但部分素材缓存未能清理。', file=sys.stderr)
        listing = folder / 'inputs.txt'
        try:
            if check_regular(listing):
                listing.unlink()
        except (DownloadError, OSError):
            print('文件已保存，但封装清单未能清理。', file=sys.stderr)
        return destination
    finally:
        for path, is_directory in ((temporary, False), (lock, True)):
            try:
                if path and is_directory:
                    path.rmdir()
                elif path and check_regular(path):
                    path.unlink()
            except (DownloadError, OSError):
                print('文件已保存，但临时缓存未能清理。' if saved else '部分临时缓存未能清理，请退出助手后检查缓存目录。', file=sys.stderr)
        try:
            folder.rmdir()
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser(description='使用本地 FFmpeg 下载扩展导出的 .bili.json 任务。')
    parser.add_argument('task', help='扩展导出的 .bili.json 文件')
    parser.add_argument('--output-dir', default='.', help='保存目录（默认当前目录）')
    parser.add_argument('--cache-dir', help='缓存目录（默认保存目录下的 .bilibili-cache）')
    parser.add_argument('--ffmpeg', help='本地 FFmpeg 可执行文件路径（默认从 PATH 查找）')
    args = parser.parse_args()
    try:
        run_task(load_manifest(args.task), args.output_dir, args.cache_dir, args.ffmpeg)
    except KeyboardInterrupt:
        print('\n已停止；素材缓存已保留，再次运行同一命令可重试。', file=sys.stderr)
        return 130
    except (DownloadError, OSError) as error:
        detail = str(error) if isinstance(error, DownloadError) else f'本地文件操作失败（{type(error).__name__}）。'
        print(detail, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
