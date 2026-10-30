/**
 * @file Logger
 */

import { consola } from 'consola/browser'
import { META } from '~/constants/app'

export const logger = consola.withTag(META.id)

/**
 * Creates a logger tagged with the extension ID and a caller-specific scope.
 *
 * @param scope - Feature or browser-context label appended to the extension
 * log tag.
 * @returns A Consola logger using the tag META.id:scope.
 */
export const createLogger = (scope: string) =>
  consola.withTag(`${META.id}:${scope}`)
