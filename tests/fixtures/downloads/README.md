# Remux fixtures

These synthetic clips contain a two-second H.264 video with B frames and a shorter
AAC sine wave. Different track durations exercise draining one track after the
other ends. The tests compare every encoded packet and its timing before and
after remuxing. Progressive fixtures combine these tracks as FLV and MP4. Their
concat tests execute the bundled FFmpeg WASM and compare encoded pictures
(allowing repeated SPS/PPS) and AAC packets. No external media or locally
installed FFmpeg is needed to run the tests.

Regenerate with FFmpeg:

```sh
ffmpeg -f lavfi -i testsrc2=size=64x64:rate=24 -t 2 -an -c:v libx264 -bf 2 -g 24 -pix_fmt yuv420p -movflags +faststart -y tests/fixtures/downloads/video.mp4
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000 -t 1.8 -vn -c:a aac -b:a 64k -movflags +faststart -y tests/fixtures/downloads/audio.m4a
ffmpeg -i tests/fixtures/downloads/video.mp4 -i tests/fixtures/downloads/audio.m4a -c copy -f flv -y tests/fixtures/downloads/progressive.flv
ffmpeg -i tests/fixtures/downloads/video.mp4 -i tests/fixtures/downloads/audio.m4a -c copy -movflags +faststart -y tests/fixtures/downloads/progressive.mp4
```
