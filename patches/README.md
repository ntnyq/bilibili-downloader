# Media patches

## mediabunny@1.62.1

The browser remuxer writes fragmented MP4/M4A. The upstream muxer retains every
completed fragment's samples for its final `mfra` index, although `tfra` only
needs the first sync sample and its original sample number. This patch discards
the sample suffix after writing each fragment. Retained output metadata grows
with fragment count rather than frame count. It preserves any prefix before the
first sync sample so `tfra` sample numbers remain correct.

The patch also fixes `trun` flag compression: first-sample-only flags are valid
only when every later sample has identical flags. Fragments containing multiple
keyframes must write per-sample flags or seeking can miss intermediate keyframes.

The demuxer walks `moov` by file range instead of loading and retaining its full
buffer. It skips unknown/padding payloads and defers each track's sample tables
until its first packet request. The eight regular sample-table boxes (`stts`,
`ctts`, `stsz`, `stz2`, `stss`, `stsc`, `stco`, `co64`) stay on the input source.
Each track retains at most eight copied 16 KiB raw pages, 128 prefix checkpoints
and 256 decoded runs for each of `stts`, `ctts` and `stsc`, plus scalar cursors.
Neither sample sizes, chunk offsets, sync samples, cumulative sizes nor sorted
presentation offsets are materialized as full arrays. PCM still groups frames
into chunks without a per-chunk array.

The first packet scans run-length timing/composition/chunk mappings to build
bounded checkpoints and composition-offset bounds. Sizes, offsets and sync
sample entries are read on demand. Random seeks may scan from a checkpoint;
very wide composition-offset ranges can require scanning many candidate samples.
This deliberately trades I/O and lookup time for a retained index bounded
independently of sample count. The source cache and its prefetch/coalescing are
separate from parser pages; codec/metadata leaf boxes and encryption auxiliary
information retain their existing behavior. This is not a total-task memory cap.

Fragmented inputs also traverse `mfra` by range and retain TFRA locations instead
of decoded entry arrays. Each track caches at most four copied 16 KiB TFRA pages.
First index use validates ordering in a paged streaming pass; ordered tables use
binary search, while unordered tables use streaming lookup without a sorted copy.
Equal timestamps keep the first valid entry, and zero sample/run references are
skipped. Raw input cache prefetch/coalescing remains independent of these pages.

Per-track timestamp hints and cumulative decode-time anchors are each bounded to
128 records; the shared fragment-summary cache retains at most 128 records.
Missing `tfdt` is recovered from an exact TFRA sample reference or by rescanning
a contiguous prefix from a retained decode anchor (or the init boundary). Decode
end time is kept separately from presentation end time, preserving B-frame and
composition-offset timing after eviction. Fragment parsing, time recovery and
publication are serialized; failed reads never publish an incomplete fragment.
A completed fragment can still be retained by caller-held packets, and a single
`moof` and its samples are still parsed together. Output fragment indexes and
codec/encryption state are not covered by these input-index bounds.

Async traversal is serialized because the parser has shared track/fragment
state. Concurrent callers share track initialization; cancellation and I/O errors
propagate and failed table initialization can be retried. Sparse >4 GiB `moov`,
all table encodings/page boundaries, packet/seek results, concurrent tracks,
malformed tables, disposal, eviction/rereads, multi-sample chunks, signed CTTS,
presentation ties, PCM, isolated retained-heap/buffer growth, real Blob remux
reads and both CommonJS entrypoints
are covered in `tests/downloads/mp4Input.test.ts`. Fragmented inputs are covered
by `tests/downloads/mp4Fragments.test.ts` and isolated fragment-memory fixtures.

Source, ESM, declarations and CommonJS entrypoints are patched. Keep the exact patched version
when updating dependencies, and remove the patch once upstream implements these
changes. Packet/timestamp, multi-fragment seeking and isolated retained-heap tests
cover the behavior. No upstream issue or pull request has been submitted.
