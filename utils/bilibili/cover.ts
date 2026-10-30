import { i18n } from '~/utils/i18n'
/**
 * Trust image signatures, not URL suffixes or CDN error response headers.
 *
 * @param bytes - Downloaded cover bytes whose leading image signature will be
 * inspected.
 * @returns The matching jpg, png, webp, or gif extension and MIME type.
 * @throws {Error} If no supported image signature is present.
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
  throw new Error(i18n.t('cover.theCoverApiReturnedNoSupportedImageNo'))
}
