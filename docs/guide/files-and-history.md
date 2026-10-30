# Files and download history

Configure new filenames in the download center or options page. Use long-term history to find successful downloads later.

## Filename templates and folders

Open file settings and completion notifications in the download center or options page. Directory modes are flat, creator, video, or creator/video. Filename templates support `{title}`, `{bvid}`, `{page}`, `{part}`, `{partSuffix}`, `{owner}`, `{quality}`, and `{type}`, with live preview and automatic extensions. Invalid characters are replaced, long names truncated, and duplicate names receive browser-generated suffixes.

Default template: `{title}_{bvid}{partSuffix}_{quality}`. Do not add an extension or path separators.

| Variable       | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| `{title}`      | Video title                                                        |
| `{bvid}`       | BV ID                                                              |
| `{page}`       | Part number such as `P01`; empty for covers                        |
| `{part}`       | Part title; empty for covers                                       |
| `{partSuffix}` | `_P01_part title` for non-cover multi-part assets; otherwise empty |
| `{owner}`      | Creator name; falls back to `未知 UP`                              |
| `{quality}`    | Selected quality or the corresponding content label                |
| `{type}`       | Download content label                                             |

## Settings and notifications

File settings are snapshotted when queuing; changes affect new tasks. Completion notifications default to off and request existing optional `notifications` permission when enabled. They fire only after the browser confirms saving; notification failures cannot turn a saved task into a failed task.

## Queue records

Queue JSON / CSV exports include only the current search and filter results: title, BV, part, type, state, and saved path, without cookies, temporary CDN URLs, or media bytes. Browser tasks show the requested path; use **Open folder** to inspect the actual file. Native tasks show the actual saved path. Ordinary terminal history retains roughly 100 records. Active bundles retain all members; terminal bundles are evicted as complete groups, with the newest group allowed up to 1,000 members. Record-file import is unsupported.

## Long-term history

Long-term history independently records successful downloads with search, asset filters, pagination, exports, and requeue. The latest success replaces matching content; limits are 5,000 records and 3 MiB, evicting the oldest when exceeded. It stores neither media nor temporary CDN URLs. Upgrades migrate only successful queue records still retained at that moment. Clearing the queue keeps long-term history; deleting history stops its duplicate checks without deleting downloaded files. Requeue preserves quality and file settings but creates a fresh task and resolves current streams, subject to account permissions and active-task deduplication.

[Having trouble? See troubleshooting](../help/troubleshooting.md).
