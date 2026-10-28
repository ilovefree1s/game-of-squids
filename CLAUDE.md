# Game of Squids: notes for Claude

Two friends build this game together, each with their own Claude:
- **Justin** (GitHub: ilovefree1s) owns the repo. His game: Glass Bridge. (Snake and Reaction Time
  were demo games from the starter project; they're switched off in `index.html`, files kept.)
- **Cougar** builds Red Light, Green Light (`minigames/red-light/`).

Neither of them is a Git expert. Keep jargon to a minimum, and define any Git term you use
(branch, merge, pull request, etc.) in plain words the first time it comes up.

## At the start of every session

1. Get the latest `main` before doing anything else. The other person merges changes often.
2. Check the notes below for the person you're working with. If there are any, **tell them about
   each note in chat, in plain words, at the start of the session**, before starting their task.
   Once they've seen a note, ask if they want it removed from this file, so it isn't repeated.

## Rules

The working-together rules are in `README.md` ("Working together"), including Cougar's addendum.
In short:
- Work on a branch (a side copy), never directly on `main`.
- Only edit your own mini-game folder. Merge your own folder's changes yourself.
- Shared files (`shared/`, `index.html`, the menu) affect both people's games: test that the other
  person's games still load, merge, and leave them a note below saying what changed.
- Bump the version in `shared/version.js` with every change. Check what's in `main` first and go
  one higher, so you don't both pick the same number.

## Merging (Justin's preference)

- 2026-10-25: **Justin wants Claude to merge his changes itself.** Don't ask him to click "Merge pull request".
  After testing, open the pull request and merge it yourself, then tell him in one line what went live
  and the new version number. If the change touches shared files, still test that Red Light loads and
  leave Cougar a note below before merging.

## Leaving a note

To tell the other person something (a shared file changed, a question, something to watch out for),
add a dated line under their heading below. Their Claude will mention it in chat next session.

## Notes for Justin

- 2026-10-25 (from Cougar): **Fixed a bug in `shared/models.js` (v0.22.1).** The lie-on-the-ground code from v0.20.0
  set every character's `c.root` height back to 0 whenever it wasn't lying down, so a character placed up high
  (Red Light's snipers on their ledge) dropped to the floor. Now it only adds and removes its own lowering, and leaves
  any height your game sets alone. Glass Bridge wasn't affected (its archers sit inside their own group) and still loads.
- 2026-10-26 (from Cougar): **`shared/input.js`: new optional setting `padJump`.** `Input.create(el, { padJump: 1 })`
  makes B / ○ the controller jump button instead of A / ✕. Red Light uses it (A is sprint there). Without the setting
  nothing changes, so Glass Bridge still jumps with A (tested: it loads and runs).
- 2026-10-27 (from Cougar): **All-time scores (new shared file `shared/scores.js`, one `<script>` line in `index.html`).**
  Every mini-game can post results and show online all-time boards (quickest time, most wins, most kills, by mode).
  Red Light uses it. Glass Bridge doesn't yet: if you want boards for it, it's two calls (see "All-time scores" in the
  README). It needs a one-time database setup: `supabase/scores.sql`, pasted into the Supabase SQL Editor. Nothing
  else in `shared/` changed; Glass Bridge still loads and runs.

## Notes for Cougar

(none right now)
