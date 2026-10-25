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

Phone players can drag the joystick and JUMP button anywhere and resize them
(Glass Bridge menu → **Phone controls layout**). The layout is saved on that device.

## Folder layout

```
index.html          ← the menu page; lists every mini-game's script
shared/             ← shared by everyone:
  hub.js            ←   menu + score
  input.js          ←   keyboard / controller / phone controls
  net.js            ←   online rooms (Supabase Realtime)
  config.js         ←   Supabase URL + publishable key
  models.js         ←   animated KayKit 3D characters
  models/           ←   the KayKit character, animation (animations/) and prop (props/) files
  lib/              ←   three.js (3D), its model loader, and supabase-js
assets/kaykit/      ← the FULL KayKit art packs (source files; the game doesn't load these)
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

### Addendum (Cougar)

- **Your own mini-game folder: merge it yourself.** No need to wait for the other person.
  Nothing outside your folder uses those files, so it can't break their games.
- **Shared files (`shared/`, `index.html`, the menu): merge it yourself too, but:**
  - test that the other person's games still load first, and
  - send them a one-line heads-up saying what changed (e.g. "models.js now has every animation, v0.8.0").
- **Get the latest `main` right before you merge**, not just when you start. The other person
  may have merged things in the meantime.
- **Check the version number before bumping it.** If you both bump from the same number
  (e.g. both go 0.7.1 → 0.8.0), the version stops telling you who's newest. Look at what's
  currently in `main` and go one higher.

## Mini-games

| Game | Author | Status |
|------|--------|--------|
| Snake | Player 1 | playable |
| Reaction Time | Player 2 | playable |
| Glass Bridge (3D, online, KayKit characters, push, first across wins) | ilovefree1s | playable |

## 3D

3D games use [three.js](https://threejs.org) (r147), included at `shared/lib/three.min.js`
so the game works offline with no install. It's loaded in `index.html` before the games,
so any mini-game can use the global `THREE`.

## Controls in your own game

```js
const input = Input.create(container);   // draws phone controls inside container
const m = input.move();                  // { x, y }: x = right, y = forward, each -1..1
if (input.jump()) { /* jump! */ }        // true once per press
input.editLayout(onDone);                // let the player move/resize the phone controls
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

Lobby browser (players see open lobbies and click to join, no codes to type):

```js
const lobbies = Net.lobbies("my-game", (list) => showList(list)); // [{ code, host, count, ... }]
lobbies.advertise({ code: room.code, host: "Sam", count: 2 });   // the host lists their lobby
lobbies.hide();                                                  // when the host leaves
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

**Every** KayKit animation (about 130) and every weapon/prop (44) works in any game.
They're split into sets that only download when a game asks for them, so nobody waits for files
their game doesn't use:

```js
await Models.loadAnims(["ranged", "general"]); // sets: general, movement, movement-advanced, melee,
                                               // ranged, simulation, special, tools (or "all")
c.play("Ranged_2H_Shoot");                     // works for any character once its set is loaded

await Models.loadProps(["Skeleton_Crossbow", "shield_round"]);
c.hold("Skeleton_Crossbow", "right", { turn: [0, 90, 0] }); // turn = extra rotation in the hand (degrees)
c.hold("shield_round", "left");
c.hold(null);                                  // empty the right hand
const bolt = Models.prop("Skeleton_Arrow");    // a loose copy to place anywhere
```

The full list of animation and prop names is at the top of `shared/models.js`.

Characters: `tracksuit`, `knight`, `barbarian`, `mage`, `ranger`, `rogue`, `rogue-hooded`,
`skeleton-minion`, `skeleton-warrior`, `skeleton-mage`, `skeleton-rogue` (see `Models.CHARACTERS`).

Models only load when the game runs from a website (GitHub Pages, or VS Code's **Live Server**).
Opened straight from the file, browsers block them, so have a fallback for when `spawn()` returns `null`.

Art: **KayKit** by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)), CC0 (free to use).
See `shared/models/KayKit-LICENSE.txt`.
