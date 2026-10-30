# Audio and companion assets

Download a single asset or group several output types into one bundle.

## Export an asset

1. Open the video-page panel or toolbar popup.
2. Choose the output type, or select several types in **Asset bundle**.
3. Choose the part range and subtitle language where applicable.
4. Start the download and inspect each result in the download center.

## Output formats

Choose an output in the video-page panel or popup:

| Content   | Output and limits                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video     | MP4 using the quality preference; the default behavior                                                                                                                      |
| Audio     | Highest-bitrate returned AAC track, remuxed to M4A without re-encoding; fails without standalone AAC                                                                        |
| Cover     | One original per BV, saved as JPG / PNG / WebP / GIF according to its actual format, independent of parts                                                                   |
| Subtitles | One SRT per part; automatic selection prefers Chinese and human subtitles within a language; Chinese or English can be requested explicitly; automatic subtitles are marked |
| Danmaku   | XML snapshot returned by the current API; not a complete historical archive and not burned into video                                                                       |

## Availability and limits

Missing subtitles/danmaku and login requirements have explicit reasons. Cover, subtitle, and danmaku inputs are each limited to 16 MB. Audio, subtitles, and danmaku support current / all / selected parts. Video and audio queue independently; subtitles deduplicate by selected language. Retrying preserves the original output type and subtitle language.

## Asset bundles

Asset bundles select multiple outputs at once using the existing part range, quality, and subtitle settings. Covers remain one per video, other assets one per selected part. Bundles force video directories; creator-based settings become creator/video directories. Active assets are skipped with a count. Capacity is validated for the entire bundle before one atomic enqueue, so capacity failure cannot add half a bundle. The download center reports saved, failed, cancelled, and remaining members. Missing subtitles do not count as bundle success, and failed assets can be retried independently.

[Having trouble? See troubleshooting](../help/troubleshooting.md).
