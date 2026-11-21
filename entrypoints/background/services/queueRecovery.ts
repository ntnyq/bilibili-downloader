import { browser } from '#imports'
import { downloadJobSchema, downloadJobsSchema } from '~/types/download'
import { JOBS_STORAGE_KEY } from '~/utils/downloads/constants'
import { i18n } from '~/utils/i18n'

const BACKUP_KEY = 'downloadJobsRecoveryBackup'
const MAX_BACKUP_BYTES = 2 * 1024 * 1024
const encoder = new TextEncoder()

async function readBackups() {
  const stored = await browser.storage.local.get(null)

  return Object.fromEntries(
    Object.entries(stored).filter(([key]) =>
      /^downloadJobsRecoveryBackup(?::[a-f0-9]{64})?$/.test(key),
    ),
  )
}

async function snapshotDigest(json: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(json))

  return Array.from(new Uint8Array(hash), value =>
    value.toString(16).padStart(2, '0'),
  ).join('')
}

async function readCorruptQueue() {
  const stored = await browser.storage.local.get(JOBS_STORAGE_KEY)
  const raw = stored[JOBS_STORAGE_KEY]

  if (raw === undefined || downloadJobsSchema.safeParse(raw).success) {
    return
  }

  const json = JSON.stringify(raw)

  return {
    raw,
    json,
    digest: await snapshotDigest(json),
  }
}

export async function exportCorruptQueue() {
  const snapshot = await readCorruptQueue()

  return snapshot ? { json: snapshot.json, digest: snapshot.digest } : null
}

export async function exportQueueBackups() {
  const backups = await readBackups()

  return Object.keys(backups).length
    ? JSON.stringify({ version: 1, backups })
    : null
}

export async function clearQueueBackups() {
  const keys = Object.keys(await readBackups())

  if (keys.length) {
    await browser.storage.local.remove(keys)
  }
}

/**
 * Keep the original safe before repairing. A saved export can substitute for a
 * browser-storage backup when the backup budget or quota has been exhausted.
 * Call under the queue lock so the exported digest identifies the exact data.
 */
export async function recoverQueue(exportedDigest?: string) {
  const snapshot = await readCorruptQueue()

  if (!snapshot) {
    return
  }

  const { raw, json, digest } = snapshot

  if (exportedDigest !== undefined && exportedDigest !== digest) {
    throw new Error(i18n.t('queueRecovery.snapshotChanged'))
  }

  if (exportedDigest === undefined) {
    const backups = await readBackups()
    const key =
      backups[BACKUP_KEY] === undefined ? BACKUP_KEY : `${BACKUP_KEY}:${digest}`
    const entries = Object.entries(backups)

    if (!entries.some(([, backup]) => JSON.stringify(backup) === json)) {
      const used = entries.reduce(
        (bytes, [name, backup]) =>
          bytes + encoder.encode(name + JSON.stringify(backup)).byteLength,
        0,
      )

      if (used + encoder.encode(key + json).byteLength > MAX_BACKUP_BYTES) {
        throw new Error(i18n.t('queueRecovery.backupLimitReached'))
      }

      try {
        await browser.storage.local.set({ [key]: raw })
      } catch (error) {
        throw new Error(
          i18n.t('queueRecovery.backupCouldNotBeSaved', [
            error instanceof Error ? error.message : String(error),
          ]),
          { cause: error },
        )
      }
    }
  }

  const recovered = (Array.isArray(raw) ? raw : []).flatMap(value => {
    const result = downloadJobSchema.safeParse(value)

    return result.success ? [result.data] : []
  })

  await browser.storage.local.set({ [JOBS_STORAGE_KEY]: recovered })
}
