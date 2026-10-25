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

- 2026-10-25 (from Cougar): **Every KayKit animation and weapon now works in any game.**
  `shared/models.js` can load all ~130 animations (`Models.loadAnims(["ranged"])`) and all 44
  weapons/items (`Models.loadProps`, then `c.hold("Skeleton_Crossbow")`). Existing games are
  unchanged: old and new versions render identically. The full name lists are at the top of
  `shared/models.js` and in the README. (Merged as PR #9.)
- 2026-10-25 (from Cougar): **Added an addendum to the README's Git rules.** Your rules are unchanged;
  the addendum is underneath. Short version: merge your own mini-game changes yourself; for shared
  files, test the other person's games and leave a note here; get the latest `main` right before
  merging; check the version before bumping. (Merged as PR #10, v0.8.1.)
- 2026-10-25 (from Cougar): **Version numbers collided once.** Your v0.8.0 (Gauntlet / home screen)
  and Cougar's v0.8.0 (animations) were made at the same time. Main is now v0.8.1. That's why the
  "check before bumping" rule was added.
- 2026-10-25 (from Cougar): **Cougar is building Red Light, Green Light** in `minigames/red-light/`:
  3D, online multiplayer, rules like the show, skeleton snipers with crossbows. It will add one
  `<script>` line to `index.html` for the menu, and otherwise stays in its own folder. If it ever
  needs a change to `shared/`, it'll be noted here first.
- 2026-10-25 (from Cougar): **Red Light, Green Light is in the game** (v0.12.0). Shared files it touched:
  one `<script>` line in `index.html` and one row in the README's games table. Nothing in `shared/`.
  It's online for up to 8 players (its own lobby list, "red-light"), with 1-12 computer players, secret
  alliances, push / sprint, and a results screen. It uses `Net`, `Input` and `Models` as they are.
  Its menu uses the same saved name (`gos:name`) and character (`gos:char`) as Glass Bridge.
  The version jumped from 0.8.2 to 0.12.0 because Red Light was bumped for each test build on its branch.
- 2026-10-25 (from Cougar): **`shared/models.js`: fallen characters now lie on the ground.** The long-legs lift
  in `makeBody()` kept a lying character about 1½ ft in the air. Now, while a death / lie-down animation plays
  (`Death_…`, `Lie_…`, `Skeletons_Death…`, `Skeletons_Inactive_Floor…`), `update()` lowers `c.root` so the body
  rests on the floor, and eases it back when another animation plays. Standing, running and jumping are
  unchanged (tested: root height stays 0). Glass Bridge doesn't use those animations, and still loads and runs.
- 2026-10-25 (from Cougar): **This file (`CLAUDE.md`) is new.** Claude Code reads it automatically
  at the start of every session in this repo. Both of you can leave notes for each other here.

## Notes for Cougar

(none right now)
