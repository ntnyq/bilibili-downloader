"""Native framing, installation boundaries, refresh and cancellation tests."""

import argparse
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

from native_downloader_test import Response, SequenceOpener, task, URL


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


host = load_module('native_host', 'native-messaging-host.py')
installer = load_module('native_installer', 'install-native-host.py')
helper = host.helper
REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'


def request(kind='start', manifest=None):
    return {'version': 1, 'type': kind, 'requestId': REQUEST_ID, 'manifest': manifest or task()}


class Observer(io.BytesIO):
    def __init__(self, callback):
        super().__init__()
        self.position = 0
        self.events = []
        self.callback = callback

    def flush(self):
        end = self.tell()
        self.seek(self.position)
        event = host.read_message(self)
        self.seek(end)
        self.position = end
        self.events.append(event)
        self.callback(event)


class ProtocolTests(unittest.TestCase):
    def test_terminal_host_exits_cleanly_while_browser_stdin_remains_open(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = root / 'config.json'
            config.write_text(json.dumps({'outputDir': str(root), 'cacheDir': str(root),
                                          'ffmpeg': sys.executable}))
            bootstrap = (
                'import importlib.util, pathlib, sys; '
                'spec = importlib.util.spec_from_file_location("host", sys.argv[1]); '
                'host = importlib.util.module_from_spec(spec); spec.loader.exec_module(host); '
                'host.helper.run_task = lambda *args, **kwargs: pathlib.Path("/output/result.m4a"); '
                'sys.argv = [sys.argv[1], "--config", sys.argv[2]]; sys.exit(host.main())'
            )
            process = subprocess.Popen([sys.executable, '-c', bootstrap,
                                        str(Path(__file__).with_name('native-messaging-host.py')), str(config)],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                host.write_message(process.stdin, request())
                self.assertEqual(host.read_message(process.stdout)['type'], 'started')
                self.assertEqual(host.read_message(process.stdout)['type'], 'completed')
                self.assertEqual(process.wait(timeout=5), 0)
                self.assertNotIn(b'_enter_buffered_busy', process.stderr.read())
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
                process.stdin.close()
                process.stdout.close()
                process.stderr.close()

    def test_framing_accepts_utf8_and_rejects_invalid_lengths_duplicates(self):
        buffer = io.BytesIO()
        host.write_message(buffer, {'name': '你好'})
        self.assertEqual(host.read_message(io.BytesIO(buffer.getvalue())), {'name': '你好'})
        for data in (struct.pack('=I', 0), struct.pack('=I', 1024 * 1024 + 1),
                     b'\x01', struct.pack('=I', 10) + b'{}',
                     struct.pack('=I', 13) + b'{"a":1,"a":2}'):
            with self.subTest(data=data), self.assertRaises(helper.DownloadError):
                host.read_message(io.BytesIO(data))

    def test_refresh_allows_only_new_signatures_for_same_task(self):
        previous = task()
        refreshed = copy.deepcopy(previous)
        refreshed['inputs'][0]['urls'] = [URL.replace('first', 'fresh')]
        self.assertEqual(host.refresh_manifest(previous, request('refresh', refreshed), REQUEST_ID), refreshed)
        for field, value in [('quality', 'different'), ('filename', 'Bilibili/different.m4a')]:
            changed = copy.deepcopy(refreshed)
            changed[field] = value
            with self.assertRaises(helper.DownloadError):
                host.refresh_manifest(previous, request('refresh', changed), REQUEST_ID)
        bad = request()
        bad['outputDir'] = '/arbitrary'
        with self.assertRaises(helper.DownloadError):
            host.validate_request(bad, 'start')

    def run_host(self, runner, callback=lambda event, writer: None):
        read_fd, write_fd = os.pipe()
        with os.fdopen(read_fd, 'rb', buffering=0) as reader, os.fdopen(write_fd, 'wb', buffering=0) as writer:
            target = Observer(lambda event: callback(event, writer))
            host.write_message(writer, request())
            host.serve(reader, target, {'outputDir': '/output', 'cacheDir': '/cache', 'ffmpeg': '/ffmpeg'}, runner)
            return target.events

    def test_host_refreshes_expired_links_and_reports_progress_and_result(self):
        calls = []
        refreshed = task()
        refreshed['inputs'][0]['urls'] = [URL.replace('first', 'fresh')]

        def runner(manifest, *args, on_event, check_cancelled):
            check_cancelled()
            calls.append(manifest)
            if len(calls) == 1:
                raise helper.ExpiredMediaError('expired')
            on_event({'status': 'downloading', 'inputIndex': 1, 'inputCount': 1, 'receivedBytes': 12})
            on_event({'status': 'merging'})
            return Path('/output/Bilibili/样例.m4a')

        def respond(event, writer):
            if event['type'] == 'refreshRequired':
                host.write_message(writer, request('refresh', refreshed))

        events = self.run_host(runner, respond)
        self.assertEqual([event['type'] for event in events],
                         ['started', 'refreshRequired', 'progress', 'progress', 'completed'])
        self.assertEqual(calls[1]['inputs'][0]['urls'], refreshed['inputs'][0]['urls'])
        self.assertEqual(events[-1]['filename'], str(Path('/output/Bilibili/样例.m4a')))

    def test_host_bounds_refresh_attempts_and_never_returns_signed_urls(self):
        def runner(*args, **kwargs):
            raise helper.ExpiredMediaError('expired')

        def respond(event, writer):
            if event['type'] == 'refreshRequired':
                host.write_message(writer, request('refresh'))

        events = self.run_host(runner, respond)
        self.assertEqual(sum(event['type'] == 'refreshRequired' for event in events), 2)
        self.assertEqual(events[-1]['type'], 'failed')
        self.assertNotIn(URL, json.dumps(events))

    def test_stop_while_waiting_for_refresh_returns_failure(self):
        def runner(*args, **kwargs):
            raise helper.ExpiredMediaError('expired')

        def respond(event, writer):
            if event['type'] == 'refreshRequired':
                host.write_message(writer, {'version': 1, 'type': 'cancel', 'requestId': REQUEST_ID})

        events = self.run_host(runner, respond)
        self.assertEqual(events[-1]['type'], 'failed')
        self.assertIn('已停止', events[-1]['error'])


class CancellationTests(unittest.TestCase):
    def test_cancel_during_output_copy_never_publishes_partial_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source'
            source.write_bytes(b'x' * helper.CHUNK_BYTES * 2)
            checks = 0
            def check():
                nonlocal checks
                checks += 1
                if checks == 3:
                    raise helper.DownloadCancelled('stop')
            with self.assertRaises(helper.DownloadCancelled):
                helper.publish_output(source, root, 'Bilibili/output.mp4', check)
            self.assertEqual(list((root / 'Bilibili').iterdir()), [])

    def test_expired_http_status_is_distinguished_from_network_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(helper.ExpiredMediaError):
                helper.download_input(task()['inputs'][0], Path(folder), 0,
                                      SequenceOpener(urllib.error.HTTPError(URL, 403, '', {}, None)))

    def test_cancel_during_download_flushes_resumable_checkpoint(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            stopped = False
            def cancel_after_chunk(size):
                nonlocal stopped
                stopped = True
            def check():
                if stopped:
                    raise helper.DownloadCancelled('stop')
            with self.assertRaises(helper.DownloadCancelled):
                helper.download_input(task()['inputs'][0], folder, 0,
                                      SequenceOpener(Response(b'x' * helper.CHUNK_BYTES * 2)),
                                      cancel_after_chunk, check)
            state = helper.load_state(folder / 'input-0000.media', folder / 'input-0000.json')
            self.assertEqual(state['size'], helper.CHUNK_BYTES)
            self.assertFalse(state['complete'])

    def test_cancel_during_ffmpeg_releases_lock_without_publishing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            stopped = False
            def event(value):
                nonlocal stopped
                stopped = value['status'] == 'merging'
            def check():
                if stopped:
                    raise helper.DownloadCancelled('stop')
            with patch.object(helper, 'ffmpeg_command', return_value=[sys.executable, '-c', 'import time; time.sleep(60)']):
                with self.assertRaises(helper.DownloadCancelled), contextlib.redirect_stdout(io.StringIO()):
                    helper.run_task(task(), root, ffmpeg=sys.executable,
                                    opener=SequenceOpener(Response(b'media')), on_event=event,
                                    check_cancelled=check)
            self.assertFalse((root / '.bilibili-cache' / helper.cache_key(task()) / '.lock').exists())
            self.assertFalse((root / 'Bilibili/样例.m4a').exists())


class InstallerTests(unittest.TestCase):
    def test_manifest_scopes_access_to_exact_extension(self):
        chrome = installer.host_manifest('chrome', 'a' * 32, Path('/host'))
        firefox = installer.host_manifest('firefox', 'bilibili@example.com', Path('/host'))
        self.assertEqual(chrome['allowed_origins'], ['chrome-extension://' + 'a' * 32 + '/'])
        self.assertEqual(firefox['allowed_extensions'], ['bilibili@example.com'])
        for browser, identity in [('chrome', '*'), ('chrome', 'bad'), ('firefox', '*')]:
            with self.assertRaises(ValueError):
                installer.host_manifest(browser, identity, Path('/host'))

    def test_installation_uses_only_explicit_temporary_locations(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            args = argparse.Namespace(browser='chrome', extension_id='a' * 32,
                                      install_dir=str(root / 'native'), manifest_dir=str(root / 'manifests'),
                                      output_dir=str(root / 'output'), ffmpeg=sys.executable)
            path = installer.install(args, register=False)
            data = json.loads(path.read_text())
            self.assertTrue(Path(data['path']).is_file())
            self.assertIn('%*' if sys.platform == 'win32' else '"$@"', Path(data['path']).read_text())
            config = host.load_config(root / 'native/config-chrome.json')
            self.assertEqual(config['outputDir'], str((root / 'output').resolve()))

    def test_windows_launcher_quotes_paths_and_rejects_expansion(self):
        launcher = installer.windows_launcher(['C:\\Program Files\\Python\\python.exe', 'C:\\助手\\host.py'])
        self.assertIn(b'"C:\\Program Files\\Python\\python.exe"', launcher)
        self.assertIn(b'chcp 65001', launcher)
        for path in ('C:\\%TEMP%\\host.py', 'C:\\!VAR!\\host.py', 'C:\\bad"quote'):
            with self.assertRaises(ValueError):
                installer.windows_launcher([path])
        self.assertIn('AppData', str(installer.manifest_directory('chrome', 'win32', Path('/home'))))


if __name__ == '__main__':
    unittest.main()
