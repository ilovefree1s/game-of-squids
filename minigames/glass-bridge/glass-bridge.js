// Glass Bridge (3D) — run and jump across 18 rows of glass panels.
// In every row one panel is tempered (holds) and one is weak (shatters the moment you land on it).
//
// SOLO:   3 players, one at a time. When one falls, the next starts from the platform.
// If EVERYONE falls, everyone respawns for another round; broken glass stays broken.
// The match ends when someone crosses or the 120s clock runs out.
// ONLINE: one player hosts a lobby; everyone else picks it from the list of open lobbies (up to 8).
//         Everyone runs the same bridge at the same time. You can watch each other —
//         and learn from each other's mistakes. Online, the host can Rematch from the results screen.
//
// GAME OPTIONS (solo: you pick; online: the host picks, everyone sees them):
//   time limit (off / 60 / 90 / 120 / 180s), show safe tiles in green, players bump each other,
//   free play (respawn instantly when you fall; ends when everyone has crossed or time runs out)
//
// FIRST PLAYER ACROSS WINS. PUSH shoves whoever is in front of you.
//
// Controls (shared/input.js):
//   Keyboard   WASD / arrows to move, Space to jump, F to push (3 second cooldown)
//   Controller left stick / d-pad to move, A / ✕ to jump, X / □ to push
//   Phone      on-screen joystick + JUMP + PUSH buttons (movable / resizable)
//
// Needs (loaded in index.html): shared/lib/three.min.js, shared/input.js,
// and for online play shared/lib/supabase.js + shared/config.js + shared/net.js.

Hub.register({
  id: "glass-bridge",
  name: "Glass Bridge",
  description: "Run, jump, pray the glass holds. Solo or online. (3D)",
  author: "ilovefree1s",
  color: "#5ad1ff",
  // home-screen picture: two rows of glass panels running into the distance
  art: `<svg viewBox="0 0 120 70"><g fill="rgba(90,209,255,.18)" stroke="#5ad1ff" stroke-width="2">
    <path d="M14 66 L38 66 L44 46 L26 46 Z"/><path d="M82 66 L106 66 L94 46 L76 46 Z"/>
    <path d="M30 40 L45 40 L49 27 L37 27 Z"/><path d="M75 40 L90 40 L83 27 L71 27 Z"/>
    <path d="M40 22 L50 22 L52 13 L44 13 Z"/><path d="M70 22 L80 22 L76 13 L68 13 Z"/>
    <path d="M47 9 L53 9 L54 4 L49 4 Z"/><path d="M67 9 L73 9 L71 4 L66 4 Z"/></g></svg>`,

  start(container, api) {
    if (typeof THREE === "undefined" || typeof Input === "undefined") {
      container.textContent = "Missing shared/lib/three.min.js or shared/input.js.";
      return;
    }

    // ---------- settings ----------
    const STEPS = 18;
    const SOLO_PLAYERS = 3;
    const TIME_CHOICES = [0, 60, 90, 120, 180]; // 0 = no time limit
    const COUNTDOWN = 3; // seconds before the clock starts
    const MAX_ONLINE = 8;
    const ROW_GAP = 2.4;
    const LANE_X = 1.25;
    const PANEL = 1.6; // glass panel size
    const FIRST_Z = -4;
    const GRAVITY = 24;
    const SPEED = 4.2; // run speed
    const JUMP_V = 7; // jump strength (a full-speed jump covers about one row)
    const SEND_EVERY = 0.1; // online: seconds between position updates
    const PUSH_ENABLED = true; // the PUSH button (F / X□ / phone PUSH)
    const BLOCK_SHOVE = PANEL * 0.5; // jump into someone standing on a tile: they slide back half a tile
    const PUSH_RANGE = 1.5; // how far a push reaches
    const PUSH_FORCE = 9; // how hard a push shoves
    const PUSH_COOLDOWN = 3; // seconds between pushes
    const PUSH_ANIM = 0.45; // how long the shove animation lasts
    const HIT_ANIM = 0.45; // how long the "got hit" stagger lasts

    const rowZ = (i) => FIRST_Z - i * ROW_GAP;
    const laneX = (side) => (side === 0 ? -LANE_X : LANE_X); // 0 = left, 1 = right
    const lastZ = rowZ(STEPS - 1);
    const FINISH_Z = lastZ - PANEL / 2 - 1.2 - 2.5; // center of finish platform
    const START = { x0: -3, x1: 3, z0: -2.3, z1: 1.7 };
    const FINISH = { x0: -3, x1: 3, z0: FINISH_Z - 2.5, z1: FINISH_Z + 2.5 };

    // ---------- state ----------
    let mode = "lobby"; // "lobby" | "solo" | "online"
    let room = null;
    let safe = [];
    let order = []; // all players: { id, name, num, mesh, out, finished, best, vel, onGround, target, ... }
    let soloIdx = 0; // solo: which of the 3 players you're controlling
    let soloBest = -1;
    let round = 1; // goes up each time everyone falls and respawns
    let respawnPending = false;
    let matchId = ""; // online: messages from an older match are ignored
    const send = (d) => { if (mode === "online" && room) room.send({ ...d, m: matchId }); };
    let started = false;
    let done = false;
    let countdown = 0; // > 0 while counting down
    let clockLeft = 0;
    let elapsed = 0; // seconds since GO
    let finishCount = 0;

    // ---------- game options ----------
    const DEFAULT_OPTS = { time: 120, showSafe: true, bump: true, freePlay: false };
    let opts = (() => { // what you picked (remembered)
      try { return { ...DEFAULT_OPTS, ...JSON.parse(localStorage.getItem("gos:gbOpts") || "{}") }; } catch { return { ...DEFAULT_OPTS }; }
    })();
    let rules = { ...opts }; // the rules of the match being played
    const saveOpts = () => { try { localStorage.setItem("gos:gbOpts", JSON.stringify(opts)); } catch {} };
    const rulesText = (o) => [
      o.time ? `${o.time}s limit` : "no time limit",
      o.showSafe ? "safe tiles shown" : "safe tiles hidden",
      o.bump ? "bumping on" : "no bumping",
      o.freePlay ? "free play (instant respawns)" : "respawn when everyone falls",
    ].join(" · ");
    const clockText = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
    const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
    const timeouts = [];
    const later = (fn, ms) => timeouts.push(setTimeout(fn, ms));

    const randomSafe = () => Array.from({ length: STEPS }, () => (Math.random() < 0.5 ? 0 : 1));
    const randomNumbers = (n) => {
      const s = new Set();
      while (s.size < n) s.add(String(Math.floor(Math.random() * 456) + 1).padStart(3, "0"));
      return [...s];
    };
    const me = () => (mode === "solo" ? order[soloIdx] : order.find((p) => room && p.id === room.id));
    const isMine = (p) => !!p && p === me();
    const nameOf = (p) => (isMine(p) && mode === "online" ? "You" : mode === "online" ? p.name : `Player ${p.num}`);

    // ---------- styles (removed on cleanup) ----------
    const style = document.createElement("style");
    style.textContent = `
      .gb3 { position: relative; width: 100%; user-select: none; -webkit-user-select: none; }
      .gb3 canvas { display: block; width: 100%; border-radius: 12px; touch-action: none; }
      .gb3-hud { position: absolute; left: 0; right: 0; top: 0; padding: 14px 16px; gap: 12px;
                 display: flex; justify-content: space-between; align-items: flex-start; pointer-events: none; }
      .gb3-players { display: flex; flex-wrap: wrap; gap: 6px; max-width: 75%; }
      .gb3-player { padding: 4px 10px; border-radius: 999px; background: #1f7a63; color: #fff;
                    font-size: .8rem; font-weight: 700; }
      .gb3-player.me { box-shadow: 0 0 0 2px var(--accent) inset; }
      .gb3-player.out { background: #2a2a34; color: #777; text-decoration: line-through; }
      .gb3-player.finished { background: #2f8f4e; }
      .gb3-timer { font-size: 1.5rem; font-weight: 800; font-variant-numeric: tabular-nums; text-shadow: 0 2px 8px #000; }
      .gb3-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
      .gb3-pushcd { font-size: .85rem; font-weight: 800; letter-spacing: .05em; text-shadow: 0 2px 6px #000;
                    color: #ff8fb5; font-variant-numeric: tabular-nums; }
      .gb3-pushcd.ready { color: var(--good); }
      .gb3-timer.low { color: var(--bad); }
      .gb3-msg { position: absolute; left: 0; right: 0; bottom: 16px; padding: 0 170px; pointer-events: none; white-space: pre-line;
                 font-size: 1.05rem; text-shadow: 0 2px 6px #000; text-align: center; }
      .gb3-msg.bad { color: var(--bad); }
      .gb3-msg.good { color: var(--good); }
      .gb3-count { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none;
                   font-size: 6rem; font-weight: 900; color: var(--accent); text-shadow: 0 4px 20px #000; }
      .gb3-lobby { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
                   background: rgba(5, 6, 14, .72); z-index: 2; }
      .gb3-card { background: var(--panel); border-radius: 14px; padding: 22px; width: min(92%, 380px);
                  display: flex; flex-direction: column; gap: 12px; box-shadow: 0 10px 40px #000; }
      .gb3-card h2 { margin: 0; color: var(--accent); }
      .gb3-card label { font-size: .85rem; color: var(--muted); }
      .gb3-card select { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid #444;
                         background: #14141f; color: var(--text); width: 100%; }
      .gb3-card input { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid #444;
                        background: #14141f; color: var(--text); width: 100%; }
      .gb3-row { display: flex; gap: 8px; }
      .gb3-row input { flex: 1; text-transform: uppercase; letter-spacing: .2em; }
      .gb3-card button.alt { background: #3a3a55; color: var(--text); }
      .gb3-card button:disabled { opacity: .4; cursor: default; }
      .gb3-code { font-size: 2.4rem; font-weight: 800; letter-spacing: .3em; text-align: center; color: var(--text); }
      .gb3-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
      .gb3-list li { background: #14141f; padding: 6px 10px; border-radius: 6px; }
      .gb3-note { font-size: .85rem; color: var(--muted); min-height: 1.2em; }
      .gb3-note.bad { color: var(--bad); }
      .gb3-help { font-size: .8rem; color: var(--muted); line-height: 1.5; }
      .gb3-lobby { overflow: auto; }
      .gb3-lobby-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .gb3-lobby-row button { flex: none; padding: 6px 14px; }
      .gb3-card { max-height: 96%; overflow: auto; }
      .gb3-details summary { cursor: pointer; color: var(--muted); font-size: .9rem; }
      .gb3-opts { display: flex; flex-direction: column; gap: 8px; background: #14141f; padding: 10px 12px;
                  border-radius: 8px; margin-top: 8px; }
      .gb3-opt { display: flex; align-items: center; gap: 10px; font-size: .9rem; color: var(--text); cursor: pointer; }
      .gb3-opt select { flex: 1; padding: 4px 8px; }
      .gb3-card .gb3-opt input[type=checkbox] { width: 18px; height: 18px; flex: none; accent-color: var(--accent); }
      @media (pointer: coarse) { .gb3-msg { padding: 0 12px; bottom: 170px; } }
      @media (max-width: 600px) { .gb3-msg { padding: 0 12px; } .gb3-count { font-size: 4rem; } }
    `;
    document.head.appendChild(style);

    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };

    // ---------- DOM ----------
    const wrap = el("div", "gb3");
    const hud = el("div", "gb3-hud");
    const playersEl = el("div", "gb3-players");
    const timerEl = el("div", "gb3-timer");
    const pushCdEl = el("div", "gb3-pushcd");
    const hudRight = el("div", "gb3-right");
    hudRight.append(timerEl, pushCdEl);
    hud.append(playersEl, hudRight);
    const msg = el("div", "gb3-msg", "");
    const countEl = el("div", "gb3-count", "");
    const lobby = el("div", "gb3-lobby");

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    wrap.append(renderer.domElement, hud, msg, countEl);
    container.append(wrap);
    const input = Input.create(wrap, { push: PUSH_ENABLED });
    wrap.append(lobby); // lobby sits above the phone controls
    input.showTouch(false);

    // ---------- scene ----------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06070f);
    scene.fog = new THREE.Fog(0x06070f, 20, 85);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);

    function resize() {
      const w = wrap.clientWidth || 800;
      const portrait = window.innerHeight > window.innerWidth; // phones held upright get a tall view
      const full = document.body.classList.contains("gos-fs"); // hub's full screen button
      const h = full ? Math.max(300, container.clientHeight)
        : Math.max(380, Math.round(portrait ? window.innerHeight - 190 : Math.min(w * 0.6, window.innerHeight - 160)));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x0a0a14, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(6, 22, 8);
    scene.add(sun);
    const pink = new THREE.PointLight(0xff3d8b, 1.6, 45);
    pink.position.set(-7, 7, -18);
    scene.add(pink);
    const teal = new THREE.PointLight(0x2de1c2, 1.6, 45);
    teal.position.set(7, 7, -36);
    scene.add(teal);

    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2f3d, metalness: 0.8, roughness: 0.4 });
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x3b3f58, roughness: 0.8 });
    const finishMat = new THREE.MeshStandardMaterial({ color: 0x2f5a48, roughness: 0.8 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x161925, roughness: 0.9 });
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xbfefff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3,
    });

    const startPlat = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 4), platformMat);
    startPlat.position.set(0, -0.25, -0.3);
    scene.add(startPlat);
    const finishPlat = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 5), finishMat);
    finishPlat.position.set(0, -0.25, FINISH_Z);
    scene.add(finishPlat);
    // low walls behind the start and past the finish
    for (const z of [START.z1 + 0.1, FINISH.z0 - 0.1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 0.2), metal);
      wall.position.set(0, 0.5, z);
      scene.add(wall);
    }

    const frameLen = Math.abs(FINISH_Z) - 2;
    for (const x of [-LANE_X - PANEL / 2 - 0.06, -LANE_X + PANEL / 2 + 0.06,
                     LANE_X - PANEL / 2 - 0.06, LANE_X + PANEL / 2 + 0.06]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, frameLen), metal);
      beam.position.set(x, -0.1, -2 - frameLen / 2);
      scene.add(beam);
    }
    for (let i = 0; i <= STEPS; i++) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(LANE_X * 2 + PANEL + 0.3, 0.1, 0.1), metal);
      cross.position.set(0, -0.12, rowZ(i) + ROW_GAP / 2);
      scene.add(cross);
    }
    for (let k = 0; k < 7; k++) {
      for (const x of [-16, 16]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 140, 16), pillarMat);
        p.position.set(x, -30, 6 - k * 12);
        scene.add(p);
      }
    }
    const grid = new THREE.GridHelper(400, 80, 0x2a2d55, 0x14162a);
    grid.position.y = -60;
    scene.add(grid);

    const panelGeo = new THREE.BoxGeometry(PANEL, 0.06, PANEL);
    const edgeGeo = new THREE.EdgesGeometry(panelGeo);
    const panels = [];
    for (let i = 0; i < STEPS; i++) {
      panels.push([0, 1].map((side) => {
        const mat = new THREE.MeshStandardMaterial({
          color: 0xaee8ff, transparent: true, opacity: 0.3, roughness: 0.05,
          metalness: 0.2, depthWrite: false, emissive: 0x000000,
        });
        const mesh = new THREE.Mesh(panelGeo, mat);
        mesh.position.set(laneX(side), 0, rowZ(i));
        const edges = new THREE.LineSegments(edgeGeo,
          new THREE.LineBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.5 }));
        mesh.add(edges);
        scene.add(mesh);
        return { mesh, edges, broken: false, known: false, stepped: false };
      }));
    }

    // What's under (x, z)? Returns { top, kind, row, side } or null (nothing: you fall).
    const M = 0.2; // forgiveness: you count as on the glass if your body (not just your center) is over it
    const M_LAND = 0.38; // extra forgiveness when LANDING a jump (you get pulled onto the glass)
    function supportAt(x, z, m = M) {
      const inR = (r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
      if (inR(START)) return { top: 0, kind: "start" };
      if (inR(FINISH)) return { top: 0, kind: "finish" };
      const i = Math.round((FIRST_Z - z) / ROW_GAP);
      if (i < 0 || i >= STEPS || Math.abs(z - rowZ(i)) > PANEL / 2 + m) return null;
      for (const side of [0, 1]) {
        if (!panels[i][side].broken && Math.abs(x - laneX(side)) <= PANEL / 2 + m) {
          return { top: 0.03, kind: "panel", row: i, side };
        }
      }
      return null;
    }

    // ---------- player models ----------
    function textTexture(text, w, h, bg, fg, font) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
      g.fillStyle = fg; g.font = font;
      g.textAlign = "center"; g.textBaseline = "middle";
      if (!bg) { g.shadowColor = "#000"; g.shadowBlur = 8; }
      g.fillText(text, w / 2, h / 2 + 2);
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      return t;
    }

    // KayKit character if it loaded (see shared/models.js), otherwise the simple blocky player
    function makePlayerMesh(num, name, mine, charId) {
      const g = new THREE.Group();
      const kk = Models.spawn(charId);
      if (kk) {
        g.add(kk.root);
        if (kk.info.id === "tracksuit") {
          // number patch on the back, stuck to the chest bone so it moves with the body
          const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18),
            new THREE.MeshBasicMaterial({ map: textTexture(num, 128, 64, "#f4f4f4", "#111", "bold 44px sans-serif") }));
          patch.userData.own = true;
          g.add(patch);
          g.updateMatrixWorld(true);
          const chest = kk.bone("chest");
          const cp = new THREE.Vector3(0, 1.2, 0);
          if (chest) chest.getWorldPosition(cp);
          patch.position.set(0, cp.y + 0.02, 0.17); // upper back
          g.updateMatrixWorld(true);
          if (chest) chest.attach(patch);
        }
        addNameTag(g, name, mine, 2.75);
        g.userData = { kk };
        scene.add(g);
        return g;
      }
      return makeBlockyPlayer(g, num, name, mine);
    }

    function addNameTag(g, name, mine, y = 2.35) {
      if (!name) return;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textTexture(name, 256, 64, null, mine ? "#ffcc33" : "#ffffff", "bold 34px sans-serif"),
        depthTest: false, transparent: true,
      }));
      tag.userData.own = true;
      tag.scale.set(1.4, 0.35, 1);
      tag.position.y = y;
      g.add(tag);
    }

    function makeBlockyPlayer(g, num, name, mine) {
      const suit = new THREE.MeshStandardMaterial({ color: 0x14513f, roughness: 0.85 });
      const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
      const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48a, roughness: 0.7 });
      const hair = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 });

      const legs = [];
      for (const x of [-0.13, 0.13]) {
        const hip = new THREE.Group();
        hip.position.set(x, 0.84, 0);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.24), suit);
        leg.position.y = -0.39;
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.32), white);
        shoe.position.set(0, -0.79, -0.03);
        hip.add(leg, shoe);
        g.add(hip);
        legs.push(hip);
      }
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), suit);
      torso.position.y = 1.18;
      g.add(torso);
      const zip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.01), white);
      zip.position.set(0, 1.18, -0.175);
      g.add(zip);
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2),
        new THREE.MeshBasicMaterial({ map: textTexture(num, 128, 64, "#f4f4f4", "#111", "bold 44px sans-serif") }));
      patch.position.set(0, 1.3, 0.172);
      g.add(patch);

      const arms = [];
      for (const x of [-0.37, 0.37]) {
        const shoulder = new THREE.Group();
        shoulder.position.set(x, 1.5, 0);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.66, 0.18), suit);
        arm.position.y = -0.32;
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), skin);
        hand.position.y = -0.68;
        shoulder.add(arm, hand);
        g.add(shoulder);
        arms.push(shoulder);
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), skin);
      head.position.y = 1.76;
      g.add(head);
      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair);
      hairCap.position.y = 1.78;
      g.add(hairCap);

      addNameTag(g, name, mine);
      g.userData = { legs, arms };
      scene.add(g);
      return g;
    }

    const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, t);

    function animate(p, speed, inAir, dt) {
      const kk = p.mesh.userData.kk;
      if (!p.out && (p.pushT > 0 || p.hitT > 0)) { // pushing someone, or just got pushed
        const body = kk ? kk.root : null;
        if (p.pushT > 0) {
          p.pushT -= dt;
          // lean forward into the shove
          if (body) body.rotation.x = -0.45 * Math.sin(Math.PI * Math.min(1, 1 - p.pushT / PUSH_ANIM));
        } else {
          p.hitT -= dt;
          // knocked backward
          if (body) body.rotation.x = 0.35 * Math.sin(Math.PI * Math.min(1, 1 - p.hitT / HIT_ANIM));
        }
        if (kk) kk.update(dt);
        else p.mesh.userData.arms.forEach((a) => (a.rotation.x = p.pushT > 0 ? -1.5 : -2.4));
        return;
      }
      if (kk && kk.root.rotation.x) kk.root.rotation.x = 0;
      if (kk) {
        if (p.out) {
          kk.play("Jump_Idle", { speed: 1.6 });
          p.mesh.rotation.x += 3 * dt; // tumbling
        } else if (inAir) kk.play("Jump_Idle");
        else if (p.finished) kk.play("Cheering");
        else if (speed > 2.2) kk.play("Running_A", { speed: Math.min(1.4, Math.max(0.7, speed / 3.6)) });
        else if (speed > 0.3) kk.play("Walking_A", { speed: Math.min(1.4, Math.max(0.6, speed / 1.5)) });
        else kk.play("Idle_A");
        kk.update(dt);
        return;
      }
      const { legs, arms } = p.mesh.userData;
      if (p.out) {
        arms.forEach((a) => (a.rotation.x = -2.6 + Math.sin(time * 20) * 0.4));
        legs.forEach((l, i) => (l.rotation.x = Math.sin(time * 18 + i * 3) * 0.6));
        p.mesh.rotation.x += 3 * dt;
        return;
      }
      if (inAir) {
        legs[0].rotation.x = 0.6; legs[1].rotation.x = -0.4;
        arms.forEach((a) => (a.rotation.x = -2.3));
        return;
      }
      p.phase += dt * speed * 3.2;
      const swing = Math.min(1, speed / 4) * 0.8;
      legs[0].rotation.x = Math.sin(p.phase) * swing;
      legs[1].rotation.x = -Math.sin(p.phase) * swing;
      arms[0].rotation.x = -Math.sin(p.phase) * swing * 0.9;
      arms[1].rotation.x = Math.sin(p.phase) * swing * 0.9;
    }

    // ---------- sound ----------
    let actx = null;
    function audio() {
      if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
      if (actx && actx.state === "suspended") actx.resume();
      return actx;
    }
    function shatterSound() {
      const a = audio(); if (!a) return;
      const len = Math.floor(a.sampleRate * 0.7);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = a.createBufferSource(); src.buffer = buf;
      const f = a.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2200;
      const gain = a.createGain(); gain.gain.value = 0.7;
      src.connect(f).connect(gain).connect(a.destination);
      src.start();
    }
    function tone(freq, dur = 0.25, vol = 0.15, type = "sine") {
      const a = audio(); if (!a) return;
      const o = a.createOscillator(); o.type = type; o.frequency.value = freq;
      const gain = a.createGain();
      gain.gain.setValueAtTime(vol, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(gain).connect(a.destination);
      o.start(); o.stop(a.currentTime + dur);
    }
    ["pointerdown", "keydown", "touchstart"].forEach((ev) => wrap.addEventListener(ev, audio, { passive: true }));

    // ---------- HUD ----------
    function renderPlayers() {
      playersEl.innerHTML = "";
      order.forEach((p) => {
        let cls = "gb3-player";
        if (p.out) cls += " out";
        else if (p.finished) cls += " finished";
        if (mode === "online" && isMine(p)) cls += " me";
        const label = mode === "online" ? `${p.num} ${p.name}` : p.num;
        playersEl.append(el("div", cls, p.finished ? "✓ " + label : label));
      });
    }
    let lastShown = null;
    function renderTimer() {
      // with a time limit: counts down; without: counts up
      const s = !started ? "" : rules.time ? String(Math.max(0, Math.ceil(clockLeft))) : clockText(elapsed);
      if (s === lastShown) return;
      lastShown = s;
      timerEl.textContent = started ? `⏱ ${s}` : "";
      timerEl.classList.toggle("low", started && !!rules.time && clockLeft <= 15);
    }
    function say(text, kind = "") {
      msg.textContent = text;
      msg.className = "gb3-msg" + (kind ? " " + kind : "");
    }

    // ---------- match ----------
    const spawnSpot = (k) => new THREE.Vector3(-2.1 + (k % 4) * 1.4, 0, -1.4 + Math.floor(k / 4) * 1.3);

    function addPlayer(r, k) {
      const mine = mode === "online" && room && r.id === room.id;
      const p = {
        ...r,
        out: false, finished: false, best: -1,
        vel: new THREE.Vector3(), onGround: true, phase: 0,
        target: null, targetRy: 0, lastSent: null, sendT: 0,
        mesh: makePlayerMesh(r.num, mode === "online" ? r.name : null, mine, r.char),
      };
      p.mesh.position.copy(spawnSpot(k));
      return p;
    }

    // Put the bridge back to brand new (for a rematch).
    function resetMatch() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      order.forEach((p) => {
        scene.remove(p.mesh);
        const shared = !!p.mesh.userData.kk;
        p.mesh.traverse((o) => {
          if (shared && !o.userData.own) return; // KayKit geometry is shared by every copy
          if (o.geometry) o.geometry.dispose();
          if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        });
      });
      order = [];
      panels.forEach((row) => row.forEach((p) => {
        p.broken = p.known = p.stepped = false;
        p.mesh.visible = true;
        p.mesh.material.color.set(0xaee8ff);
        p.mesh.material.emissive.set(0x000000);
        p.edges.material.color.set(0xbfefff);
        p.edges.material.opacity = 0.5;
      }));
      shards.forEach((s) => { scene.remove(s); s.geometry.dispose(); });
      shards.length = 0;
      started = done = timeUpFired = respawnPending = false;
      soloIdx = 0;
      soloBest = -1;
      round = 1;
      countEl.textContent = "";
      api.setScore(0);
    }

    // Download everyone's character first (max ~8s), then start.
    let loadingMatch = false;
    function beginMatch(safeArr, roster, id = "", matchRules = opts) {
      if (loadingMatch) return;
      loadingMatch = true;
      if (Models.available()) {
        lobby.hidden = false;
        lobby.innerHTML = "";
        const card = el("div", "gb3-card");
        card.append(el("h2", "", "Loading characters…"));
        lobby.append(card);
      }
      const go = () => { loadingMatch = false; startMatch(safeArr, roster, id, matchRules); };
      if (!Models.available()) return go();
      Models.loadAll(roster.map((r) => r.char || "tracksuit")).then(go);
    }

    // roster: [{ id, name, num, char }]
    function startMatch(safeArr, roster, id = "", matchRules = opts) {
      if (started) resetMatch();
      rules = { ...DEFAULT_OPTS, ...matchRules };
      elapsed = 0;
      finishCount = 0;
      matchId = id;
      safe = safeArr;
      order = roster.map(addPlayer);
      if (mode === "solo") {
        // the active solo player stands at the front; the others wait off to the sides
        order.forEach((p, k) => p.mesh.position.set(k === 0 ? 0 : k === 1 ? -2.2 : 2.2, 0, k === 0 ? -1.4 : -0.6));
      }
      started = true;
      lobby.hidden = true;
      countdown = COUNTDOWN;
      clockLeft = rules.time;
      input.showTouch(true);
      input.clearJump();
      const touch = navigator.maxTouchPoints > 0;
      say((touch ? "Joystick to move, JUMP to jump, PUSH to shove." : "WASD / arrows to move · Space to jump · F to push · controllers work too") +
        (mode === "online" ? "\nRules: " + rulesText(rules) : ""), "");
      renderPlayers();
      renderTimer();
    }

    function onLand(p, sup) {
      if (sup.kind === "finish") return finish(p);
      if (sup.kind !== "panel") return;
      const { row, side } = sup;
      if (safe[row] === side) {
        markStepped(row, side);
        send({ t: "step", row, side });
        if (row > p.best) {
          p.best = row;
          if (mode === "online" || row > soloBest) {
            soloBest = Math.max(soloBest, row);
            api.addScore(10);
          }
          tone(560 + row * 25, 0.2, 0.12);
        }
      } else {
        breakPanel(row, side);
        send({ t: "break", row, side });
      }
    }

    function markStepped(row, side) {
      const panel = panels[row][side];
      if (panel.stepped || panel.broken) return;
      panel.stepped = true;
      if (!rules.showSafe) return; // option: you have to remember the path yourself
      panel.mesh.material.color.set(0x8affc1);
      panel.mesh.material.emissive.set(0x0b3a22);
      panel.edges.material.color.set(0x3ddc84);
    }

    function breakPanel(row, side) {
      const panel = panels[row][side];
      if (panel.broken) return;
      panel.broken = true;
      panel.mesh.visible = false;
      shatterSound();
      const n = 5, size = PANEL / n;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(size * 0.9, 0.05, size * 0.9), shardMat);
          s.position.set(panel.mesh.position.x - PANEL / 2 + size * (a + 0.5), 0,
                         panel.mesh.position.z - PANEL / 2 + size * (b + 0.5));
          s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
          s.userData.spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
          scene.add(s);
          shards.push(s);
        }
      }
      // now everyone knows the other panel in this row is safe
      const other = panels[row][1 - side];
      if (!other.stepped) {
        other.known = true;
        if (rules.showSafe) other.edges.material.color.set(0x3ddc84);
      }
    }

    function eliminate(p) {
      if (p.out || done) return;
      p.out = true;
      renderPlayers();
      tone(180, 0.6, 0.12, "sawtooth");
      say(`${nameOf(p)} fell!`, "bad");
      if (rules.freePlay) {
        // option: respawn right away, no waiting for anyone
        p.falls = (p.falls || 0) + 1;
        if (mode === "online" && isMine(p)) send({ t: "fell" });
        if (mode === "solo" || isMine(p)) later(() => respawnOne(p), 1200);
        return;
      }
      if (mode === "online") {
        if (isMine(p)) send({ t: "fell" });
        return checkAllDone();
      }
      // solo: next player steps up
      later(() => {
        if (done) return;
        const next = order.findIndex((q) => !q.out && !q.finished);
        if (next < 0) return checkAllDone();
        soloIdx = next;
        const q = me();
        q.mesh.position.set(0, 0, -1.4);
        q.vel.set(0, 0, 0);
        input.clearJump();
        say(`Player ${q.num}, your turn.${rules.showSafe ? " The green-outlined panels are safe." : ""}`);
        renderPlayers();
      }, 1500);
    }

    function finish(p) {
      if (p.finished || p.out) return;
      p.finished = true;
      p.rank = ++finishCount;
      p.finishTime = elapsed;
      renderPlayers();
      say(mode === "online"
        ? (p.rank === 1 ? `🏆 ${nameOf(p)} ${isMine(p) ? "win" : "wins"}! (${clockText(p.finishTime)})` : `${nameOf(p)} finished ${ordinal(p.rank)}`)
        : `${nameOf(p)} made it across! (${clockText(p.finishTime)})`, "good");
      if (isMine(p)) [523, 659, 784, 1046].forEach((f, i) => later(() => tone(f, 0.3, 0.12), i * 120));
      if (mode === "online" && isMine(p)) send({ t: "finish" });
      // first one across wins: the round ends right away
      if (p.rank === 1) later(endMatch, mode === "online" ? 1800 : 0);
    }

    // The first player across wins (see finish). Here: if EVERYONE has fallen (and it isn't
    // free play, where you respawn on your own), everyone respawns. Broken glass stays broken.
    function checkAllDone() {
      if (done || respawnPending || !order.length || rules.freePlay) return;
      if (order.some((p) => p.finished)) return; // already won; the round is ending
      if (!order.every((p) => p.out || p.left)) return;
      if (order.every((p) => p.left)) return later(endMatch, 1500);
      respawnPending = true;
      later(respawnAll, 1800);
    }

    // free play: bring one player back to the start
    function respawnOne(p) {
      if (done || p.left || p.finished) return;
      p.out = false;
      p.mesh.visible = true;
      p.mesh.rotation.set(0, 0, 0);
      p.vel.set(0, 0, 0);
      p.onGround = true;
      p.target = null;
      p.lastSent = null;
      if (mode === "solo") p.mesh.position.set(0, 0, -1.4);
      else p.mesh.position.copy(spawnSpot(order.indexOf(p)));
      if (isMine(p)) {
        input.clearJump();
        send({ t: "respawn" });
      }
      renderPlayers();
      say(`${nameOf(p)} ${isMine(p) && mode === "online" ? "are" : "is"} back at the start.`);
    }

    function respawnAll() {
      respawnPending = false;
      if (done) return;
      round++;
      let k = 0;
      order.forEach((p) => {
        if (p.left) return; // left the room: don't bring them back
        p.out = false;
        p.mesh.visible = true;
        p.mesh.rotation.set(0, 0, 0);
        p.vel.set(0, 0, 0);
        p.onGround = true;
        p.target = null;
        p.lastSent = null;
        if (mode === "solo") p.mesh.position.set(k === 0 ? 0 : k === 1 ? -2.2 : 2.2, 0, k === 0 ? -1.4 : -0.6);
        else p.mesh.position.copy(spawnSpot(order.indexOf(p)));
        k++;
      });
      soloIdx = 0;
      input.clearJump();
      countdown = 2;
      renderPlayers();
      say(`Everyone fell! Round ${round}: respawning. The broken glass stays broken.`, "bad");
      tone(330, 0.3, 0.1);
    }

    function timeUp() {
      say("Time's up. The bridge collapses!", "bad");
      for (let r = 0; r < STEPS; r++) for (const s of [0, 1]) breakPanel(r, s);
      later(() => {
        order.forEach((p) => { if (!p.finished) p.out = true; });
        endMatch();
      }, 2000);
    }

    function endMatch() {
      if (done) return;
      done = true;
      renderPlayers();
      const survivors = order.filter((p) => p.finished);
      if (mode === "solo") {
        const left = order.filter((p) => !p.out).length;
        const timeBonus = rules.time ? Math.max(0, Math.ceil(clockLeft)) : 0;
        if (survivors.length && rules.freePlay) {
          const falls = me().falls || 0;
          api.addScore(Math.max(0, 150 - falls * 25) + timeBonus);
          say(`You made it across in ${clockText(elapsed)} with ${falls} fall${falls === 1 ? "" : "s"}!`, "good");
        } else if (survivors.length) {
          api.addScore(left * 50 + timeBonus);
          say(`You made it across with ${left} player${left === 1 ? "" : "s"} left!`, "good");
        } else say("Everyone fell. The bridge wins.", "bad");
      } else {
        const winner = order.find((p) => p.rank === 1);
        const iWon = winner && isMine(winner);
        if (iWon) api.addScore(100);
        say(winner ? `🏆 ${iWon ? "You win" : winner.name + " wins"}!` : "Nobody made it across. The bridge wins.", iWon ? "good" : "bad");
        if (room) room.update({ inGame: false }); // friends can join before the rematch
      }
      input.showTouch(false);
      if (mode === "solo") later(api.gameOver, 3000);
      else later(showResults, 2500);
    }

    // Online: results + rematch screen
    function showResults() {
      if (!done || mode !== "online" || !room) return;
      lobby.innerHTML = "";
      lobby.hidden = false;
      const card = el("div", "gb3-card");
      card.append(el("h2", "", "Results"));
      const ul = el("ul", "gb3-list");
      // winner first, then everyone else by how far they got
      [...order].sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.best - a.best).forEach((p) => {
        const mine = isMine(p) ? " (you)" : "";
        let line;
        if (p.rank === 1) line = `🏆 ${p.name}${mine} won · ${clockText(p.finishTime)}`;
        else if (p.finished) line = `✅ ${p.name}${mine} also crossed (${ordinal(p.rank)})`;
        else line = `${p.out ? "💀" : "🏳"} ${p.name}${mine} · ${p.best >= 0 ? `reached row ${p.best + 1} of ${STEPS}` : "didn't reach the glass"}`;
        if (rules.freePlay && p.falls) line += ` · ${p.falls} fall${p.falls === 1 ? "" : "s"}`;
        ul.append(el("li", "", line));
      });
      card.append(ul);
      const here = roomPlayers; // everyone in the room now, oldest first
      const iAmHost = here.length > 0 && here[0].id === room.id;
      const newcomers = here.filter((p) => !order.some((o) => o.id === p.id));
      if (newcomers.length) card.append(el("div", "gb3-note", `Joined for the next game: ${newcomers.map((p) => p.name).join(", ")}`));
      if (iAmHost) {
        const n = Math.min(here.length, MAX_ONLINE);
        card.append(optionsBox(() => { if (room) { room.update({ opts: { ...opts } }); advertiseLobby(roomPlayers); } }, true));
        const again = el("button", "", `Rematch (${n} player${n === 1 ? "" : "s"})`);
        again.onclick = () => hostStart(here);
        card.append(again);
      } else {
        const hostOpts = here[0] && here[0].opts;
        if (hostOpts) card.append(el("div", "gb3-note", "Next game: " + rulesText({ ...DEFAULT_OPTS, ...hostOpts })));
        card.append(el("div", "gb3-note", "Waiting for the host 👑 to start a rematch…"));
      }
      const leave = el("button", "alt", "Leave lobby");
      leave.onclick = () => { leaveRoom(); lobby.hidden = true; api.gameOver(); };
      card.append(leave);
      lobby.append(card);
    }

    // Host: start a match (first game or rematch) with everyone in the room
    function hostStart(list) {
      const roster = list.slice(0, MAX_ONLINE);
      const nums = randomNumbers(roster.length);
      const data = {
        t: "start",
        m: Math.random().toString(36).slice(2, 10),
        safe: randomSafe(),
        roster: roster.map((p, i) => ({ id: p.id, name: p.name, num: nums[i], char: p.char || "tracksuit" })),
        opts: { ...opts },
      };
      room.send(data);
      room.update({ inGame: true, opts: { ...opts } });
      beginMatch(data.safe, data.roster, data.m, data.opts);
    }

    // ---------- physics ----------
    const shards = [];
    let time = 0;

    function stepLocal(p, dt) {
      const live = !p.out && countdown <= 0 && !done;
      const mv = live ? input.move() : { x: 0, y: 0 };
      const wantJump = input.jump() && live;
      if (input.push() && PUSH_ENABLED && live && time - (p.lastPush || -9) > PUSH_COOLDOWN) doPush(p);
      const P = p.mesh.position;

      if (wantJump && p.onGround) {
        const from = supportAt(P.x, P.z);
        p.jumpFrom = from && from.kind === "panel" ? from.row * 2 + from.side : null; // which glass tile (or none)
        p.vel.y = JUMP_V;
        p.onGround = false;
        p.jumped = true;
        tone(300, 0.08, 0.05, "triangle");
      }

      // small fixed steps so landings work the same on fast and slow devices
      const n = Math.max(1, Math.ceil(dt * 120));
      const h = dt / n;
      for (let s = 0; s < n; s++) {
        const k = Math.min(1, (p.onGround ? 14 : 8) * h); // less control in the air
        p.vel.x += (mv.x * SPEED - p.vel.x) * k;
        p.vel.z += (-mv.y * SPEED - p.vel.z) * k;
        p.vel.y -= GRAVITY * h;

        const prevY = P.y;
        P.addScaledVector(p.vel, h);
        if (p.slide && p.slide.t > 0) { // being shoved by someone who jumped into you
          const k = Math.min(h, p.slide.t);
          P.x += p.slide.x * k;
          P.z += p.slide.z * k;
          p.slide.t -= k;
        }
        // walls behind the start and past the finish
        if (P.z > START.z1 - 0.15 && P.y > -1) { P.z = START.z1 - 0.15; p.vel.z = Math.min(0, p.vel.z); }
        if (P.z < FINISH.z0 + 0.15 && P.y > -1) { P.z = FINISH.z0 + 0.15; p.vel.z = Math.max(0, p.vel.z); }

        // only a real jump gets the extra landing help, so you can't walk across the gaps
        const sup = p.out ? null : supportAt(P.x, P.z, p.jumped && !p.onGround ? M_LAND : M);
        const wasGround = p.onGround;
        if (sup && p.vel.y <= 0 && prevY >= sup.top - 0.05 && P.y <= sup.top) {
          P.y = sup.top;
          p.vel.y = 0;
          p.onGround = true;
          if (!wasGround) {
            p.jumped = false;
            p.landedAt = time;
            p.vel.x *= 0.35; // "sticky" landings so you don't slide off a small panel
            p.vel.z *= 0.35;
            if (sup.kind === "panel") {
              // landed near the edge: pull you onto the glass
              const lim = PANEL / 2 - 0.05;
              P.x = laneX(sup.side) + Math.max(-lim, Math.min(lim, P.x - laneX(sup.side)));
              P.z = rowZ(sup.row) + Math.max(-lim, Math.min(lim, P.z - rowZ(sup.row)));
            }
            onLand(p, sup);
          }
        } else {
          p.onGround = false;
        }
      }

      if (rules.bump && !p.out) bumpOthers(p);

      const speed = Math.hypot(p.vel.x, p.vel.z);
      if (speed > 0.3 && !p.out) p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, Math.atan2(-p.vel.x, -p.vel.z), dt * 12);
      animate(p, speed, !p.onGround, dt);

      if (!p.out && P.y < -4) eliminate(p);
      if (P.y < -55) p.mesh.visible = false;

      // online: tell everyone where we are
      if (mode === "online" && p.mesh.visible) {
        p.sendT += dt;
        const moved = !p.lastSent || P.distanceTo(p.lastSent) > 0.01;
        if (p.sendT >= SEND_EVERY && (moved || p.sendT > 0.5)) {
          p.sendT = 0;
          p.lastSent = P.clone();
          const r2 = (v) => Math.round(v * 100) / 100;
          send({ t: "pos", x: r2(P.x), y: r2(P.y), z: r2(P.z), ry: r2(p.mesh.rotation.y) });
        }
      }
    }

    // option: players are solid and bounce off each other. Run into someone fast enough
    // and you shove them (online, their game applies the push to their own player).
    const BODY = 0.75; // how close two players can get
    function bumpOthers(p) {
      const P = p.mesh.position;
      for (const q of order) {
        if (q === p || q.out || q.left || !q.mesh.visible) continue;
        const Q = q.mesh.position;
        if (Math.abs(Q.y - P.y) > 1.2) continue;
        const dx = P.x - Q.x, dz = P.z - Q.z;
        const d = Math.hypot(dx, dz);
        if (d >= BODY) continue;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        // Jumping onto a tile someone is standing on: you keep your landing spot and THEY get
        // shoved back about half a tile in the direction you were jumping.
        const theyStand = Q.y < 0.2 && Q.y > -0.5; // on the glass / a platform
        if (time - (q.lastBlock || -9) < 0.45) continue; // they're sliding away from your jump: don't nudge you
        const jumping = !p.onGround || p.landedAt === time; // in the air, or touched down this frame
        // only when you jump from one glass tile onto a DIFFERENT tile they're standing on
        const theirs = supportAt(Q.x, Q.z);
        const theirTile = theirs && theirs.kind === "panel" ? theirs.row * 2 + theirs.side : null;
        const tileToTile = p.jumpFrom != null && theirTile != null && theirTile !== p.jumpFrom;
        if (jumping && tileToTile && theyStand && P.y >= Q.y - 0.1) {
          if (time - (q.lastBlock || 0) > 0.5) {
            q.lastBlock = time;
            let hx = p.vel.x, hz = p.vel.z, hl = Math.hypot(hx, hz);
            if (hl < 0.5) { hx = -nx; hz = -nz; hl = 1; } // barely moving: shove them away from you
            const r2 = (v) => Math.round(v * 100) / 100;
            const sx = r2((hx / hl) * BLOCK_SHOVE), sz = r2((hz / hl) * BLOCK_SHOVE);
            send({ t: "shove", to: q.id, x: sx, z: sz });
            startHitAnim(q);
            tone(170, 0.1, 0.1, "square");
          }
          continue; // no bounce for the jumper
        }
        // anything else (walking into someone, jumping off the start platform): no bounce or shove,
        // you just can't walk through each other
        P.x += nx * (BODY - d);
        P.z += nz * (BODY - d);
      }
    }

    // PUSH: shove whoever is in front of you. Online, their game applies the shove to them.
    function doPush(p) {
      p.lastPush = time;
      startPushAnim(p);
      tone(260, 0.12, 0.08, "triangle");
      const P = p.mesh.position;
      const fx = -Math.sin(p.mesh.rotation.y), fz = -Math.cos(p.mesh.rotation.y); // facing direction
      if (p.onGround) { p.vel.x += fx * 3; p.vel.z += fz * 3; } // step into it
      const hits = [];
      for (const q of order) {
        if (q === p || q.out || q.left || q.finished || !q.mesh.visible) continue;
        const Q = q.mesh.position;
        if (Math.abs(Q.y - P.y) > 1.2) continue;
        const dx = Q.x - P.x, dz = Q.z - P.z;
        const d = Math.hypot(dx, dz);
        if (d > PUSH_RANGE || d < 1e-3 || (dx * fx + dz * fz) / d < 0.3) continue; // too far / not in front
        const r2 = (v) => Math.round(v * 100) / 100;
        hits.push({ to: q.id, x: r2((dx / d) * PUSH_FORCE), z: r2((dz / d) * PUSH_FORCE) });
        startHitAnim(q);
      }
      if (hits.length) tone(150, 0.15, 0.12, "square");
      send({ t: "push", hits });
    }
    let lastCdText = null;
    function updatePushCooldown() {
      const m = me();
      if (!PUSH_ENABLED || !started || done || !m || m.out) {
        if (lastCdText !== "") { pushCdEl.textContent = ""; lastCdText = ""; }
        return;
      }
      const left = Math.max(0, PUSH_COOLDOWN - (time - (m.lastPush ?? -99)));
      const text = left > 0 ? `PUSH ${left.toFixed(1)}s` : "PUSH ready";
      if (text !== lastCdText) {
        lastCdText = text;
        pushCdEl.textContent = text;
        pushCdEl.classList.toggle("ready", left === 0);
        input.setPushCharge(1 - left / PUSH_COOLDOWN);
      }
    }

    function startPushAnim(p) {
      p.pushT = PUSH_ANIM;
      p.hitT = 0;
      const kk = p.mesh.userData.kk;
      if (kk) kk.play("Melee_Unarmed_Attack_Punch_A", { once: true, speed: 1.6, fade: 0.06 });
      pushBurst(p);
    }
    function startHitAnim(q) {
      if (q.out) return;
      q.hitT = HIT_ANIM;
      const kk = q.mesh.userData.kk;
      if (kk) kk.play("Hit_A", { once: true, speed: 1.3, fade: 0.06 });
    }

    // a white shockwave ring that flies out in front of the pusher, so you can SEE the push
    const effects = [];
    const ringGeo = new THREE.RingGeometry(0.22, 0.38, 32);
    function pushBurst(p) {
      const P = p.mesh.position;
      const fx = -Math.sin(p.mesh.rotation.y), fz = -Math.cos(p.mesh.rotation.y);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
      }));
      ring.position.set(P.x + fx * 0.7, P.y + 1.15, P.z + fz * 0.7);
      ring.lookAt(ring.position.x + fx, ring.position.y, ring.position.z + fz); // faces where you're pushing
      ring.userData = { t: 0, fx, fz };
      scene.add(ring);
      effects.push(ring);
    }
    function updateEffects(dt) {
      for (let i = effects.length - 1; i >= 0; i--) {
        const r = effects[i];
        r.userData.t += dt;
        const t = r.userData.t;
        r.scale.setScalar(1 + t * 7);
        r.position.x += r.userData.fx * dt * 3.5;
        r.position.z += r.userData.fz * dt * 3.5;
        r.material.opacity = Math.max(0, 0.85 * (1 - t / 0.35));
        if (t > 0.35) {
          scene.remove(r);
          r.material.dispose();
          effects.splice(i, 1);
        }
      }
    }
    function getPushed(x, z) {
      const m = me();
      if (!m || m.out || m.finished) return;
      m.vel.x += x;
      m.vel.z += z;
      m.vel.y = Math.max(m.vel.y, 4.5); // knocked off your feet
      m.onGround = false;
      tone(140, 0.15, 0.12, "square");
    }

    function stepRemote(p, dt) {
      if (!p.target) { animate(p, 0, false, dt); return; }
      const P = p.mesh.position;
      const before = P.clone();
      P.lerp(p.target, Math.min(1, dt * 12));
      if (!p.out) p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, p.targetRy, dt * 12);
      const speed = Math.hypot(P.x - before.x, P.z - before.z) / Math.max(dt, 0.001);
      animate(p, speed, p.target.y > 0.08, dt);
    }

    // solo: the players waiting their turn just stand there
    function stepIdle(p, dt) { animate(p, 0, false, dt); }

    // ---------- online messages ----------
    function onRoomMessage(data, from) {
      if (data.t === "start") {
        if (started && !done) return; // already playing
        if (!data.roster.some((r) => r.id === room.id)) {
          if (!started) showRoom("The game started without you (room full).", true);
          return;
        }
        room.update({ inGame: true });
        return beginMatch(data.safe, data.roster, data.m, data.opts || DEFAULT_OPTS);
      }
      if (!started || data.m !== matchId) return; // not for this match
      const p = order.find((q) => q.id === from);
      if (!p) return;
      if (data.t === "pos") {
        if (!p.target) p.target = new THREE.Vector3();
        p.target.set(data.x, data.y, data.z);
        p.targetRy = data.ry;
      } else if (data.t === "step") {
        markStepped(data.row, data.side);
        p.best = Math.max(p.best, data.row); // how far they got (for results)
      } else if (data.t === "shove") {
        const q = order.find((o) => o.id === data.to);
        if (q) startHitAnim(q);
        if (data.to === room.id) {
          const m = me();
          if (m && !m.out && !m.finished) m.slide = { x: data.x / 0.25, z: data.z / 0.25, t: 0.25 };
        }
      } else if (data.t === "push") {
        startPushAnim(p);
        (data.hits || []).forEach((h) => {
          const q = order.find((o) => o.id === h.to);
          if (q) startHitAnim(q); // everyone sees who got hit
          if (h.to === room.id) getPushed(h.x, h.z);
        });
      }
      else if (data.t === "break") breakPanel(data.row, data.side);
      else if (data.t === "fell") eliminate(p);
      else if (data.t === "respawn") respawnOne(p);
      else if (data.t === "finish") finish(p);
      else if (data.t === "bump" && data.to === room.id) {
        const m = me(); // someone shoved me
        if (m && !m.out && !m.finished && rules.bump) {
          m.vel.x += data.x;
          m.vel.z += data.z;
          if (m.onGround) { m.vel.y = 3; m.onGround = false; }
          tone(140, 0.1, 0.1, "square");
        }
      }
    }

    function onRoomPlayers(list) {
      if (!started) return renderRoom(list);
      roomPlayers = list;
      advertiseLobby(list);
      if (done) return showResults(); // results screen: keep the player list fresh
      const here = new Set(list.map((p) => p.id));
      order.forEach((p) => {
        if (!p.left && !here.has(p.id)) {
          p.left = true;
          p.mesh.visible = false;
          if (!p.finished) {
            p.out = true;
            say(`${p.name} left the game.`, "bad");
          }
          renderPlayers();
          checkAllDone();
        }
      });
    }

    // ---------- lobby screens ----------
    let roomPlayers = [];
    let roomNote = "";
    let roomNoteBad = false;
    const savedName = (() => { try { return localStorage.getItem("gos:name") || ""; } catch { return ""; } })();
    let myChar = (() => { try { return Models.byId(localStorage.getItem("gos:char") || "tracksuit").id; } catch { return "tracksuit"; } })();
    if (Models.available()) Models.load(myChar).catch(() => {}); // start downloading early

    function makeInput(value, placeholder, max) {
      const i = el("input");
      i.value = value; i.placeholder = placeholder; i.maxLength = max;
      i.addEventListener("keydown", (e) => e.stopPropagation()); // typing shouldn't move anyone
      return i;
    }

    // The options panel. onChange runs after any change (online: tell the room).
    function optionsBox(onChange, open = false) {
      const det = el("details", "gb3-details");
      det.open = open;
      det.append(el("summary", "", "Game options"));
      const box = el("div", "gb3-opts");
      const changed = () => { saveOpts(); if (onChange) onChange(); };

      const timeRow = el("label", "gb3-opt");
      const timeSel = el("select");
      TIME_CHOICES.forEach((t) => {
        const o = el("option", "", t ? `${t} seconds` : "No time limit");
        o.value = t;
        if (t === opts.time) o.selected = true;
        timeSel.append(o);
      });
      timeSel.addEventListener("keydown", (e) => e.stopPropagation());
      timeSel.onchange = () => { opts.time = +timeSel.value; changed(); };
      timeRow.append(el("span", "", "Time limit"), timeSel);
      box.append(timeRow);

      const toggle = (key, text) => {
        const row = el("label", "gb3-opt");
        const c = el("input");
        c.type = "checkbox";
        c.checked = !!opts[key];
        c.onchange = () => { opts[key] = c.checked; changed(); };
        row.append(c, el("span", "", text));
        box.append(row);
      };
      toggle("showSafe", "Show safe tiles in green");
      toggle("bump", "Players bump into each other");
      toggle("freePlay", "Free play: respawn instantly when you fall");
      det.append(box);
      return det;
    }

    function showMenu() {
      lobby.innerHTML = "";
      lobby.hidden = false;
      const card = el("div", "gb3-card");
      card.append(el("h2", "", "Glass Bridge"));
      card.append(el("label", "", "Your name"));
      const nameIn = makeInput(savedName, "e.g. Sam", 14);
      card.append(nameIn);
      if (Models.available()) {
        card.append(el("label", "", "Character"));
        const pick = el("select");
        Models.CHARACTERS.forEach((c) => {
          const o = el("option", "", c.label);
          o.value = c.id;
          if (c.id === myChar) o.selected = true;
          pick.append(o);
        });
        pick.addEventListener("keydown", (e) => e.stopPropagation());
        pick.onchange = () => {
          myChar = pick.value;
          try { localStorage.setItem("gos:char", myChar); } catch {}
          Models.load(myChar).catch(() => {});
        };
        card.append(pick);
      }

      const solo = el("button", "", "Play solo");
      solo.onclick = () => {
        mode = "solo";
        const nums = randomNumbers(SOLO_PLAYERS);
        beginMatch(randomSafe(), nums.map((num, i) => ({ id: "solo" + i, name: "Player " + num, num, char: myChar })));
      };
      const note = el("div", "gb3-note bad");
      const getName = () => {
        const n = nameIn.value.trim().slice(0, 14);
        if (!n) { note.textContent = "Type a name first."; nameIn.focus(); return null; }
        try { localStorage.setItem("gos:name", n); } catch {}
        return n;
      };

      // online: host a lobby, or pick one from the live list
      const host = el("button", "", "Host a lobby");
      host.onclick = () => { const n = getName(); if (n) enterRoom(Net.newCode(), n); };
      lobbyListEl = el("ul", "gb3-list");
      lobbyListEl.join = (code) => { const n = getName(); if (n) enterRoom(code, n); };

      const controls = el("button", "alt", "🎮 Phone controls layout");
      controls.onclick = () => {
        lobby.hidden = true;
        lobbyListEl = null;
        input.editLayout(() => showMenu());
      };

      card.append(optionsBox(null), solo, el("label", "", "Play online with friends"), host,
        el("label", "", "Open lobbies"), lobbyListEl, note, controls,
        el("div", "gb3-help", "Keyboard: WASD / arrows, Space jump, F push · Controller: stick, A/✕ jump, X/□ push · Phone: joystick, JUMP, PUSH"));
      lobby.append(card);
      if (typeof Net === "undefined" || typeof supabase === "undefined") {
        host.disabled = true;
        note.textContent = "Online play unavailable (Supabase library didn't load).";
        lobbyListEl = null;
        return;
      }
      try {
        if (!lobbyFeed) lobbyFeed = Net.lobbies("glass-bridge", renderLobbyList);
        renderLobbyList(lobbyFeed.list());
      } catch (err) {
        note.textContent = "Online play unavailable: " + err.message;
      }
    }

    // ---------- open lobbies list ----------
    let lobbyFeed = null; // live list of open lobbies (shared/net.js)
    let lobbyListEl = null; // the list on the menu, while it's showing
    function renderLobbyList(list) {
      if (!lobbyListEl || started || room) return;
      lobbyListEl.innerHTML = "";
      const open = list.filter((l) => l.id !== Net.id)
        .sort((a, b) => (a.inGame ? 1 : 0) - (b.inGame ? 1 : 0) || b.count - a.count);
      if (!open.length) {
        lobbyListEl.append(el("li", "gb3-note", "No open lobbies right now. Host one!"));
        return;
      }
      open.forEach((l) => {
        const li = el("li", "gb3-lobby-row");
        const full = l.count >= MAX_ONLINE;
        const info = el("div", "");
        info.append(el("b", "", `${l.host}'s lobby`),
          el("div", "gb3-note", `${l.count}/${MAX_ONLINE} players · ${l.inGame ? "playing now (you'll join next round)" : "waiting to start"}`));
        const btn = el("button", "", full ? "Full" : "Join");
        btn.disabled = full;
        btn.onclick = () => lobbyListEl && lobbyListEl.join(l.code);
        li.append(info, btn);
        lobbyListEl.append(li);
      });
    }

    // the host shows their lobby in everyone's list
    let myName = "";
    function advertiseLobby(list) {
      if (!lobbyFeed || !room) return;
      const iAmHost = list.length > 0 && list[0].id === room.id;
      if (!iAmHost) return lobbyFeed.hide();
      lobbyFeed.advertise({
        code: room.code,
        host: myName,
        count: Math.min(list.length, MAX_ONLINE),
        inGame: list.some((p) => p.inGame),
        rules: rulesText(opts),
      });
    }
    function leaveRoom() {
      if (lobbyFeed) lobbyFeed.hide();
      if (room) room.leave();
      room = null;
    }

    function enterRoom(code, name) {
      mode = "online";
      myName = name;
      lobbyListEl = null;
      roomPlayers = [];
      roomNote = "Connecting…";
      roomNoteBad = false;
      try {
        room = Net.joinRoom("glass-bridge", code, name, {
          onPlayers: onRoomPlayers,
          onMessage: onRoomMessage,
          onStatus: (s) => {
            if (started) return;
            if (s === "SUBSCRIBED") showRoom("Connected.");
            else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
              showRoom("Couldn't connect to the online server. Check your internet, or Realtime settings in Supabase.", true);
            }
          },
        }, { char: myChar, opts: { ...opts } });
      } catch (err) {
        return showRoom("Online play failed to start: " + err.message, true);
      }
      renderRoom([]);
    }

    function showRoom(note, bad = false) {
      roomNote = note;
      roomNoteBad = bad;
      renderRoom(roomPlayers);
    }

    function renderRoom(list) {
      if (started) return;
      roomPlayers = list;
      lobby.innerHTML = "";
      lobby.hidden = false;
      const card = el("div", "gb3-card");
      card.append(el("h2", "", `${list[0] ? list[0].name : myName}'s lobby`));
      advertiseLobby(list);
      const inGame = list.some((p) => p.inGame);
      const ul = el("ul", "gb3-list");
      list.slice(0, MAX_ONLINE).forEach((p, i) => {
        const mine = room && p.id === room.id;
        const ch = Models.available() && p.char ? ` · ${Models.byId(p.char).label}` : "";
        ul.append(el("li", "", `${p.name}${mine ? " (you)" : ""}${i === 0 ? " 👑" : ""}${ch}`));
      });
      card.append(el("label", "", `Players (${Math.min(list.length, MAX_ONLINE)}/${MAX_ONLINE})`), ul);

      const myIndex = list.findIndex((p) => room && p.id === room.id);
      const iAmHost = myIndex === 0;
      let note = roomNote, bad = roomNoteBad;
      if (inGame) { note = "A game is running in this lobby. You'll join the next round."; bad = false; }
      else if (myIndex >= MAX_ONLINE) { note = "Room is full (8 players)."; bad = true; }
      else if (myIndex >= 0 && !bad) note = iAmHost ? "You're the host 👑. Start when everyone's in." : "Waiting for the host to start…";

      if (iAmHost && !inGame) {
        card.append(optionsBox(() => { if (room) { room.update({ opts: { ...opts } }); advertiseLobby(roomPlayers); } }, true));
      } else if (list[0] && list[0].opts && !inGame) {
        card.append(el("div", "gb3-note", "Rules: " + rulesText({ ...DEFAULT_OPTS, ...list[0].opts })));
      }
      if (iAmHost && !inGame) {
        const n = Math.min(list.length, MAX_ONLINE);
        const startBtn = el("button", "", n > 1 ? `Start (${n} players)` : "Start (just you)");
        startBtn.onclick = () => hostStart(list);
        card.append(startBtn);
      }
      const leave = el("button", "alt", "Leave lobby");
      leave.onclick = () => { leaveRoom(); mode = "lobby"; showMenu(); };
      card.append(el("div", "gb3-note" + (bad ? " bad" : ""), note), leave);
      lobby.append(card);
    }

    // ---------- main loop ----------
    // camera sits higher above the player than behind them
    const CAM_UP = 5.6, CAM_BACK = 4.2, LOOK_AHEAD = 3.2;
    const camPos = new THREE.Vector3(0, CAM_UP, -1.4 + CAM_BACK);
    const camLook = new THREE.Vector3(0, 0.4, -1.4 - LOOK_AHEAD);
    let followY = 0;

    const START_VIEW = new THREE.Vector3(0, 0, -1.4);
    let camHeld = false; // true while you're out: the camera waits at the start

    function update(dt) {
      time += dt;

      if (started && !done) {
        if (countdown > 0) {
          const before = Math.ceil(countdown);
          countdown -= dt;
          const now = Math.ceil(countdown);
          countEl.textContent = countdown > 0 ? String(now) : "GO!";
          if (now !== before) tone(countdown > 0 ? 440 : 880, 0.2, 0.12);
          if (countdown <= 0) later(() => (countEl.textContent = ""), 700);
        } else {
          elapsed += dt;
          if (rules.time) {
            clockLeft -= dt;
            if (clockLeft <= 0) { clockLeft = 0; timeUpOnce(); }
          }
        }
      }
      renderTimer();

      const mine = me();
      for (const p of order) {
        if (p === mine) stepLocal(p, dt);
        else if (mode === "online") stepRemote(p, dt);
        else if (p.out) { /* solo: fallen players keep falling */ p.vel.y -= GRAVITY * dt; p.mesh.position.addScaledVector(p.vel, dt); animate(p, 0, true, dt); if (p.mesh.position.y < -55) p.mesh.visible = false; }
        else stepIdle(p, dt);
      }

      updateEffects(dt);
      updatePushCooldown();
      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i];
        s.userData.v.y -= GRAVITY * dt;
        s.position.addScaledVector(s.userData.v, dt);
        s.rotation.x += s.userData.spin.x * dt;
        s.rotation.y += s.userData.spin.y * dt;
        s.rotation.z += s.userData.spin.z * dt;
        if (s.position.y < -60) {
          scene.remove(s);
          s.geometry.dispose();
          shards.splice(i, 1);
        }
      }

      // known-safe panels glow
      const pulse = 0.6 + 0.35 * Math.sin(time * 4);
      panels.forEach((row) => row.forEach((p) => {
        if (rules.showSafe && p.known && !p.stepped && !p.broken) p.edges.material.opacity = pulse;
      }));

      // third-person camera. If you fall it jumps back to the start and stays there until you respawn.
      const t = me();
      const dead = !t || t.out;
      const focus = dead ? START_VIEW : t.mesh.position;
      if (!dead) followY += (Math.max(0, focus.y) - followY) * Math.min(1, dt * 3);
      const camGoal = new THREE.Vector3(focus.x * 0.6, (dead ? 0 : followY) + CAM_UP, focus.z + CAM_BACK);
      const lookGoal = new THREE.Vector3(focus.x * 0.5, (dead ? 0 : followY) + 0.4, focus.z - LOOK_AHEAD);
      if (dead && !camHeld) { // snap straight back to the start, no swooping
        camHeld = true;
        followY = 0;
        camPos.copy(camGoal);
        camLook.copy(lookGoal);
      } else if (!dead) {
        camHeld = false;
        camPos.lerp(camGoal, Math.min(1, dt * 4));
        camLook.lerp(lookGoal, Math.min(1, dt * 5));
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    }

    let timeUpFired = false;
    function timeUpOnce() { if (!timeUpFired) { timeUpFired = true; timeUp(); } }

    const frameClock = new THREE.Clock();
    let raf = 0;
    function frame() {
      raf = requestAnimationFrame(frame);
      update(Math.min(frameClock.getDelta(), 0.05));
      renderer.render(scene, camera);
    }

    showMenu();
    frame();

    // ---------- cleanup when leaving the game ----------
    return () => {
      cancelAnimationFrame(raf);
      timeouts.forEach(clearTimeout);
      window.removeEventListener("resize", resize);
      input.destroy();
      leaveRoom();
      if (lobbyFeed) lobbyFeed.stop();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      renderer.dispose();
      if (actx) actx.close();
      style.remove();
    };
  },
});
