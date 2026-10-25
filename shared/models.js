// Models: animated KayKit 3D characters any mini-game can use.
// Art: KayKit by Kay Lousberg (www.kaylousberg.com), CC0 — free to use, see shared/models/KayKit-LICENSE.txt
//
//   await Models.load("knight");           // download it once (do this before you need it)
//   const c = Models.spawn("knight");       // a new animated copy, or null if it couldn't load
//   scene.add(c.root);
//   c.play("Running_A", { speed: 1.2 });    // crossfades from the current animation
//   (death / lie-down animations lower the character onto the ground by themselves)
//   c.update(dt);                           // every frame
//
// Animations
//   Always loaded with any character (shared/models/animations.glb):
//     Idle_A, Walking_A, Running_A, Jump_Start, Jump_Idle, Jump_Land,
//     Hit_A, Death_A, Cheering, Waving
//
//   Every other KayKit animation works too. They come in sets (shared/models/animations/),
//   downloaded only by games that use them. Load the sets you need before the game starts:
//     await Models.loadAnims(["ranged", "general"]);
//   (Playing one that isn't loaded yet still works: its set downloads and it starts a moment later.)
//
//   general:           Death_A, Death_A_Pose, Death_B, Death_B_Pose, Hit_A, Hit_B, Idle_A, Idle_B,
//                      Interact, PickUp, Spawn_Air, Spawn_Ground, Throw, Use_Item
//   movement:          Jump_Full_Long, Jump_Full_Short, Jump_Idle, Jump_Land, Jump_Start,
//                      Running_A, Running_B, Walking_A, Walking_B, Walking_C
//   movement-advanced: Crawling, Crouching, Dodge_Backward, Dodge_Forward, Dodge_Left, Dodge_Right,
//                      Running_HoldingBow, Running_HoldingRifle, Running_Strafe_Left,
//                      Running_Strafe_Right, Sneaking, Walking_Backwards
//   melee:             Melee_1H_Attack_Chop, Melee_1H_Attack_Jump_Chop, Melee_1H_Attack_Slice_Diagonal,
//                      Melee_1H_Attack_Slice_Horizontal, Melee_1H_Attack_Stab, Melee_2H_Attack_Chop,
//                      Melee_2H_Attack_Slice, Melee_2H_Attack_Spin, Melee_2H_Attack_Spinning,
//                      Melee_2H_Attack_Stab, Melee_2H_Idle, Melee_Block, Melee_Block_Attack,
//                      Melee_Block_Hit, Melee_Blocking, Melee_Dualwield_Attack_Chop,
//                      Melee_Dualwield_Attack_Slice, Melee_Dualwield_Attack_Stab,
//                      Melee_Unarmed_Attack_Kick, Melee_Unarmed_Attack_Punch_A, Melee_Unarmed_Idle
//   ranged:            Ranged_1H_Aiming, Ranged_1H_Reload, Ranged_1H_Shoot, Ranged_1H_Shooting,
//                      Ranged_2H_Aiming, Ranged_2H_Reload, Ranged_2H_Shoot, Ranged_2H_Shooting,
//                      Ranged_Bow_Aiming_Idle, Ranged_Bow_Draw, Ranged_Bow_Draw_Up, Ranged_Bow_Idle,
//                      Ranged_Bow_Release, Ranged_Bow_Release_Up, Ranged_Magic_Raise, Ranged_Magic_Shoot,
//                      Ranged_Magic_Spellcasting, Ranged_Magic_Spellcasting_Long, Ranged_Magic_Summon
//   simulation:        Cheering, Lie_Down, Lie_Idle, Lie_StandUp, Push_Ups, Sit_Chair_Down,
//                      Sit_Chair_Idle, Sit_Chair_StandUp, Sit_Floor_Down, Sit_Floor_Idle,
//                      Sit_Floor_StandUp, Sit_Ups, Waving
//   special:           EXPERIMENTAL_Medium_Transform, Skeletons_Awaken_Floor, Skeletons_Awaken_Floor_Long,
//                      Skeletons_Awaken_Standing, Skeletons_Death, Skeletons_Death_Pose,
//                      Skeletons_Death_Resurrect, Skeletons_Idle, Skeletons_Inactive_Floor_Pose,
//                      Skeletons_Inactive_Standing_Pose, Skeletons_Spawn_Ground, Skeletons_Taunt,
//                      Skeletons_Taunt_Longer, Skeletons_Walking
//   tools:             Chop, Chopping, Dig, Digging, Fishing_Bite, Fishing_Cast, Fishing_Catch,
//                      Fishing_Idle, Fishing_Reeling, Fishing_Struggling, Fishing_Tug, Hammer, Hammering,
//                      Holding_A, Holding_B, Holding_C, Lockpick, Lockpicking, Pickaxe, Pickaxing, Saw,
//                      Sawing, Work_A, Work_B, Work_C, Working_A, Working_B, Working_C
//
// Props: weapons and items a character can hold (shared/models/props/)
//   await Models.loadProps(["Skeleton_Crossbow"]);
//   c.hold("Skeleton_Crossbow");            // right hand; c.hold("shield_round", "left") for the left
//   c.hold("Skeleton_Crossbow", "right", { turn: [0, 90, 0] }); // rotate it in the hand (degrees)
//   c.hold(null);                           // empty the right hand
//   const bolt = Models.prop("Skeleton_Arrow"); // a loose copy to put anywhere in your scene
//
//   Adventurers: arrow_bow, arrow_bow_bundle, arrow_crossbow, arrow_crossbow_bundle, axe_1handed,
//     axe_2handed, bow, bow_withString, crossbow_1handed, crossbow_2handed, dagger, mug_empty,
//     mug_full, quiver, shield_badge, shield_badge_color, shield_round, shield_round_barbarian,
//     shield_round_color, shield_spikes, shield_spikes_color, shield_square, shield_square_color,
//     smokebomb, spellbook_closed, spellbook_open, staff, sword_1handed, sword_2handed,
//     sword_2handed_color, wand
//   Skeletons: Skeleton_Arrow, Skeleton_Arrow_Broken, Skeleton_Arrow_Broken_Half, Skeleton_Arrow_Half,
//     Skeleton_Axe, Skeleton_Blade, Skeleton_Crossbow, Skeleton_Quiver, Skeleton_Shield_Large_A,
//     Skeleton_Shield_Large_B, Skeleton_Shield_Small_A, Skeleton_Shield_Small_B, Skeleton_Staff
//
// Models need the game to be served from a website (GitHub Pages or a local server).
// Opened straight from a file (file://) browsers block loading them, so games should fall back
// to simple shapes when Models.spawn() returns null.

const Models = (() => {
  const CHARACTERS = [
    { id: "tracksuit", label: "Tracksuit", file: "Mannequin", tint: 0x0d4a36, headFrom: "knight" },
    { id: "knight", label: "Knight", file: "Knight" },
    { id: "barbarian", label: "Barbarian", file: "Barbarian" },
    { id: "mage", label: "Mage", file: "Mage" },
    { id: "ranger", label: "Ranger", file: "Ranger" },
    { id: "rogue", label: "Rogue", file: "Rogue" },
    { id: "rogue-hooded", label: "Hooded Rogue", file: "Rogue_Hooded" },
    { id: "skeleton-minion", label: "Skeleton Minion", file: "Skeleton_Minion" },
    { id: "skeleton-warrior", label: "Skeleton Warrior", file: "Skeleton_Warrior" },
    { id: "skeleton-mage", label: "Skeleton Mage", file: "Skeleton_Mage" },
    { id: "skeleton-rogue", label: "Skeleton Rogue", file: "Skeleton_Rogue" },
  ];
  const BASE = "shared/models/";
  const LYING = /^(Death_|Lie_|Skeletons_Death|Skeletons_Inactive_Floor)/; // animations that end lying on the ground
  const HEIGHT = 1.95; // every character is scaled so its (original) body is about this tall
  // Body proportions. KayKit characters are short and chunky; these make them taller and slimmer.
  // All 1 = original look.
  const BODY = { legs: 2.0, torso: 1.55, head: 0.6, slim: 0.68 };
  const byId = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

  // Animation sets (see the list at the top). "basic" is the small file every character loads.
  const ANIM_SETS = {
    basic: "animations.glb",
    general: "animations/general.glb",
    movement: "animations/movement.glb",
    "movement-advanced": "animations/movement-advanced.glb",
    melee: "animations/melee.glb",
    ranged: "animations/ranged.glb",
    simulation: "animations/simulation.glb",
    special: "animations/special.glb",
    tools: "animations/tools.glb",
  };
  // Which set each animation is in, so play() can fetch a set nobody loaded yet.
  // Clips in "basic" are also in general/movement/simulation; basic is always loaded first.
  const CLIP_SET = {};
  const SET_CLIPS = {
    general: "Death_A Death_A_Pose Death_B Death_B_Pose Hit_A Hit_B Idle_A Idle_B Interact PickUp Spawn_Air Spawn_Ground Throw Use_Item",
    movement: "Jump_Full_Long Jump_Full_Short Jump_Idle Jump_Land Jump_Start Running_A Running_B Walking_A Walking_B Walking_C",
    "movement-advanced": "Crawling Crouching Dodge_Backward Dodge_Forward Dodge_Left Dodge_Right Running_HoldingBow Running_HoldingRifle Running_Strafe_Left Running_Strafe_Right Sneaking Walking_Backwards",
    melee: "Melee_1H_Attack_Chop Melee_1H_Attack_Jump_Chop Melee_1H_Attack_Slice_Diagonal Melee_1H_Attack_Slice_Horizontal Melee_1H_Attack_Stab Melee_2H_Attack_Chop Melee_2H_Attack_Slice Melee_2H_Attack_Spin Melee_2H_Attack_Spinning Melee_2H_Attack_Stab Melee_2H_Idle Melee_Block Melee_Block_Attack Melee_Block_Hit Melee_Blocking Melee_Dualwield_Attack_Chop Melee_Dualwield_Attack_Slice Melee_Dualwield_Attack_Stab Melee_Unarmed_Attack_Kick Melee_Unarmed_Attack_Punch_A Melee_Unarmed_Idle",
    ranged: "Ranged_1H_Aiming Ranged_1H_Reload Ranged_1H_Shoot Ranged_1H_Shooting Ranged_2H_Aiming Ranged_2H_Reload Ranged_2H_Shoot Ranged_2H_Shooting Ranged_Bow_Aiming_Idle Ranged_Bow_Draw Ranged_Bow_Draw_Up Ranged_Bow_Idle Ranged_Bow_Release Ranged_Bow_Release_Up Ranged_Magic_Raise Ranged_Magic_Shoot Ranged_Magic_Spellcasting Ranged_Magic_Spellcasting_Long Ranged_Magic_Summon",
    simulation: "Cheering Lie_Down Lie_Idle Lie_StandUp Push_Ups Sit_Chair_Down Sit_Chair_Idle Sit_Chair_StandUp Sit_Floor_Down Sit_Floor_Idle Sit_Floor_StandUp Sit_Ups Waving",
    special: "EXPERIMENTAL_Medium_Transform Skeletons_Awaken_Floor Skeletons_Awaken_Floor_Long Skeletons_Awaken_Standing Skeletons_Death Skeletons_Death_Pose Skeletons_Death_Resurrect Skeletons_Idle Skeletons_Inactive_Floor_Pose Skeletons_Inactive_Standing_Pose Skeletons_Spawn_Ground Skeletons_Taunt Skeletons_Taunt_Longer Skeletons_Walking",
    tools: "Chop Chopping Dig Digging Fishing_Bite Fishing_Cast Fishing_Catch Fishing_Idle Fishing_Reeling Fishing_Struggling Fishing_Tug Hammer Hammering Holding_A Holding_B Holding_C Lockpick Lockpicking Pickaxe Pickaxing Saw Sawing Work_A Work_B Work_C Working_A Working_B Working_C",
  };
  for (const [set, names] of Object.entries(SET_CLIPS)) names.split(" ").forEach((n) => (CLIP_SET[n] ??= set));

  // Weapons and items (see the list at the top), one .glb each in shared/models/props/
  const PROPS = (
    "arrow_bow arrow_bow_bundle arrow_crossbow arrow_crossbow_bundle axe_1handed axe_2handed bow bow_withString " +
    "crossbow_1handed crossbow_2handed dagger mug_empty mug_full quiver shield_badge shield_badge_color shield_round " +
    "shield_round_barbarian shield_round_color shield_spikes shield_spikes_color shield_square shield_square_color " +
    "smokebomb spellbook_closed spellbook_open staff sword_1handed sword_2handed sword_2handed_color wand " +
    "Skeleton_Arrow Skeleton_Arrow_Broken Skeleton_Arrow_Broken_Half Skeleton_Arrow_Half Skeleton_Axe Skeleton_Blade " +
    "Skeleton_Crossbow Skeleton_Quiver Skeleton_Shield_Large_A Skeleton_Shield_Large_B Skeleton_Shield_Small_A " +
    "Skeleton_Shield_Small_B Skeleton_Staff"
  ).split(" ");

  let loader = null;
  let bodyHeight = null; // the plain mannequin's height, so hats/helmets don't shrink anyone
  const loading = {};
  const ready = {};
  const clips = {}; // every animation loaded so far, by name, shared by all characters
  const setLoading = {};
  const propLoading = {};
  const propReady = {};

  function available() {
    return typeof THREE !== "undefined" && !!THREE.GLTFLoader && !!THREE.SkeletonUtils && location.protocol !== "file:";
  }

  function gltf(url) {
    if (!loader) loader = new THREE.GLTFLoader();
    return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  }

  // Download one animation set. Safe to call many times.
  function loadSet(set) {
    if (!ANIM_SETS[set]) return Promise.reject(new Error("Unknown animation set: " + set));
    if (!available()) return Promise.reject(new Error("3D models need the game to run from a website"));
    if (!setLoading[set]) {
      setLoading[set] = gltf(BASE + ANIM_SETS[set]).then((g) => {
        g.animations.forEach((c) => {
          if (clips[c.name]) return; // already have it (e.g. Idle_A from the basic file)
          // drop bone-scale keys so our body proportions (BODY below) aren't undone every frame
          c.tracks = c.tracks.filter((t) => !t.name.endsWith(".scale"));
          clips[c.name] = c;
        });
        return clips;
      });
      setLoading[set].catch(() => delete setLoading[set]); // allow a retry later
    }
    return setLoading[set];
  }

  function animations() {
    return loadSet("basic");
  }

  // Download extra animation sets, e.g. Models.loadAnims(["ranged", "general"]). Use "all" for every set.
  function loadAnims(sets) {
    const list = sets === "all" ? Object.keys(ANIM_SETS) : [].concat(sets);
    return Promise.all(list.map(loadSet)).then(() => clips);
  }

  // Download props, e.g. Models.loadProps(["Skeleton_Crossbow", "Skeleton_Arrow"]). Safe to call many times.
  function loadProps(names) {
    if (!available()) return Promise.reject(new Error("3D models need the game to run from a website"));
    return Promise.all([].concat(names).map((name) => {
      if (!PROPS.includes(name)) return Promise.reject(new Error("Unknown prop: " + name));
      if (!propLoading[name]) {
        propLoading[name] = Promise.all([gltf(BASE + "props/" + name + ".glb"), baseHeight()]).then(([g]) => {
          g.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          propReady[name] = g.scene;
          return g.scene;
        });
        propLoading[name].catch(() => delete propLoading[name]);
      }
      return propLoading[name];
    }));
  }

  // A loose copy of a loaded prop, sized to match the characters. null if it isn't loaded.
  function prop(name) {
    const src = propReady[name];
    if (!src) return null;
    const o = src.clone();
    const s = HEIGHT / (bodyHeight || 1);
    o.scale.setScalar(s);
    return o;
  }

  function measure(scene) {
    const box = new THREE.Box3().setFromObject(scene);
    return box.max.y - box.min.y;
  }

  // The plain mannequin's height: every character is sized from it, so hats don't shrink anyone.
  let baseHeightPromise = null;
  function baseHeight() {
    if (!baseHeightPromise) {
      baseHeightPromise = gltf(BASE + "characters/Mannequin.glb").then((g) => (bodyHeight = measure(g.scene)));
      baseHeightPromise.catch(() => (baseHeightPromise = null));
    }
    return baseHeightPromise;
  }

  // Download a character (and the shared animations). Safe to call many times.
  function load(id) {
    const info = byId(id);
    if (!available()) return Promise.reject(new Error("3D models need the game to run from a website"));
    if (!loading[info.id]) {
      const head = info.headFrom ? load(info.headFrom) : null; // borrowed head
      loading[info.id] = Promise.all([gltf(BASE + "characters/" + info.file + ".glb"), animations(), baseHeight(), head])
        .then(([g]) => {
          ready[info.id] = { scene: g.scene, info };
          return ready[info.id];
        });
      loading[info.id].catch(() => delete loading[info.id]); // allow a retry later
    }
    return loading[info.id];
  }

  // Load several, but never wait longer than `ms`. Resolves either way.
  function loadAll(ids, ms = 8000) {
    const all = Promise.allSettled([...new Set(ids)].map(load));
    return Promise.race([all, new Promise((r) => setTimeout(r, ms))]);
  }

  // A fresh animated copy of a loaded character, facing -Z (away from the camera), feet at y = 0.
  // Characters with `headFrom` (the tracksuit) wear another character's head: two copies on the
  // same skeleton animate together, one showing only its body, the other only its head.
  function spawn(id) {
    const d = ready[byId(id).id];
    if (!d) return null;
    const root = new THREE.Group();
    const parts = [makeBody(d)];
    const hd = d.info.headFrom && ready[d.info.headFrom];
    if (hd) {
      parts[0].traverse((o) => { if (o.isMesh && /head/i.test(o.name)) o.visible = false; });
      const headPart = makeBody(hd);
      headPart.traverse((o) => { if (o.isMesh && !/_head$/i.test(o.name)) o.visible = false; });
      parts.push(headPart);
    }
    parts.forEach((m) => root.add(m));
    const model = parts[0];

    const mixers = parts.map((m) => new THREE.AnimationMixer(m));
    const actions = {};
    let current = null;
    let currentName = "";
    let wanted = ""; // an animation asked for whose set is still downloading

    function action(name) {
      if (!actions[name] && clips[name]) actions[name] = mixers.map((mx) => mx.clipAction(clips[name]));
      return actions[name];
    }

    function play(name, opts = {}) {
      const { fade = 0.15, once = false, speed = 1 } = opts;
      const a = action(name);
      if (!a) {
        // not downloaded yet: fetch its set, then start it (unless something else was asked for meanwhile)
        const set = CLIP_SET[name];
        if (!set) { console.warn("Models: no animation named " + name); return; }
        wanted = name;
        loadSet(set).then(() => { if (wanted === name) play(name, opts); }).catch(() => {});
        return;
      }
      wanted = "";
      a.forEach((x) => (x.timeScale = speed));
      if (currentName === name) return;
      a.forEach((x, i) => {
        x.reset();
        x.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        x.clampWhenFinished = once;
        x.enabled = true;
        x.play();
        if (current) current[i].crossFadeTo(x, fade, false);
      });
      current = a;
      currentName = name;
    }
    play("Idle_A", { fade: 0 });

    // Held props follow the hand bone. They're not parented to it, because the stretched body
    // (BODY above) would stretch and skew them too; instead update() copies the hand's position
    // and rotation onto them every frame, at normal proportions.
    const SLOTS = { right: "handslotr", left: "handslotl" };
    const held = {}; // hand -> { obj, bone, turn }
    const tmpP = new THREE.Vector3();
    const tmpQ = new THREE.Quaternion();
    const propScale = HEIGHT / (bodyHeight || measure(d.scene));

    // Put a loaded prop in a hand ("right" or "left"). Returns the prop, or null.
    // hold(null) empties the hand. Load props first: await Models.loadProps([...]).
    // turn: extra rotation in the hand, [x, y, z] in degrees. KayKit props sit in the hand the way
    // the pack's pictures show (a crossbow held across the body); for the 2-handed aim/shoot
    // animations a crossbow needs { turn: [0, 90, 0] } to point forward.
    function hold(name, hand = "right", { turn = [0, 0, 0] } = {}) {
      if (held[hand]) { root.remove(held[hand].obj); delete held[hand]; }
      if (!name) return null;
      const bone = model.getObjectByName(SLOTS[hand]);
      const obj = prop(name);
      if (!bone || !obj) {
        if (!obj) console.warn("Models: prop " + name + " isn't loaded (Models.loadProps first)");
        return null;
      }
      obj.scale.setScalar(propScale);
      root.add(obj);
      const r = THREE.MathUtils.degToRad;
      held[hand] = { obj, bone, turn: new THREE.Quaternion().setFromEuler(new THREE.Euler(r(turn[0]), r(turn[1]), r(turn[2]))) };
      followHands();
      return obj;
    }

    function followHands() {
      const hands = Object.values(held);
      if (!hands.length) return;
      root.updateMatrixWorld(true);
      for (const h of hands) {
        // position: where the (stretched) hand really is
        h.bone.getWorldPosition(tmpP);
        h.obj.position.copy(root.worldToLocal(tmpP));
        // rotation: the hand's rotation from the animation alone, without the stretch skewing it
        tmpQ.identity();
        for (let o = h.bone; o && o !== root; o = o.parent) tmpQ.premultiply(o.quaternion);
        h.obj.quaternion.copy(tmpQ).multiply(h.turn);
      }
    }

    // Lying on the ground (death / lie-down animations): the long-legs lift in makeBody() keeps a
    // standing character's feet on the floor, but would leave a fallen one floating. While one of these
    // animations plays, lower the character until its lowest bone is just above the floor (the floor is
    // y = 0 of whatever root is placed in); otherwise ease back to normal height.
    const tmpB = new THREE.Vector3();
    let drop = 0; // how far we've lowered the root; only this part of its height is ours to change
    function groundIfLying(dt) {
      let goal = 0;
      if (LYING.test(currentName)) {
        let lo = Infinity;
        root.updateMatrixWorld(true);
        model.traverse((o) => { if (o.isBone) { o.getWorldPosition(tmpB); root.worldToLocal(tmpB); if (tmpB.y < lo) lo = tmpB.y; } });
        // lo is measured from the root's own origin, so lowering the root by (lo - 0.1) puts that bone 4 in up
        if (isFinite(lo)) goal = Math.min(0, 0.1 - lo); // (bones sit about 4 in inside the body)
      }
      const next = drop + (goal - drop) * Math.min(1, dt * 6);
      root.position.y += next - drop; // games may place the root at any height (a ledge); keep that
      drop = next;
    }

    return {
      root,
      model,
      info: d.info,
      play,
      hold,
      held: (hand = "right") => (held[hand] ? held[hand].obj : null),
      update: (dt) => { mixers.forEach((mx) => mx.update(dt)); groundIfLying(dt); followHands(); },
      get playing() { return currentName; },
      bone: (name) => model.getObjectByName(name),
      clipLength: (name) => (clips[name] ? clips[name].duration : 0),
    };
  }

  // One scaled, stretched copy of a character's model
  function makeBody(d) {
    const model = THREE.SkeletonUtils.clone(d.scene);
    const scale = HEIGHT / (bodyHeight || measure(d.scene));
    model.scale.set(scale * BODY.slim, scale, scale * BODY.slim);
    model.rotation.y = Math.PI; // KayKit characters face +Z
    // taller and slimmer: stretch the legs and the spine, keep the head a normal size
    const bone = (n) => model.getObjectByName(n);
    for (const side of ["l", "r"]) {
      const leg = bone("upperleg" + side);
      if (leg) leg.scale.set(1, BODY.legs, 1);
    }
    const spine = bone("spine");
    if (spine) spine.scale.set(1, BODY.torso, 1);
    const head = bone("head");
    if (head) head.scale.set(BODY.head / BODY.slim, BODY.head / BODY.torso, BODY.head / BODY.slim);
    // longer legs reach below the floor: lift the whole model so the feet stand where they used to
    const toe = bone("toesl") || bone("footl");
    if (toe && d.toeY === undefined) {
      d.scene.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      d.toeY = d.scene.getObjectByName(toe.name).getWorldPosition(v).y; // original toe height (model units)
    }
    if (toe) {
      model.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      const now = toe.getWorldPosition(v).y; // toe height after stretching (world units)
      model.position.y = d.toeY * scale - now;
    }
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (/helmet|visor/i.test(o.name)) o.visible = false; // no helmets: show everyone's face
      o.frustumCulled = false; // animated meshes can move outside their bounds
      if (d.info.tint) {
        o.material = o.material.clone();
        o.material.color.set(d.info.tint).convertSRGBToLinear(); // so dark colors stay dark
      }
    });
    return model;
  }

  return {
    CHARACTERS, available, load, loadAll, spawn, byId,
    loadAnims, loadProps, prop,
    ANIM_SETS: Object.keys(ANIM_SETS), PROPS,
    animations: () => Object.keys(clips), // names of every animation loaded so far
  };
})();
