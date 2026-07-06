# Ant Scout — The Buried Cavern 🐜

A tiny ant-scout digging game. Guide your ant down through the soil to find the
buried gem, while **live local weather** drives the sky, wind, and storms above
the surface. No account, no build step, and it works **offline**.

It's a **Progressive Web App (PWA)** — when opened from a web address it can be
installed to a phone or desktop home screen and played like a native app.

## Play / install

Once this repo is published with GitHub Pages (see below), open the link on a
phone:

- **iPhone/iPad (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** menu → **Install app** / **Add to Home Screen**
- **Desktop (Chrome/Edge):** the **install icon** in the address bar

After the first load it plays fully offline; only the live weather needs a
connection (the game degrades gracefully without it).

## Publish with GitHub Pages

1. Repo **Settings → Pages**.
2. **Build and deployment → Source: Deploy from a branch.**
3. Pick the branch (e.g. `main`) and folder **`/ (root)`**, then **Save**.
4. After a minute the game is live at
   `https://capflyingfun.github.io/ant-scout-game/`.

> A PWA must be served over **https** (GitHub Pages is). Opening the files
> directly from a folder (`file://`) or an unzipped copy will run the game but
> **won't** let it install as an app — that's a browser security rule, not a
> bug.

## Project layout

```
index.html        game shell + PWA hooks
manifest.json     app name, icons, colors (makes it installable)
sw.js             service worker (offline cache)
offline.html      shown if opened offline before first load
css/style.css     styles
js/*.js           game code (config → state → core → systems → loop)
icons/            app icons (incl. maskable + apple-touch)
```

## Updating the game

When you change any file listed in `sw.js`, bump the `CACHE_NAME` version
(e.g. `ant-scout-v1` → `ant-scout-v2`) so installed copies pick up the update.
