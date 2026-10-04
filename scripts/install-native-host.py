#!/usr/bin/env python3
"""Explicit, user-run Native Messaging registration for desktop browsers."""

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys


HOST_NAME = 'com.ntnyq.bilibili_downloader'


def manifest_directory(browser, system=sys.platform, home=None):
    home = Path(home or Path.home())
    if system == 'darwin':
        names = {'chrome': 'Google/Chrome', 'chromium': 'Chromium', 'firefox': 'Mozilla'}
        return home / 'Library/Application Support' / names[browser] / 'NativeMessagingHosts'
    if system.startswith('linux'):
        if browser == 'firefox':
            return home / '.mozilla/native-messaging-hosts'
        return home / '.config' / ('google-chrome' if browser == 'chrome' else 'chromium') / 'NativeMessagingHosts'
    if system == 'win32':
        return home / 'AppData/Local/BilibiliDownloader/NativeMessagingHosts' / browser
    raise ValueError('自动安装支持 macOS / Linux / Windows。')


def windows_launcher(command):
    if any(re.search(r'["%!\r\n]', argument) for argument in command):
        raise ValueError('Windows 安装路径不能包含双引号、百分号或感叹号。')
    return ('@echo off\r\nchcp 65001 >nul\r\n' + ' '.join(f'"{argument}"' for argument in command) + ' %*\r\n').encode('utf-8')


def register_windows(browser, manifest_path):
    # This runs only when the user invokes the installer on Windows.
    import winreg
    vendor = {'chrome': 'Google\\Chrome', 'chromium': 'Chromium', 'firefox': 'Mozilla'}[browser]
    registry_path = f'Software\\{vendor}\\NativeMessagingHosts\\{HOST_NAME}'
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, registry_path) as key:
        winreg.SetValueEx(key, '', 0, winreg.REG_SZ, str(manifest_path.resolve()))


def host_manifest(browser, extension_id, launcher):
    if browser == 'firefox':
        if not re.fullmatch(r'(?:\{[0-9a-fA-F-]{36}\}|[^\s@/\\]+@[^\s@/\\]+)', extension_id):
            raise ValueError('Firefox 需要扩展清单 browser_specific_settings.gecko.id 中的固定 ID。')
        allowed = {'allowed_extensions': [extension_id]}
    else:
        if not re.fullmatch(r'[a-p]{32}', extension_id):
            raise ValueError('Chromium 扩展 ID 必须是扩展管理页面中的 32 位 a-p 字母。')
        allowed = {'allowed_origins': [f'chrome-extension://{extension_id}/']}
    return {'name': HOST_NAME, 'description': 'Bilibili local download and FFmpeg helper',
            'path': str(launcher), 'type': 'stdio', **allowed}


def write_file(path, content, mode=0o600):
    if path.is_symlink() or (path.exists() and (not path.is_file() or path.stat().st_nlink != 1)):
        raise ValueError(f'不能替换符号链接或特殊文件：{path}')
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags, mode)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(content)
    path.chmod(mode)


def install(args, register=True):
    if sys.version_info < (3, 10):
        raise ValueError('需要 Python 3.10 或更高版本。')
    manifest_dir = Path(args.manifest_dir).expanduser() if args.manifest_dir else manifest_directory(args.browser)
    install_dir = Path(args.install_dir).expanduser().absolute()
    output_dir = Path(args.output_dir).expanduser().absolute()
    ffmpeg = shutil.which(args.ffmpeg or 'ffmpeg')
    if not ffmpeg:
        raise ValueError('找不到 FFmpeg，请先安装，或使用 --ffmpeg 指定可执行文件。')
    launcher = install_dir / f'launch-{args.browser}{".cmd" if sys.platform == "win32" else ".sh"}'
    manifest = host_manifest(args.browser, args.extension_id, launcher)
    for directory in (install_dir, manifest_dir, output_dir):
        if directory.is_symlink():
            raise ValueError(f'安装目录不能是符号链接：{directory}')
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    source = Path(__file__).parent
    for name in ('native-downloader.py', 'native-messaging-host.py'):
        write_file(install_dir / name, (source / name).read_bytes())
    config_path = install_dir / f'config-{args.browser}.json'
    config = {'outputDir': str(output_dir.resolve()),
              'cacheDir': str(output_dir.resolve() / '.bilibili-cache'),
              'ffmpeg': str(Path(ffmpeg).resolve())}
    write_file(config_path, json.dumps(config, ensure_ascii=True, indent=2).encode())
    command = [str(Path(sys.executable).resolve()), str(install_dir / 'native-messaging-host.py'),
               '--config', str(config_path)]
    launch_content = (windows_launcher(command) if sys.platform == 'win32'
                      else ('#!/bin/sh\nexec ' + shlex.join(command) + ' "$@"\n').encode())
    write_file(launcher, launch_content, 0o700)
    manifest_path = manifest_dir / f'{HOST_NAME}.json'
    write_file(manifest_path, json.dumps(manifest, ensure_ascii=True, indent=2).encode())
    if sys.platform == 'win32' and register:
        register_windows(args.browser, manifest_path)
    return manifest_path


def main():
    parser = argparse.ArgumentParser(description='安装当前用户的 Bilibili 本地助手（不会下载 Python / FFmpeg）。')
    parser.add_argument('--browser', choices=('chrome', 'chromium', 'firefox'), required=True)
    parser.add_argument('--extension-id', required=True)
    parser.add_argument('--output-dir', default=str(Path.home() / 'Downloads'))
    parser.add_argument('--ffmpeg')
    parser.add_argument('--install-dir', default=str(Path.home() / '.local/share/bilibili-downloader/native'))
    parser.add_argument('--manifest-dir', help='覆盖浏览器默认清单目录（自定义配置或打包测试用）')
    args = parser.parse_args()
    try:
        path = install(args)
        print(f'本地助手已注册：{path}\n请在扩展下载中心点击「交给本地助手」。')
    except (OSError, ValueError) as error:
        print(f'安装失败：{error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
