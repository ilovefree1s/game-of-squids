# KayKit art packs (full)

The complete KayKit packs, so anyone working on the game has every model, animation and texture.

| Folder | Pack |
|---|---|
| `Adventurers_2.0/` | KayKit Adventurers 2.0 (FREE): Knight, Barbarian, Mage, Ranger, Rogue + weapons/props |
| `Skeletons_1.1/` | KayKit Skeletons 1.1 (FREE): Minion, Warrior, Mage, Rogue + weapons |
| `Character_Animations_1.1/` | KayKit Character Animations 1.1: Rig_Medium / Rig_Large animations + mannequins |

Each pack has the same files in several formats (`gltf`/`glb` for the web, `fbx`, `obj`).
For the browser games, use the **glTF/GLB** files.

**These are the source files: the game doesn't load anything from this folder.**
The game uses the trimmed copies in `shared/models/` (characters + one small animations file),
loaded through `shared/models.js`. To use something new from here in a game, copy the `.glb`
into `shared/models/` (or ask Claude to add it to `Models`).

All Medium characters (adventurers, skeletons, mannequin) share the **Rig_Medium** skeleton,
so every `Rig_Medium` animation works on all of them.

Art by **Kay Lousberg** ([kaylousberg.com](https://www.kaylousberg.com)), CC0: free to use in personal and commercial projects.
Each pack's `License.txt` is inside its folder.
