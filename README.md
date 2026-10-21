# Guardian demo on Vercel

The Guardian app, running from the final analysis results (`results.json`) as a static site, with the two sign-ins:

* **Inspector** sees the split screen: the camera video, the Guardian view with segmentation, the step checklist, alerts and the log.
* **Manager** follows job `JB-24-0117` live: the current step, the step timeline, confirmed steps, alerts, the activity feed and a muted live view, all driven by how far the inspector has played the video.

## What goes in the repo

```
index.html        the app
config.js         file names and demo accounts
results.json      final analysis results (7 MB; Vercel serves it compressed, about 1.6 MB)
video.mp4         YOU ADD THIS: the web copy of the video (about 48 MB)
evidence/*.jpg    optional: step evidence frames (P1.jpg ... J3.jpg)
api/login.js      sign-in (accounts from environment variables)
api/live.js       live inspector -> manager sync (needs a Redis store, see step 4)
vercel.json
```

### The video

Do **not** commit the 1.2 GB camera file. The app plays the web copy the Colab run made: `/content/guardian_run/stream.mp4` (47.7 MB). Rename it `video.mp4`. That is under GitHub's 100 MB per-file limit and the whole repo stays under Vercel Hobby's 100 MB upload limit.

If the Colab runtime is still up, run this in a new cell to download everything at once:

```python
!cd /content/guardian_run && zip -r /content/guardian_web.zip stream.mp4 evidence results.json
from google.colab import files; files.download("/content/guardian_web.zip")
```

If that copy is gone, make a new one from the original with `./make_web_video.sh original.mp4` (needs ffmpeg). It keeps the same frame rate and length, so the overlays stay in sync.

## Deploy

1. Put `video.mp4` (and the `evidence/` images if you have them) in this folder.
2. Push the folder to a GitHub repo.
3. In Vercel: **Add New > Project**, import the repo. Framework preset **Other**, no build command, output directory left empty (the repo root). Deploy.
4. Live tracking across devices: in the Vercel project open **Storage > Create Database > Upstash (Redis)**, use the free plan, and connect it to the project. It adds the `KV_REST_API_URL` / `KV_REST_API_TOKEN` variables. Then **Redeploy**. Without this the manager can still follow an inspector in another window of the same browser, and says so in its status line.
5. Optional: set your own accounts under **Settings > Environment Variables**: `INSPECTOR_USER`, `INSPECTOR_PASSWORD`, `INSPECTOR_NAME`, `MANAGER_USER`, `MANAGER_PASSWORD`, `MANAGER_NAME` (defaults: `inspector` / `guardian`, `manager` / `guardian`). Redeploy after changing them.

Open the Vercel URL on the phone (or make a QR code of it), sign in as inspector there and as manager on the laptop.

## Notes

* This is a demo: the results and the video are public files on the site, and the sign-in only selects the view.
* Hosting the video elsewhere (Vercel Blob, S3, R2...) also works: put its full `https://` URL in `config.js` > `video`. Allow CORS from your Vercel domain so the app can preload it; without CORS it still plays, streaming instead of preloading.
* Opening `index.html` straight from disk won't load the results; serve the folder (e.g. `npx serve .`).
