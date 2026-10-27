# Remux fixtures

These synthetic clips contain a two-second H.264 video with B frames and a shorter
AAC sine wave. Different track durations exercise draining one track after the
other ends. The tests compare every encoded packet and its timing before and
after remuxing. Progressive fixtures combine these tracks as FLV and MP4. Their
concat tests execute the bundled FFmpeg WASM and compare encoded pictures
(allowing repeated SPS/PPS) and AAC packets. No external media or locally
installed FFmpeg is needed to run the tests.

`long-gop.mp4` contains four seconds of H.264 with B frames and only one sync
sample. It exercises a fragment that cannot finish at the two-second target,
including spool reads after its shorter companion audio track ends.

Regenerate with FFmpeg:

```sh
ffmpeg -f lavfi -i testsrc2=size=64x64:rate=24 -t 2 -an -c:v libx264 -bf 2 -g 24 -pix_fmt yuv420p -movflags +faststart -y tests/fixtures/downloads/video.mp4
ffmpeg -f lavfi -i testsrc2=size=64x64:rate=24 -t 4 -an -c:v libx264 -bf 3 -g 240 -keyint_min 240 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart -y tests/fixtures/downloads/long-gop.mp4
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000 -t 1.8 -vn -c:a aac -b:a 64k -movflags +faststart -y tests/fixtures/downloads/audio.m4a
ffmpeg -i tests/fixtures/downloads/video.mp4 -i tests/fixtures/downloads/audio.m4a -c copy -f flv -y tests/fixtures/downloads/progressive.flv
ffmpeg -i tests/fixtures/downloads/video.mp4 -i tests/fixtures/downloads/audio.m4a -c copy -movflags +faststart -y tests/fixtures/downloads/progressive.mp4
```

`mp4Moof.ts` generates one sparse fMP4 moof without per-sample fixture arrays,
including variable/default rows, signed/reordered/tied PTS, many trun boxes and
multi-GiB padding. Small encrypted variants cover inline senc and external
saiz/saio, including variable subsample records. `mp4MoofMemory.ts` measures
retained parser heap/buffers in isolated GC-enabled processes; source generation
and prewarmed track initialization are outside the measurement. Reads, random
seeks, old packets and 8 MiB Buffer-backed views exercise eviction and copying.
