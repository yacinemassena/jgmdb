# jgmdb

Lightweight video platform — Netflix-style profile picker, library, per-profile watch tracking. No build step (CDN React + Babel standalone).

## Run locally

```sh
python3 -m http.server 8765
open "http://localhost:8765/"
```

Or use the bundled Go server:

```sh
go run main.go
# PORT defaults to 8080
```

## Deploy

Includes a tiny Go static-file server (`main.go`) so Railpack/Railway can build & run with zero config — `start.sh` runs the binary if present, otherwise `go run main.go`.

## Files

- `index.html` — entrypoint, loads React + Babel + Vimeo Player API
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
