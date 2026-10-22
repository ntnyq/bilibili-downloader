const OUTPUT_SIZE_FACTOR = 1.05
const STORAGE_RESERVE_BYTES = 64 * 1024 * 1024
const QUOTA_REFRESH_BYTES = 8 * 1024 * 1024
const QUOTA_REFRESH_INTERVAL_MS = 1000

export interface MediaStorageState {
  received: number
  total: number | null
  additionalBytes: number
}

type StorageEstimator = () => Promise<StorageEstimate>

/**
 * Input and output coexist in OPFS. Cached input is already included in usage;
 * only missing input is added again. The final Downloads copy is outside OPFS.
 */
function requiredStorage(
  inputBytes: number,
  remainingInputBytes: number,
): number {
  const required =
    Math.ceil(inputBytes * OUTPUT_SIZE_FACTOR)
    + remainingInputBytes
    + STORAGE_RESERVE_BYTES
  if (!Number.isSafeInteger(required) || required < 0) {
    throw new RangeError('媒体大小超出浏览器可安全计数的范围。')
  }
  return required
}

export async function getAvailableMediaStorageBytes(
  estimate: StorageEstimator = () => navigator.storage.estimate(),
): Promise<number | null> {
  try {
    const { quota, usage } = await estimate()
    if (
      quota !== undefined
      && usage !== undefined
      && Number.isFinite(quota)
      && Number.isFinite(usage)
      && quota >= 0
      && usage >= 0
    ) {
      return Math.max(0, quota - usage)
    }
  } catch {
    // Estimates are advisory. If unavailable, actual OPFS writes enforce quota.
  }
  return null
}

function assertSpace(available: number | null, required: number) {
  if (available !== null && required > available) {
    throw new RangeError(
      '浏览器剩余磁盘配额不足以同时容纳输入和封装输出，请清理下载缓存或释放磁盘空间后重试。',
    )
  }
}

/**
 * Refreshes quota while streaming and accounts for committed writes between
 * snapshots. Completed tracks contribute output size, not missing input bytes.
 */
export function createMediaStorageBudget(
  completedInputBytes: number,
  {
    estimate = () => navigator.storage.estimate(),
    now = Date.now,
  }: { estimate?: StorageEstimator; now?: () => number } = {},
) {
  let available: number | null = null
  let sampledAt: number | undefined
  let previousReceived: number | undefined
  let writtenSinceSample = 0

  return async ({ received, total, additionalBytes }: MediaStorageState) => {
    const didReset =
      previousReceived !== undefined && received < previousReceived
    writtenSinceSample +=
      previousReceived === undefined || didReset
        ? 0
        : received - previousReceived
    previousReceived = received
    const currentInputBytes = total ?? received + additionalBytes
    const remainingInputBytes = Math.max(
      additionalBytes,
      currentInputBytes - received,
    )
    const required = requiredStorage(
      completedInputBytes + currentInputBytes,
      remainingInputBytes,
    )
    if (
      sampledAt === undefined
      || didReset
      || now() - sampledAt >= QUOTA_REFRESH_INTERVAL_MS
      || writtenSinceSample >= QUOTA_REFRESH_BYTES
      || (available !== null && required > available - writtenSinceSample)
    ) {
      available = await getAvailableMediaStorageBytes(estimate)
      sampledAt = now()
      writtenSinceSample = 0
    }
    assertSpace(
      available === null ? null : Math.max(0, available - writtenSinceSample),
      required,
    )
  }
}

export async function assertMediaOutputSpace(
  inputBytes: number,
  estimate: StorageEstimator = () => navigator.storage.estimate(),
) {
  assertSpace(
    await getAvailableMediaStorageBytes(estimate),
    requiredStorage(inputBytes, 0),
  )
}
