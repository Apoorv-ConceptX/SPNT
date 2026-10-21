#!/usr/bin/env bash
# Make the web copy of the jointing video for Guardian (about 45-55 MB for 7.5 minutes, fits in GitHub and Vercel).
# Only needed if you no longer have /content/guardian_run/stream.mp4 from the Colab run.
#
#   ./make_web_video.sh path/to/original.mp4            -> writes video.mp4 next to this script
#
# Keeps the exact timeline the analysis used (same frame rate, no trimming), so every mask and tick lines up.
# The frame rate must match "video.fps" in results.json (30 for the demo run).
set -euo pipefail
IN="${1:?usage: ./make_web_video.sh original.mp4}"
FPS="${FPS:-30}"
OUT="$(dirname "$0")/video.mp4"
ffmpeg -y -i "$IN" -map 0:v:0 -map 0:a:0? \
  -vf "scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -c:v libx264 -preset slow -crf 27 -maxrate 900k -bufsize 1800k -profile:v main -pix_fmt yuv420p \
  -g "$FPS" -keyint_min "$FPS" -sc_threshold 0 -vsync cfr -r "$FPS" \
  -c:a aac -b:a 64k -ac 1 -movflags +faststart "$OUT"
ls -lh "$OUT"
