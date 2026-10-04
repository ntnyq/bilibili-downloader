import { FFFSType, FFmpeg } from '@ffmpeg/ffmpeg'
import { browser } from '#imports'
import type { SelectedMedia } from '../bilibili/streams'

/**
 * Mount disk-backed inputs read-only; WASM still needs memory for its output.
 */
export async function mergeMedia(
  kind: SelectedMedia['kind'],
  inputs: Blob[],
  signal: AbortSignal,
): Promise<Blob> {
  signal.throwIfAborted()
  const ffmpeg = new FFmpeg()
  const terminate = () => ffmpeg.terminate()
  signal.addEventListener('abort', terminate, { once: true })
  const loadTimeout = setTimeout(terminate, 60000)
  try {
    await ffmpeg.load({
      classWorkerURL: browser.runtime.getURL('/ffmpeg/worker.js'),
      coreURL: browser.runtime.getURL('/ffmpeg/ffmpeg-core.js'),
      wasmURL: browser.runtime.getURL('/ffmpeg/ffmpeg-core.wasm'),
    })
    clearTimeout(loadTimeout)
    signal.throwIfAborted()
    await ffmpeg.createDir('/inputs')
    await ffmpeg.mount(
      FFFSType.WORKERFS,
      {
        blobs: inputs.map((data, index) => ({
          name: `${index}.media`,
          data,
        })),
      },
      '/inputs',
    )
    let args: string[]
    if (kind === 'audio') {
      args = ['-i', '/inputs/0.media', '-map', '0:a:0', '-vn']
    } else if (kind === 'dash') {
      args = [
        '-i',
        '/inputs/0.media',
        '-i',
        '/inputs/1.media',
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
      ]
    } else {
      await ffmpeg.writeFile(
        'inputs.txt',
        inputs.map((_, index) => `file '/inputs/${index}.media'`).join('\n'),
      )
      args = [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        'inputs.txt',
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
      ]
    }
    signal.throwIfAborted()
    const outputName = kind === 'audio' ? 'output.m4a' : 'output.mp4'
    const exitCode = await ffmpeg.exec(
      [...args, '-c', 'copy', '-movflags', '+faststart', outputName],
      180000,
    )
    if (exitCode !== 0) {
      throw new Error(
        '音视频封装失败或超时，可重试或导出本地任务使用 FFmpeg 助手。',
      )
    }
    const output = await ffmpeg.readFile(outputName)
    if (typeof output === 'string' || !output.byteLength) {
      throw new TypeError('合并结果不是有效的媒体文件。')
    }
    signal.throwIfAborted()
    return new Blob([new Uint8Array(output)], {
      type: kind === 'audio' ? 'audio/mp4' : 'video/mp4',
    })
  } finally {
    clearTimeout(loadTimeout)
    signal.removeEventListener('abort', terminate)
    ffmpeg.terminate()
  }
}
