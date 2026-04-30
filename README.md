# jgmdb

Lightweight video platform — Netflix-style profile picker, library, per-profile watch tracking. No build step (CDN React + Babel standalone).

## Run locally

```sh
python3 -m http.server 8765
open "http://localhost:8765/JG%20LMS.html"
```

## Files

- `JG LMS.html` — entrypoint, loads React + Babel + Vimeo Player API
- `app.jsx` — root component, video catalog, hash routing, localStorage state
- `profiles.jsx` — profile picker, create, edit
- `home.jsx` — library, hero, video cards
- `player.jsx` — Vimeo iframe + Player API for real progress tracking
- `admin.jsx` — analytics: completion matrix + activity log
- `styles.css` — single stylesheet
- `thumbnails/` — extracted JPG previews per video

## Notes

- Watch progress is stored in `localStorage` on each device. No backend.
- No authentication — anyone can claim any profile name (honor system).
- Video sources are private Vimeo URLs configured in `app.jsx::VIDEOS`.
