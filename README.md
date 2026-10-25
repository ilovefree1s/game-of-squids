# Game of Squids

A collection of small browser games built by two friends.

## Play it

Open `index.html` in a browser. That's it, no install.
Online play needs an internet connection; solo works offline.

**Controls (all games that use `shared/input.js`):**

| | Move | Jump |
|---|---|---|
| Keyboard | WASD / arrow keys | Space |
| Controller | Left stick / d-pad | A (Xbox) / ✕ (PlayStation) |
| Phone | On-screen joystick | JUMP button |

## Folder layout

```
index.html          ← the menu page; lists every mini-game's script
shared/             ← shared by everyone:
  hub.js            ←   menu + score
  input.js          ←   keyboard / controller / phone controls
  net.js            ←   online rooms (Supabase Realtime)
  config.js         ←   Supabase URL + publishable key
  models.js         ←   animated KayKit 3D characters
  models/           ←   the KayKit character + animation files
  lib/              ←   three.js (3D), its model loader, and supabase-js
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
- **Bump the version** in `shared/version.js` with each change (shown bottom-right in the game),
  so you can both tell at a glance if you have the newest version.

## Mini-games

| Game | Author | Status |
|------|--------|--------|
| Snake | Player 1 | playable |
| Reaction Time | Player 2 | playable |
| Glass Bridge (3D, online, KayKit characters) | ilovefree1s | playable |

## 3D

3D games use [three.js](https://threejs.org) (r147), included at `shared/lib/three.min.js`
so the game works offline with no install. It's loaded in `index.html` before the games,
so any mini-game can use the global `THREE`.

## Controls in your own game

```js
const input = Input.create(container);   // draws phone controls inside container
const m = input.move();                  // { x, y }: x = right, y = forward, each -1..1
if (input.jump()) { /* jump! */ }        // true once per press
// in your cleanup: input.destroy();
```

## Online multiplayer

`shared/net.js` gives any game online rooms using Supabase Realtime. No database tables needed.

```js
const room = Net.joinRoom("my-game", "ABCD", "Sam", {
  onPlayers(list) {},          // who's in the room
  onMessage(data, fromId) {},  // something another player sent
});
room.send({ x: 1, y: 2 });     // goes to everyone else in the room
room.leave();                  // in your cleanup
```

`shared/config.js` holds the Supabase **publishable** key, which is safe to be public.
Never commit the secret key (`sb_secret_...`).

## 3D characters (KayKit)

`shared/models.js` gives any 3D game animated characters from the KayKit packs.

```js
await Models.load("knight");            // download first (or Models.loadAll([...]))
const c = Models.spawn("knight");       // new animated copy; null if it couldn't load
scene.add(c.root);
c.play("Running_A");                    // Idle_A, Walking_A, Running_A, Jump_Start, Jump_Idle,
                                        // Jump_Land, Hit_A, Death_A, Cheering, Waving
c.update(dt);                           // every frame
```

Characters: `tracksuit`, `knight`, `barbarian`, `mage`, `ranger`, `rogue`, `rogue-hooded`,
`skeleton-minion`, `skeleton-warrior`, `skeleton-mage`, `skeleton-rogue` (see `Models.CHARACTERS`).

Models only load when the game runs from a website (GitHub Pages, or VS Code's **Live Server**).
Opened straight from the file, browsers block them, so have a fallback for when `spawn()` returns `null`.

Art: **KayKit** by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)), CC0 (free to use).
See `shared/models/KayKit-LICENSE.txt`.
