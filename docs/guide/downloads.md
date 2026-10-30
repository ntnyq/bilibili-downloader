# Video, quality, and tasks

Choose video parts and a quality cap, then control the resulting tasks in the download center.

| Action       | Result                                                       |
| ------------ | ------------------------------------------------------------ |
| Pause queue  | Current task finishes; waiting tasks do not start            |
| Pause a task | Stops that task before saving and retains committed cache    |
| Resume       | Resolves fresh streams and validates cache before continuing |
| Cancel       | Stops the task and clears its browser cache                  |
| Retry        | Uses the original settings and checks cache when available   |

## Choose parts

Open `https://www.bilibili.com/video/...` and click **Download video** below the player. Multi-part videos default to the current part; choose all parts or a custom selection. The picker supports selecting, selecting all, inverting, and clearing, shows the count and total duration, and always preserves the original part order. You can also start downloads from the extension popup.

## Choose quality

Quality preferences are saved and synchronized across interfaces. Queued tasks keep their submitted settings, including on retry. “Up to 720P” selects the highest available stream at or below 720P; if your account only receives 480P, that is what downloads. A task fails when no stream meets the cap rather than selecting a higher resolution.

## Search and retry

Search the download center by title, BV ID, or part, filter failures, and retry all failed tasks. Bulk retry skips active duplicates and repeated parts; cancelled tasks can still be retried individually. Pausing the queue lets the current task finish and stops the next task from starting. This state survives refresh and does not pause the current network transfer. Changing the default quality only affects newly added tasks.

## Pause, resume, and reorder

**Pause** beside a task stops its resolution, transfer, or remuxing and keeps committed media cache. Tasks already saving cannot be paused. **Resume** resolves fresh streams and validates cached data before continuing. A paused task does not block other queued tasks and remains paused after refresh; cancellation clears its browser cache. Move waiting tasks up or down to change their execution order.

## Keep the download center open

Tasks run in the download center tab that opens in the background. **Keep the download center open while downloading.** Each part is saved separately under `Bilibili/` in the default download folder. Closing or refreshing the tab interrupts active work. Reopen it and retry: committed media fragments remain on disk, and fresh media URLs and cache validation determine whether the server allows resuming.

[Having trouble? See troubleshooting](../help/troubleshooting.md).
