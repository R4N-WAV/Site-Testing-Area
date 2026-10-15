# How to add a new song or project

Every folder in `releases/` is one record floating in space on the site.
Add a folder and it joins the orbit. Delete the folder and it's gone.

## Add one from the GitHub website (no computer setup needed)

1. Open the `releases` folder on GitHub and open `_template`.
2. Open `info.json`, click the copy button, and keep that text handy.
3. Go back to `releases`, click **Add file → Create new file**.
4. In the file name box, type the folder name, a slash, and `info.json`,
   for example `my-new-song/info.json`. Typing the `/` makes the folder.
   Use lowercase letters, numbers and dashes only (no spaces).
5. Paste the template text, change the details (see below), and click **Commit changes**.
6. Open your new folder, click **Add file → Upload files**, upload your cover art
   and name it the same as the `cover` line in `info.json` (for example `cover.jpg`).
   Click **Commit changes**.

Within a minute or two it's live on the site.

## What goes in info.json

| Line | What it does |
|------|--------------|
| `title` | Name shown on the record and in the panel |
| `artist` | Who it's by, e.g. `"R4N, Bhaai"` |
| `type` | `"Single"`, `"EP"`, `"Album"`, `"Project"`... anything you like |
| `date` | Release date as `YYYY-MM-DD`. Newest records orbit closest to the centre |
| `cover` | File name of the cover art in the same folder (`.jpg`, `.png` or `.webp`). Square images work best; 1000×1000 or smaller keeps the site fast |
| `description` | Text about the song. Links: `[R4N](https://www.instagram.com/r4n.wav/)`. Bold: `**like this**`. New line: `\n` |
| `credits` | Lines like "Prod: Rumblin, R4N". Each person can have a link, or leave `url` out |
| `links` | Listen buttons. Known names: `spotify`, `apple`, `youtube`, `youtubemusic`, `soundcloud`, `tidal`, `deezer`, `bandcamp`, `amazon`, `tiktok`, `instagram`. Any other name works too and shows as written. Empty ones are skipped |
| `vinyl` | Colour of the record, as a hex code: `"#111111"` is classic black, `"#7a1020"` deep red |
| `hidden` | `true` keeps the folder on GitHub but off the site (good for drafts) |

## Rules of thumb

- Folders starting with `_` (like `_template`) never show on the site.
- Each song has its own link: `yoursite/#folder-name` opens it straight away.
- If a folder doesn't show up, the most common cause is a typo in `info.json`
  (a missing comma or quote). The **Actions** tab on GitHub shows a yellow
  warning naming the broken folder. You can paste the file into https://jsonlint.com to find the typo.
- `index.json` in this folder is updated automatically. You don't need to edit it.
