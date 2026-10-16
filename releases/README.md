# How to add a new song or project

Every folder inside `releases/` is one record on the site.
Add a folder and it appears in the tunnel. Delete the folder and it's gone.
You don't need to touch any code.

A song folder holds exactly two things:

```
releases/
  my-new-song/        <- the folder (its name becomes the song's link)
    info.json         <- the details: title, credits, links...
    cover.jpg         <- the cover art
```

---

## Step by step (on the GitHub website, works from your phone too)

### 1. Copy the template text
1. Open the repository on GitHub and go into the `releases` folder.
2. Open the `_template` folder, then open `info.json`.
3. Click the **copy** button (two overlapping squares, top right of the file).

### 2. Create the folder and info.json
1. Go back to the `releases` folder.
2. Click **Add file → Create new file**.
3. In the name box, type the folder name, a slash, then `info.json`.
   For example: `my-new-song/info.json`.
   Typing the `/` turns `my-new-song` into a folder.
   - Use only lowercase letters, numbers and dashes: `ti-kniver-i-hjertet`, not `Ti Kniver I Hjertet`.
   - This name becomes the song's own link: `yoursite/#my-new-song`.
4. Paste the template text into the big box.
5. Change the details (see "What each line means" below).
6. Click **Commit changes…**, then **Commit changes** again.

### 3. Upload the cover art
1. Open your new folder (`releases/my-new-song`).
2. Click **Add file → Upload files**.
3. Drag in your cover image, or choose it.
4. Make sure the file name matches the `cover` line in `info.json`.
   If the file is called `cover.jpg`, the line must say `"cover": "cover.jpg"`.
   (Easiest: rename the image to `cover.jpg` before uploading.)
5. Click **Commit changes**.

### 4. Wait about a minute
GitHub rebuilds the site by itself. Open the site and the new record is there.

---

## What each line means

```json
{
  "title": "SONG TITLE",
  "artist": "R4N",
  "category": "mine",
  "type": "Single",
  "date": "31.01.2026",
  "cover": "cover.jpg",
  "description": "Write about the song here. Make a link like this: [R4N](https://www.instagram.com/r4n.wav/).",
  "credits": [
    { "role": "Prod", "people": [
      { "name": "R4N", "url": "https://www.instagram.com/r4n.wav/" }
    ] }
  ],
  "links": {
    "spotify": "",
    "apple": "",
    "youtube": "",
    "soundcloud": ""
  },
  "hidden": false
}
```

| Line | What it does |
|------|--------------|
| `title` | The song name, shown big when the record is opened. |
| `artist` | Who the song is by. Plain text works (`"Some Artist"`), but to make each name a clickable link to their Instagram, use a list: `[ { "name": "LaMar!a", "url": "https://www.instagram.com/_lamar1a_/" }, { "name": "R4N", "url": "https://www.instagram.com/r4n.wav/" } ]`. |
| `category` | **Which side of the toggle it goes on.** `"mine"` = your own songs (MY SONGS). `"worked-on"` = songs you worked on for other artists (WORKED ON). If you leave it out, it counts as `"mine"`. |
| `type` | Shown above the title: `"Single"`, `"EP"`, `"Album"`, `"Mix"`, `"Production"`... anything. |
| `date` | **Official release date**, written as `DD.MM.YYYY` (`"16.10.2026"`) or `YYYY-MM-DD` (`"2026-10-16"`), both work. The site shows it as `16.10.2026`. This decides the order: newest at the front of the tunnel, oldest at the back (same in the index). Songs without a date go last. |
| `cover` | The exact file name of the cover image in the same folder (`.jpg`, `.png` or `.webp`). Square images work best. Around 1000×1000 pixels keeps the site fast. |
| `description` | The text under **ABOUT** when the record is opened. Links: `[shown text](https://...)`. Bold: `**like this**`. New line: `\n`. Leave it as `""` to hide the ABOUT button. |
| `credits` | Lines like "PROD Rumblin, R4N". Add more roles by copying the `{ "role": ... }` block. A person's `url` is optional. |
| `links` | The LISTEN buttons. Paste the full link. Empty ones (`""`) are skipped. Known names: `spotify`, `apple`, `youtube`, `youtubemusic`, `soundcloud`, `tidal`, `deezer`, `bandcamp`, `amazon`, `tiktok`, `instagram`. Any other name also works and is shown as written. |
| `hidden` | `true` keeps the folder but hides the record from the site. Note: the repository is public, so anyone who looks on GitHub can still read a hidden folder and its cover. Don't upload anything here that must stay secret before release. |

### Example: a song you worked on for someone else

```json
{
  "title": "THEIR SONG",
  "artist": "Other Artist",
  "category": "worked-on",
  "type": "Production",
  "date": "14.03.2026",
  "cover": "cover.jpg",
  "description": "Produced and mixed by [R4N](https://www.instagram.com/r4n.wav/).",
  "credits": [
    { "role": "Prod", "people": [ { "name": "R4N", "url": "https://www.instagram.com/r4n.wav/" } ] },
    { "role": "Mix", "people": [ "R4N" ] }
  ],
  "links": {
    "spotify": "https://open.spotify.com/track/..."
  }
}
```

---

## Changing or removing a song

- **Edit:** open the song's `info.json` on GitHub, click the pencil icon, change it, commit.
- **New cover:** upload a new image with the same file name into the folder. GitHub replaces the old one.
- **Remove:** open the folder's `info.json`, click the three dots (…) → **Delete file**, commit. Do the same for the cover. An empty folder disappears on its own.
- **Hide without deleting:** set `"hidden": true` (it disappears from the site, but stays readable on GitHub).

---

## If a song doesn't show up

1. **Wait a minute and refresh.** If it still isn't there, add `?v=2` to the end of the address to skip your browser's cache.
2. **Check `info.json` for a typo.** This is the cause 9 times out of 10. Every line except the last one inside `{ }` needs a comma at the end. Every piece of text needs "straight quotes" (phones sometimes swap them for “curly” ones). Paste the file into https://jsonlint.com and it shows exactly where the mistake is.
3. **Check the cover name.** The `cover` line must match the uploaded file name exactly, including `.jpg` vs `.png` and capital letters.
4. **Check the Actions tab on GitHub.** A yellow warning names any folder with a broken `info.json`.

## Good to know

- Folders starting with `_` (like `_template`) never show on the site.
- `index.json` in this folder updates automatically. Don't edit it.
- Each song has a direct link: `yoursite/#folder-name`. It opens that record straight away, which is handy for Instagram bios.
