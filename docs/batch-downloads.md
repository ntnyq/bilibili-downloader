# Batch downloads

Import selected videos from a preview rather than downloading an entire source automatically.

## Import a selection

1. Open **Batch import** in the download center and choose a source type.
2. Paste the source URL or ID and load a preview.
3. Load additional pages if needed, then select the videos to save.
4. Choose content, parts, quality, and whether to skip successful history.
5. Add selected items to the queue. Inspect per-video results before continuing.

## Supported sources

In the download center, choose a batch source, load a preview, then select videos to queue:

- **Link list:** one BV/av ID or complete HTTPS video URL per line. The `p` parameter is retained, invalid lines are reported separately, and duplicates are removed. Open short links in your browser first and copy the full destination URL.
- **Favorites:** paste a favorites URL containing `fid`, or enter its ID.
- **Collections / series:** paste a creator-space collection or series URL containing both the creator UID and collection/series ID.
- **Creator uploads:** paste a creator-space URL or UID to load ordinary videos from newest to oldest.

## Pagination and access

Online sources load one page at a time. Load the next page manually, up to 500 items per preview. Only loaded and selected items are imported; the extension does not automatically crawl an entire account. Empty lists, unavailable items, hidden content, and API failures have explicit feedback. Private favorites require login on Bilibili and appropriate access. The extension uses the browser session without reading or exporting cookies.

## Parts and duplicate checks

Choose only the linked part (P1 when `p` is absent), or expand all parts. Covers are always one per video. Asset type, subtitle language, quality, and saved file settings are snapshotted when first queuing and retained after session recovery. The background rechecks metadata, preserves source order, and always skips active duplicates. By default it also skips matching successful history; disable that option to download again. This does not scan disk: identity uses BV / CID / asset type / subtitle language, or BV alone for covers, irrespective of quality.

## Import limits

Source reads and enqueue metadata requests run serially with at least one second between batch operations. Failures are reported per video. Login, anti-abuse, network, or queue-capacity errors stop the import and retain already queued tasks. Stopping enqueue waits for the current request and does not cancel queued downloads. A video that would exceed 1,000 active tasks is rejected as a whole.

## Restore a batch session

The latest batch session is saved locally, including source input, pages, preview, selection, and item results. Refreshing or reopening restores it and waits for you to continue reading or enqueueing; it does not automatically request pages or resume enqueueing. Changed sources require a new preview. Once import starts, options remain fixed; a new preview starts a new session. Conflicting edits from another download center require loading its latest session. Queue results and receipts are saved together, preventing duplicate submission if a response is lost. Queued tasks still follow the download center's normal recovery behavior.

[Having trouble? See troubleshooting](troubleshooting.md).
