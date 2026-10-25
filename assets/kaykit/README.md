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
The game uses web-ready copies in `shared/models/`, loaded through `shared/models.js`:
- `characters/`: the characters
- `animations.glb`: the small basic set every character loads
- `animations/`: every Rig_Medium animation set from Character_Animations_1.1, with the
  mannequin mesh stripped out of each file (bones + animations only, about half the size)
- `props/`: every weapon/item from Adventurers_2.0 and Skeletons_1.1, each packed into one `.glb`

The Rig_Large animations aren't copied, since no character in the game uses that rig yet.

All Medium characters (adventurers, skeletons, mannequin) share the **Rig_Medium** skeleton,
so every `Rig_Medium` animation works on all of them.

Art by **Kay Lousberg** ([kaylousberg.com](https://www.kaylousberg.com)), CC0: free to use in personal and commercial projects.
Each pack's `License.txt` is inside its folder.
