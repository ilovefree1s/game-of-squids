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
    { id: "tracksuit", label: "Tracksuit", file: "Mannequin", tint: 0x2c9a78 },
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
  const HEIGHT = 1.95; // every character is scaled so its body is about this tall
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
        g.animations.forEach((c) => (clips[c.name] = c));
        return clips;
      });
    }
    return animsPromise;
  }

  function measure(scene) {
    const box = new THREE.Box3().setFromObject(scene);
    return box.max.y - box.min.y;
  }

  // Download a character (and the shared animations). Safe to call many times.
  function load(id) {
    const info = byId(id);
    if (!available()) return Promise.reject(new Error("3D models need the game to run from a website"));
    if (!loading[info.id]) {
      const base = info.file === "Mannequin" || bodyHeight ? Promise.resolve() : load("tracksuit");
      loading[info.id] = Promise.all([gltf(BASE + "characters/" + info.file + ".glb"), animations(), base])
        .then(([g, clips]) => {
          const h = measure(g.scene);
          if (info.file === "Mannequin") bodyHeight = h;
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
  function spawn(id) {
    const d = ready[byId(id).id];
    if (!d) return null;
    const model = THREE.SkeletonUtils.clone(d.scene);
    const scale = HEIGHT / (bodyHeight || measure(d.scene));
    model.scale.setScalar(scale);
    model.rotation.y = Math.PI; // KayKit characters face +Z
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (/helmet|visor/i.test(o.name)) o.visible = false; // no helmets: show everyone's face
      o.frustumCulled = false; // animated meshes can move outside their bounds
      if (d.info.tint) {
        o.material = o.material.clone();
        o.material.color.set(d.info.tint);
      }
    });
    const root = new THREE.Group();
    root.add(model);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [name, clip] of Object.entries(d.clips)) actions[name] = mixer.clipAction(clip);
    let current = null;
    let currentName = "";

    function play(name, { fade = 0.15, once = false, speed = 1 } = {}) {
      const a = actions[name];
      if (!a) return;
      a.timeScale = speed;
      if (currentName === name) return;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.enabled = true;
      a.play();
      if (current) current.crossFadeTo(a, fade, false);
      current = a;
      currentName = name;
    }
    play("Idle_A", { fade: 0 });

    return {
      root,
      model,
      info: d.info,
      play,
      update: (dt) => mixer.update(dt),
      get playing() { return currentName; },
      bone: (name) => model.getObjectByName(name),
    };
  }

  return { CHARACTERS, available, load, loadAll, spawn, byId };
})();
