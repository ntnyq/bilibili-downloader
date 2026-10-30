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
 *
 * @param inputBytes - Total expected input size in bytes, including already
 * completed tracks.
 * @param remainingInputBytes - Input bytes still missing from OPFS and
 * therefore not included in current usage.
 * @returns Additional OPFS capacity required for remaining input, estimated
 * output with overhead, and the fixed reserve.
 * @throws {RangeError} If the computed budget is negative or exceeds safe
 *   integer precision.
 */
function getRequiredStorageBytes(
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

/**
 * Reads advisory available OPFS quota without treating unavailable estimates
 * as a hard failure.
 *
 * @param estimate - Optional async quota/usage reader; defaults to
 * navigator.storage.estimate().
 * @returns A promise resolving to max(0, quota - usage), or null when
 * estimates are absent, invalid, or reject.
 */
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

/**
 * Rejects a known insufficient storage estimate while allowing unknown
 * capacity.
 *
 * Returns no value when quota is unknown or sufficient.
 *
 * @param available - Available bytes from a valid quota estimate, or null when
 * unavailable.
 * @param required - Additional input/output/reserve bytes required for the
 * operation.
 * @throws {RangeError} If required bytes exceed the known available quota.
 */
function assertStorageCapacity(available: number | null, required: number) {
  if (available !== null && required > available) {
    throw new RangeError(
      '浏览器剩余磁盘配额不足以同时容纳输入和封装输出，请清理下载缓存或释放磁盘空间后重试。',
    )
  }
}

/**
 * Refreshes quota while streaming and accounts for committed writes between
 * snapshots. Completed tracks contribute output size, not missing input bytes.
 *
 * @param completedInputBytes - Bytes from earlier downloaded tracks that also
 * need output capacity.
 * @param options - Optional quota sampling dependencies; defaults to browser
 * estimates and the system clock.
 * @param options.estimate - Async quota/usage reader; defaults to
 * navigator.storage.estimate().
 * @param options.now - Millisecond clock used to throttle quota refreshes;
 * defaults to Date.now.
 * @returns An async stateful checker for received/total/additionalBytes; it
 * refreshes estimates after growth, elapsed time, or a representation reset.
 * @remarks The returned checker rejects with RangeError for insufficient
 *   capacity or unsafe size arithmetic. Missing quota estimates remain
 *   advisory; actual OPFS writes enforce quota.
 */
export function createMediaStorageChecker(
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
    const required = getRequiredStorageBytes(
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
    assertStorageCapacity(
      available === null ? null : Math.max(0, available - writtenSinceSample),
      required,
    )
  }
}

/**
 * Checks space for a remux output while treating existing input bytes as
 * already stored.
 *
 * @param inputBytes - Complete input size used to estimate output size and
 * overhead.
 * @param estimate - Optional async quota/usage reader; defaults to
 * navigator.storage.estimate().
 * @returns A promise resolving without a value when estimated capacity is
 * sufficient or unavailable.
 * @throws {RangeError} If required output capacity exceeds the estimate or
 *   safe size arithmetic.
 */
export async function assertMediaOutputSpace(
  inputBytes: number,
  estimate: StorageEstimator = () => navigator.storage.estimate(),
) {
  assertStorageCapacity(
    await getAvailableMediaStorageBytes(estimate),
    getRequiredStorageBytes(inputBytes, 0),
  )
}
