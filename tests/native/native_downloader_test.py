"""Boundary tests plus real FFmpeg stream-copy checks; no live network calls."""

import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request


SCRIPTS_DIR = Path(__file__).resolve().parents[2] / 'scripts'
SPEC = importlib.util.spec_from_file_location('native_downloader', SCRIPTS_DIR / 'native-downloader.py')
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)
URL = 'https://test.bilivideo.com/video.m4s?token=first'


def task(kind='audio'):
    count = 2 if kind == 'dash' else 1
    return {
        'version': 1, 'createdAt': 1791158400000,
        'job': {'bvid': 'BV1xx411c7mD', 'cid': 123, 'page': 1, 'title': '样例'},
        'kind': kind, 'quality': '1080P' if kind != 'audio' else 'AAC',
        'filename': 'Bilibili/样例.m4a' if kind == 'audio' else 'Bilibili/样例.mp4',
        'inputs': [{'id': f'stream-{index}', 'urls': [URL], 'bandwidth': 1000} for index in range(count)],
    }


class Response(io.BytesIO):
    def __init__(self, body, status=200, headers=None, url=URL, interrupt=False):
        super().__init__(body)
        self.status = status
        self.headers = headers if headers is not None else {'Content-Length': str(len(body)), 'ETag': '"first"'}
        self.url = url
        self.interrupt = interrupt

    def geturl(self):
        return self.url

    def read(self, size=-1):
        chunk = super().read(size)
        if not chunk and self.interrupt:
            raise ConnectionResetError('fixture disconnected')
        return chunk


class SequenceOpener:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, url, headers):
        self.requests.append((url, headers))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class ManifestTests(unittest.TestCase):
    def test_valid_modes_and_url_refresh_preserve_cache_identity(self):
        for kind in ('audio', 'dash', 'progressive'):
            helper.validate_manifest(task(kind))
        original = task()
        updated = copy.deepcopy(original)
        updated['inputs'][0]['urls'] = [URL.replace('first', 'refreshed')]
        updated['filename'] = 'Bilibili/新名称.m4a'
        updated['createdAt'] += 1
        self.assertEqual(helper.cache_key(original), helper.cache_key(updated))
        updated['inputs'][0]['id'] = 'different-representation'
        self.assertNotEqual(helper.cache_key(original), helper.cache_key(updated))

    def test_reject_untrusted_urls(self):
        for url in ('http://test.bilivideo.com/a', 'https://bilivideo.com.evil.test/a',
                    'https://user@test.bilivideo.com/a', 'https://localhost/a',
                    'file:///etc/passwd', 'https://test.bilivideo.com:8443/a',
                    'https://test.bilivideo.com/a#fragment', URL + '\n'):
            with self.subTest(url=url), self.assertRaises(helper.DownloadError):
                helper.validate_url(url)

    def test_reject_traversal_windows_names_and_kind_mismatch(self):
        for filename in ('../escape.m4a', '/Bilibili/a.m4a', 'Bilibili/../a.m4a',
                         'Bilibili/C:\\a.m4a', 'Bilibili/CON.m4a', 'Bilibili/a.m4a ',
                         'Bilibili//a.m4a', 'Bilibili/a.mp4'):
            with self.subTest(filename=filename), self.assertRaises(helper.DownloadError):
                helper.validate_filename(filename, 'audio')

    def test_reject_wrong_version_counts_and_bandwidth(self):
        variants = []
        for key, value in [('version', True), ('version', 2), ('createdAt', -1), ('inputs', [])]:
            changed = task()
            changed[key] = value
            variants.append(changed)
        changed = task('dash')
        changed['inputs'].pop()
        variants.append(changed)
        changed = task()
        changed['inputs'][0]['bandwidth'] = float('nan')
        variants.append(changed)
        for changed in variants:
            with self.assertRaises(helper.DownloadError):
                helper.validate_manifest(changed)

    def test_manifest_size_and_duplicate_fields(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'task.json'
            path.write_text('{"version":1,"version":1}')
            with self.assertRaises(helper.DownloadError):
                helper.load_manifest(path)
            path.write_bytes(b' ' * (helper.MAX_MANIFEST_BYTES + 1))
            with self.assertRaises(helper.DownloadError):
                helper.load_manifest(path)

    def test_redirect_rejects_non_cdn_and_range_redirect(self):
        redirect = helper.SafeRedirect()
        request = urllib.request.Request(URL)
        with self.assertRaises(helper.DownloadError):
            redirect.redirect_request(request, None, 302, '', {}, 'https://localhost/private')
        request.add_header('Range', 'bytes=3-')
        with self.assertRaises(helper.DownloadError):
            redirect.redirect_request(request, None, 302, '', {}, 'https://backup.bilivideo.com/a')


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)
        self.item = task()['inputs'][0]

    def seed(self, payload=b'abc', total=6, etag='"first"', complete=False):
        path = self.folder / 'input-0000.media'
        path.write_bytes(payload)
        helper.write_metadata(self.folder / 'input-0000.json', {
            'version': 1, 'size': len(payload), 'total': total, 'etag': etag,
            'resource': helper.resource_key(URL), 'complete': complete,
            'sha256': hashlib.sha256(payload).hexdigest(),
        })
        return path

    def test_conditional_range_matches_saved_bytes_and_accepts_fresh_signature(self):
        self.seed()
        self.item['urls'] = [URL.replace('first', 'fresh')]
        opener = SequenceOpener(Response(b'def', 206, {'Content-Length': '3', 'Content-Range': 'bytes 3-5/6', 'ETag': '"first"'}))
        path = helper.download_input(self.item, self.folder, 0, opener)
        self.assertEqual(path.read_bytes(), b'abcdef')
        self.assertEqual(opener.requests[0][1]['Range'], 'bytes=3-')
        self.assertEqual(opener.requests[0][1]['If-Range'], '"first"')
        self.assertEqual(opener.requests[0][1]['Accept-Encoding'], 'identity')

    def test_range_ignored_200_replaces_existing_prefix(self):
        self.seed()
        opener = SequenceOpener(Response(b'xyzxyz'))
        self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'xyzxyz')

    def test_invalid_range_or_etag_restarts_without_concatenation(self):
        for content_range, etag in [('bytes 2-5/6', '"first"'), ('bytes 3-5/7', '"first"'), ('bytes 3-5/6', '"changed"')]:
            self.seed()
            opener = SequenceOpener(
                Response(b'def', 206, {'Content-Length': '3', 'Content-Range': content_range, 'ETag': etag}),
                Response(b'UVWXYZ'))
            self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'UVWXYZ')
            self.assertNotIn('Range', opener.requests[1][1])

    def test_416_restarts_input(self):
        self.seed()
        opener = SequenceOpener(urllib.error.HTTPError(URL, 416, 'range', {}, None), Response(b'abcdef'))
        self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'abcdef')
        self.assertNotIn('Range', opener.requests[1][1])

    def test_missing_or_weak_validator_and_changed_cdn_start_full(self):
        for etag, url in [('', URL), ('W/"weak"', URL), ('"first"', URL.replace('test.', 'backup.'))]:
            self.seed(etag=etag)
            self.item['urls'] = [url]
            opener = SequenceOpener(Response(b'new-data', url=url))
            self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'new-data')
            self.assertNotIn('Range', opener.requests[0][1])

    def test_corrupt_bytes_or_missing_length_restart(self):
        for payload in (b'xxx', b'ab'):
            self.seed().write_bytes(payload)
            opener = SequenceOpener(Response(b'correct'))
            self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'correct')
            self.assertNotIn('Range', opener.requests[0][1])

    def test_uncommitted_tail_is_trimmed_after_prefix_validation(self):
        self.seed().write_bytes(b'abcuncommitted')
        opener = SequenceOpener(Response(b'def', 206, {'Content-Length': '3', 'Content-Range': 'bytes 3-5/6', 'ETag': '"first"'}))
        self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'abcdef')
        self.assertEqual(opener.requests[0][1]['Range'], 'bytes=3-')

    def test_complete_cache_is_verified_before_skipping_network(self):
        self.seed(total=3, complete=True)
        opener = SequenceOpener(Response(b'', 304, {'ETag': '"first"'}))
        self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'abc')
        self.assertEqual(opener.requests[0][1]['If-None-Match'], '"first"')

    def test_changed_complete_cache_is_downloaded_again(self):
        self.seed(total=3, complete=True)
        opener = SequenceOpener(Response(b'new'))
        self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'new')
        self.assertEqual(opener.requests[0][1]['If-None-Match'], '"first"')

    def test_304_without_matching_etag_retries_full(self):
        self.seed(total=3, complete=True)
        opener = SequenceOpener(Response(b'', 304, {}), Response(b'new'))
        self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'new')
        self.assertNotIn('If-None-Match', opener.requests[1][1])

    def test_interruption_preserves_verified_partial_and_reuses_it(self):
        opener = SequenceOpener(Response(b'abc', headers={'Content-Length': '6', 'ETag': '"first"'}, interrupt=True))
        with self.assertRaises(helper.DownloadError):
            helper.download_input(self.item, self.folder, 0, opener)
        state = helper.load_state(self.folder / 'input-0000.media', self.folder / 'input-0000.json')
        self.assertEqual(state['size'], 3)
        self.assertFalse(state['complete'])
        resumed = SequenceOpener(Response(b'def', 206, {'Content-Length': '3', 'Content-Range': 'bytes 3-5/6', 'ETag': '"first"'}))
        self.assertEqual(helper.download_input(self.item, self.folder, 0, resumed).read_bytes(), b'abcdef')

    def test_fallback_cdn_does_not_append_partial_from_previous_cdn(self):
        backup = URL.replace('test.', 'backup.')
        self.item['urls'].append(backup)
        opener = SequenceOpener(
            Response(b'abc', headers={'Content-Length': '6', 'ETag': '"first"'}, interrupt=True),
            Response(b'abcdef', url=backup))
        self.assertEqual(helper.download_input(self.item, self.folder, 0, opener).read_bytes(), b'abcdef')
        self.assertNotIn('Range', opener.requests[1][1])

    def test_compressed_or_overlong_body_is_never_marked_complete(self):
        for response in (Response(b'abc', headers={'Content-Length': '3', 'Content-Encoding': 'gzip'}),
                         Response(b'abcdef', headers={'Content-Length': '3'})):
            with self.assertRaises(helper.DownloadError):
                helper.download_input(self.item, self.folder, 0, SequenceOpener(response))
            state = helper.load_state(self.folder / 'input-0000.media', self.folder / 'input-0000.json')
            self.assertFalse(state and state['complete'])

    def test_symlink_cache_and_output_directory_are_rejected(self):
        original = self.folder / 'original'
        original.write_bytes(b'keep')
        try:
            (self.folder / 'input-0000.media').symlink_to(original)
        except OSError:
            self.skipTest('symlinks unavailable')
        with self.assertRaises(helper.DownloadError):
            helper.download_input(self.item, self.folder, 0, SequenceOpener(Response(b'changed')))
        self.assertEqual(original.read_bytes(), b'keep')
        (self.folder / 'Bilibili').symlink_to(self.folder, target_is_directory=True)
        with self.assertRaises(helper.DownloadError):
            helper.publish_output(original, self.folder, 'Bilibili/new.m4a')

    def test_save_does_not_overwrite_existing_files(self):
        source = self.folder / 'source'
        source.write_bytes(b'result')
        first = helper.publish_output(source, self.folder, 'Bilibili/sample.mp4')
        first.write_bytes(b'original')
        second = helper.publish_output(source, self.folder, 'Bilibili/sample.mp4')
        self.assertEqual(first.read_bytes(), b'original')
        self.assertEqual(second.name, 'sample (1).mp4')
        self.assertEqual(second.read_bytes(), b'result')

    def test_interrupted_save_never_publishes_a_partial_final_file(self):
        source = self.folder / 'source'
        source.write_bytes(b'result')
        def interrupt(stream, output, chunk_size):
            output.write(b'incomplete')
            self.assertFalse((self.folder / 'Bilibili/sample.mp4').exists())
            raise KeyboardInterrupt()
        with patch.object(helper.shutil, 'copyfileobj', side_effect=interrupt), self.assertRaises(KeyboardInterrupt):
            helper.publish_output(source, self.folder, 'Bilibili/sample.mp4')
        self.assertFalse((self.folder / 'Bilibili/sample.mp4').exists())
        self.assertEqual(list((self.folder / 'Bilibili').iterdir()), [])

    @unittest.skipIf(helper.os.name == 'nt', 'Windows publishes with non-replacing rename')
    def test_unsupported_atomic_publish_keeps_existing_files_intact(self):
        source = self.folder / 'source'
        source.write_bytes(b'result')
        with patch.object(helper.os, 'link', side_effect=OSError('unsupported')), self.assertRaises(helper.DownloadError):
            helper.publish_output(source, self.folder, 'Bilibili/sample.mp4')
        self.assertFalse((self.folder / 'Bilibili/sample.mp4').exists())


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg and ffprobe are optional test prerequisites')
class RealFFmpegTests(unittest.TestCase):
    def test_audio_dash_and_progressive_use_real_stream_copy(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            video = root / 'video.mp4'
            audio = root / 'audio.m4a'
            combined = root / 'combined.mp4'
            for args in (
                ['-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=10', '-t', '0.3', '-c:v', 'libx264', str(video)],
                ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '0.3', '-c:a', 'aac', str(audio)],
                ['-i', str(video), '-i', str(audio), '-c', 'copy', str(combined)],
            ):
                subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', *args], check=True, capture_output=True)
            for kind, files, expected in (
                ('audio', [audio], ['audio']),
                ('dash', [video, audio], ['video', 'audio']),
                ('progressive', [combined, combined], ['video', 'audio']),
            ):
                with self.subTest(kind=kind):
                    manifest = task(kind)
                    if kind == 'progressive':
                        manifest['inputs'].append({'id': 'second-segment', 'urls': [URL], 'bandwidth': 0})
                    opener = SequenceOpener(*(Response(path.read_bytes()) for path in files))
                    with contextlib.redirect_stdout(io.StringIO()):
                        destination = helper.run_task(manifest, root / kind, opener=opener)
                    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name',
                                            '-of', 'json', str(destination)], check=True, capture_output=True, text=True)
                    streams = json.loads(probe.stdout)['streams']
                    self.assertEqual([stream['codec_type'] for stream in streams], expected)
                    self.assertEqual([stream['codec_name'] for stream in streams], ['aac'] if kind == 'audio' else ['h264', 'aac'])
                    self.assertFalse((root / kind / '.bilibili-cache' / helper.cache_key(manifest)).exists())

    def test_saved_file_remains_successful_when_cache_cleanup_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audio = root / 'source.m4a'
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin',
                            '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.1',
                            '-c:a', 'aac', str(audio)], check=True, capture_output=True)
            original_unlink = Path.unlink
            def refuse_media_cleanup(path, *args, **kwargs):
                if path.name == 'input-0000.media':
                    raise PermissionError('fixture cleanup refused')
                return original_unlink(path, *args, **kwargs)
            warning = io.StringIO()
            with patch.object(Path, 'unlink', refuse_media_cleanup), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(warning):
                result = helper.run_task(task(), root / 'output', opener=SequenceOpener(Response(audio.read_bytes())))
            self.assertTrue(result.is_file())
            self.assertIn('文件已保存', warning.getvalue())
            self.assertFalse((root / 'output' / '.bilibili-cache' / helper.cache_key(task()) / '.lock').exists())


if __name__ == '__main__':
    unittest.main()
