import { md5 } from 'js-md5'

const MIXIN_KEY_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
]

/**
 * Derives the 32-character WBI mixin key from navigation image filenames.
 *
 * @param imageUrl - Navigation image URL containing the first half of the
 * signing key.
 * @param subUrl - Navigation sub-image URL containing the second half of the
 * signing key.
 * @returns The permuted 32-character mixin key.
 * @throws {TypeError} If either image URL cannot be parsed.
 * @throws {Error} If the combined filename stems do not contain exactly 64
 *   characters.
 */
export function createMixinKey(imageUrl: string, subUrl: string): string {
  const key = [imageUrl, subUrl]
    .map(url => new URL(url).pathname.split('/').at(-1)?.split('.')[0] || '')
    .join('')
  if (key.length !== 64) {
    throw new Error('签名信息格式已变化，请稍后重试。')
  }
  return MIXIN_KEY_TABLE.map(index => key[index])
    .join('')
    .slice(0, 32)
}

/**
 * Builds a sorted, filtered WBI query and appends its timestamp and MD5
 * signature.
 *
 * @param params - Unsigned query fields; the object is not mutated and any wts
 * field is replaced.
 * @param key - WBI mixin key used to sign the encoded query.
 * @param timestamp - Unix time in seconds; defaults to the current time
 * rounded down.
 * @returns An encoded query string containing wts and w_rid, without a leading
 * question mark.
 * @throws {URIError} If a query name or value contains an unpaired surrogate
 *   that cannot be URI-encoded.
 */
export function signWbi(
  params: Record<string, string | number>,
  key: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const values = { ...params, wts: timestamp }
  const query = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(String(value).replace(/[!'()*]/g, ''))}`,
    )
    .join('&')
  return `${query}&w_rid=${md5(query + key)}`
}
