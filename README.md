# Game of Squids

A collection of small browser games built by two friends.

## Play it

Open `index.html` in a browser. That's it, no install.

(If something doesn't load, run a tiny local server from this folder instead,
e.g. the **Live Server** extension in VS Code.)

## Folder layout

```
index.html          ← the menu page; lists every mini-game's script
shared/             ← hub.js (menu + score), style.css — shared by everyone
minigames/
  snake/            ← one folder per mini-game
  reaction/
  _template/        ← copy this to start a new game
```

## Adding a mini-game

1. Copy `minigames/_template` to `minigames/your-game`.
2. Rename the file, fill in id/name/author, write your game in `start()`.
3. Add one `<script>` line for it in `index.html`.

## Working together (Git rules)

- **Pull before you start.** Always.
- **Own your folders.** Only edit your own mini-game folders.
- **Ask before changing `shared/`.** Everyone's games depend on it.
- **One branch per thing**, e.g. `whack-a-mole` or `fix-snake-speed`.
- **Commit small, commit often**, with a clear message.
- Push your branch → open a Pull Request → the other person merges.

## Mini-games

| Game | Author | Status |
|------|--------|--------|
| Snake | Player 1 | playable |
| Reaction Time | Player 2 | playable |
| Glass Bridge | ilovefree1s | playable |
