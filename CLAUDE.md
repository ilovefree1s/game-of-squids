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

(none right now: Justin has seen them all, 2026-10-25)

## Notes for Cougar

(none right now)
