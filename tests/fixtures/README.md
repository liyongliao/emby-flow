# Clip test media

Original synthetic 24-second test pattern with a sine-wave audio track, generated for this repository. No third-party footage or credentials.

```sh
ffmpeg -f lavfi -i testsrc2=size=128x96:rate=24 -f lavfi -i sine=frequency=660:sample_rate=48000 -t 24 -c:v libx264 -b:v 120k -g 48 -bf 2 -pix_fmt yuv420p -c:a aac -b:a 48k -movflags +faststart clip-source.mp4
ffmpeg -i clip-source.mp4 -c copy clip-source.mkv
```

The B-frames, audio, GOP boundaries and Matroska seek index exercise actual remuxing and timestamp handling. Tests use small range blocks so partial reads are measurable with these small fixtures; production uses 1 MiB blocks.
