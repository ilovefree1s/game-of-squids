// Models: animated KayKit 3D characters any mini-game can use.
// Art: KayKit by Kay Lousberg (www.kaylousberg.com), CC0 — free to use, see shared/models/KayKit-LICENSE.txt
//
//   await Models.load("knight");           // download it once (do this before you need it)
//   const c = Models.spawn("knight");       // a new animated copy, or null if it couldn't load
//   scene.add(c.root);
//   c.play("Running_A", { speed: 1.2 });    // crossfades from the current animation
//   c.update(dt);                           // every frame
//
// Animations (shared/models/animations.glb):
//   Idle_A, Walking_A, Running_A, Jump_Start, Jump_Idle, Jump_Land,
//   Hit_A, Death_A, Cheering, Waving
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
  const HEIGHT = 1.95; // every character is scaled so its (original) body is about this tall
  // Body proportions. KayKit characters are short and chunky; these make them taller and slimmer.
  // All 1 = original look.
  const BODY = { legs: 2.0, torso: 1.55, head: 0.6, slim: 0.68 };
  const byId = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

  let loader = null;
  let animsPromise = null;
  let bodyHeight = null; // the plain mannequin's height, so hats/helmets don't shrink anyone
  const loading = {};
  const ready = {};

  function available() {
    return typeof THREE !== "undefined" && !!THREE.GLTFLoader && !!THREE.SkeletonUtils && location.protocol !== "file:";
  }

  function gltf(url) {
    if (!loader) loader = new THREE.GLTFLoader();
    return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  }

  function animations() {
    if (!animsPromise) {
      animsPromise = gltf(BASE + "animations.glb").then((g) => {
        const clips = {};
        g.animations.forEach((c) => {
          // drop bone-scale keys so our body proportions (BODY below) aren't undone every frame
          c.tracks = c.tracks.filter((t) => !t.name.endsWith(".scale"));
          clips[c.name] = c;
        });
        return clips;
      });
    }
    return animsPromise;
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
        .then(([g, clips]) => {
          ready[info.id] = { scene: g.scene, clips, info };
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
    for (const [name, clip] of Object.entries(d.clips)) actions[name] = mixers.map((mx) => mx.clipAction(clip));
    let current = null;
    let currentName = "";

    function play(name, { fade = 0.15, once = false, speed = 1 } = {}) {
      const a = actions[name];
      if (!a) return;
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

    return {
      root,
      model,
      info: d.info,
      play,
      update: (dt) => mixers.forEach((mx) => mx.update(dt)),
      get playing() { return currentName; },
      bone: (name) => model.getObjectByName(name),
      clipLength: (name) => (d.clips[name] ? d.clips[name].duration : 0),
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

  return { CHARACTERS, available, load, loadAll, spawn, byId };
})();
