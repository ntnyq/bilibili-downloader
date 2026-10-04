/**
 * @file Logger
 */

import { consola } from 'consola/browser'
import { META } from '~/constants/app'

export const logger = consola.withTag(META.id)

export const createLogger = (scope: string) =>
  consola.withTag(`${META.id}:${scope}`)
