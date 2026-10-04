/**
 * Trust image signatures, not URL suffixes or CDN error response headers.
 */
export function detectCoverFormat(bytes: Uint8Array): {
  extension: string
  mime: string
} {
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte)
  if (startsWith([0xff, 0xd8, 0xff])) {
    return {
      extension: 'jpg',
      mime: 'image/jpeg',
    }
  }
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])) {
    return {
      extension: 'png',
      mime: 'image/png',
    }
  }
  const header = new TextDecoder().decode(bytes.slice(0, 12))
  if (header.startsWith('RIFF') && header.slice(8) === 'WEBP') {
    return {
      extension: 'webp',
      mime: 'image/webp',
    }
  }
  if (/^GIF8[79]a/.test(header)) {
    return {
      extension: 'gif',
      mime: 'image/gif',
    }
  }
  throw new Error('封面接口没有返回受支持的图片，未保存文件。')
}
