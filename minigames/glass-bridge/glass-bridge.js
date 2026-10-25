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
// SHOW RULES (game option): everyone gets a random place in line. Only the player at the
// front of the line may jump to new glass; the others can't pass the player ahead of them.
// The front player has 10 seconds per jump, or the two archers at the end of the bridge shoot.
// COMPUTER PLAYERS (game option, 0-12): bots that play by the same rules. Online, the host runs them.
//
// Controls are from your character's point of view: forward = the way you're facing,
// left / right turn you. The camera stays behind you.
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
    const SHOW_JUMP_TIME = 10; // show rules: seconds the front player gets for each jump
    const MAX_BOTS = 12;
    const ARCHER_CHARS = ["skeleton-rogue", "skeleton-warrior"];
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
    const START = { x0: -8, x1: 8, z0: -2.3, z1: 11.7 }; // start platform: 16 wide, 14 deep
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
    const sendFor = (p, d) => send({ ...d, by: p.id }); // a message about player p (you or a bot you run)
    let started = false;
    let done = false;
    let countdown = 0; // > 0 while counting down
    let clockLeft = 0;
    let elapsed = 0; // seconds since GO
    let finishCount = 0;

    // ---------- game options ----------
    const DEFAULT_OPTS = { time: 120, showSafe: true, bump: true, freePlay: false, show: false, bots: 0 };
    let opts = (() => { // what you picked (remembered)
      try { return { ...DEFAULT_OPTS, ...JSON.parse(localStorage.getItem("gos:gbOpts") || "{}") }; } catch { return { ...DEFAULT_OPTS }; }
    })();
    let rules = { ...opts }; // the rules of the match being played
    const saveOpts = () => { try { localStorage.setItem("gos:gbOpts", JSON.stringify(opts)); } catch {} };
    const rulesText = (o) => [
      o.time ? `${o.time}s limit` : "no time limit",
      o.showSafe ? "safe tiles shown" : "safe tiles hidden",
      o.bump ? "bumping on" : "no bumping",
      o.show ? "show rules (line order, 10 s per jump, archers)" : o.freePlay ? "free play (instant respawns)" : "respawn when everyone falls",
      o.bots ? `${o.bots} computer player${o.bots === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" · ");
    const clockText = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
    const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
    const timeouts = [];
    const later = (fn, ms) => timeouts.push(setTimeout(fn, ms));

    const randomSafe = () => Array.from({ length: STEPS }, () => (Math.random() < 0.5 ? 0 : 1));
    // "7" / "07" / "007" -> "007"; anything not 1..456 -> "" (means random)
    const cleanNum = (v) => {
      const n = parseInt(String(v || "").replace(/\D/g, ""), 10);
      return n >= 1 && n <= 456 ? String(n).padStart(3, "0") : "";
    };
    // give everyone the number they asked for; duplicates and blanks get a random free number
    // (the earlier player in the list wins a tie — online that's the host first)
    const assignNumbers = (wanted) => {
      const used = new Set();
      const out = wanted.map((w) => {
        const n = cleanNum(w);
        if (n && !used.has(n)) { used.add(n); return n; }
        return null;
      });
      return out.map((n) => {
        if (n) return n;
        let r;
        do r = String(Math.floor(Math.random() * 456) + 1).padStart(3, "0"); while (used.has(r));
        used.add(r);
        return r;
      });
    };
    const randomNumbers = (n) => {
      const s = new Set();
      while (s.size < n) s.add(String(Math.floor(Math.random() * 456) + 1).padStart(3, "0"));
      return [...s];
    };
    const me = () => (mode === "solo" ? order[soloIdx] : order.find((p) => room && p.id === room.id));
    const isMine = (p) => !!p && p === me();
    const nameOf = (p) => (isMine(p) && mode === "online" ? "You" : p.bot || mode === "online" ? p.name : `Player ${p.num}`);
    // online, the oldest player in the room is the host; the host's game runs the computer players
    const amHost = () => mode === "online" && room && roomPlayers.length > 0 && roomPlayers[0].id === room.id;
    const simBots = () => mode === "solo" || amHost();
    // players whose movement THIS game works out (you, plus the bots if you run them)
    const local = (p) => !!p && (p === me() || (p.bot && simBots()));

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
      .gb3-player.watchable { pointer-events: auto; cursor: pointer; }
      .gb3-player.watchable:hover { filter: brightness(1.25); }
      .gb3-player.watching { box-shadow: 0 0 0 2px #ffd23f inset; background: #2b5f9e; }
      .gb3-player.watchable::before { content: "👁 "; }
      .gb3-timer { font-size: 1.5rem; font-weight: 800; font-variant-numeric: tabular-nums; text-shadow: 0 2px 8px #000; }
      .gb3-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
      .gb3-pushcd { font-size: .85rem; font-weight: 800; letter-spacing: .05em; text-shadow: 0 2px 6px #000;
                    color: #ff8fb5; font-variant-numeric: tabular-nums; }
      .gb3-pushcd.ready { color: var(--good); }
      .gb3-player.lead { box-shadow: 0 0 0 2px var(--accent); }
      .gb3-jumpclock { position: absolute; left: 0; right: 0; top: 60px; text-align: center; pointer-events: none;
                       font-size: 1.35rem; font-weight: 800; text-shadow: 0 2px 8px #000; color: #fff; }
      .gb3-jumpclock.low { color: var(--bad); font-size: 1.7rem; }
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
    const jumpClockEl = el("div", "gb3-jumpclock", "");
    const countEl = el("div", "gb3-count", "");
    const lobby = el("div", "gb3-lobby");

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    wrap.append(renderer.domElement, hud, msg, countEl, jumpClockEl);
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

    const startPlat = new THREE.Mesh(new THREE.BoxGeometry(START.x1 - START.x0, 0.5, START.z1 - START.z0), platformMat);
    startPlat.position.set(0, -0.25, (START.z0 + START.z1) / 2);
    scene.add(startPlat);
    const finishPlat = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 5), finishMat);
    finishPlat.position.set(0, -0.25, FINISH_Z);
    scene.add(finishPlat);
    // low walls behind the start and past the finish
    for (const z of [START.z1 + 0.1, FINISH.z0 - 0.1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(z > 0 ? START.x1 - START.x0 : 6, 1, 0.2), metal);
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
    // recorded screams (minigames/glass-bridge/sounds/, credits in sounds/CREDITS.txt)
    const SOUND_DIR = "minigames/glass-bridge/sounds/";
    const SCREAMS = {
      m: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `scream_m${i}.mp3`),
      f: [1, 2, 3, 4].map((i) => `scream_f${i}.mp3`),
    };
    const FEMALE_CHARS = new Set(["rogue", "rogue-hooded", "skeleton-rogue"]);
    const decoded = {};
    function loadSounds() {
      const a = actx;
      if (!a || location.protocol === "file:") return;
      [...SCREAMS.m, ...SCREAMS.f].forEach((f) => {
        if (decoded[f]) return;
        decoded[f] = fetch(SOUND_DIR + f).then((r) => r.arrayBuffer())
          .then((buf) => new Promise((ok, no) => a.decodeAudioData(buf, ok, no)))
          .then((b) => (decoded[f] = b)).catch(() => delete decoded[f]);
      });
    }
    // someone falls: they scream (same voice on every screen, quieter the further away they are)
    function scream(p) {
      const a = audio(); if (!a) return;
      const list = FEMALE_CHARS.has(p.char) ? SCREAMS.f : SCREAMS.m;
      let h = 7;
      for (const c of String(p.id) + ":" + (p.falls || 0)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const b = decoded[list[h % list.length]];
      if (!(b instanceof AudioBuffer)) { loadSounds(); return; }
      const far = camera.position.distanceTo(p.mesh.position);
      const level = Math.max(0.25, Math.min(1, 1.15 - far / 40));
      // falling away: the pitch sags, it gets muffled and quieter, and echoes trail off down the pit
      const t = a.currentTime, rate = 0.96 + (h % 9) / 100;
      const len = b.duration / (rate * 0.8); // how long the scream lasts while it slows down
      const src = a.createBufferSource(); src.buffer = b;
      src.playbackRate.setValueAtTime(rate, t);
      src.playbackRate.linearRampToValueAtTime(rate * 0.62, t + len);
      const lp = a.createBiquadFilter(); lp.type = "lowpass";
      lp.frequency.setValueAtTime(7000, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + len + 0.3);
      const g = a.createGain();
      g.gain.setValueAtTime(level, t);
      g.gain.linearRampToValueAtTime(level * 0.55, t + len * 0.5);
      g.gain.exponentialRampToValueAtTime(0.001, t + len + 0.2);
      // echo: a short delay fed back into itself, each repeat darker and quieter
      const delay = a.createDelay(1); delay.delayTime.value = 0.23;
      const fb = a.createGain(); fb.gain.value = 0.6;
      const dark = a.createBiquadFilter(); dark.type = "lowpass"; dark.frequency.value = 1400;
      const wet = a.createGain();
      wet.gain.setValueAtTime(0.55, t);
      wet.gain.linearRampToValueAtTime(0.4, t + len);
      wet.gain.exponentialRampToValueAtTime(0.001, t + len + 2.2);
      src.connect(lp).connect(g);
      g.connect(a.destination);
      g.connect(delay);
      delay.connect(dark).connect(fb).connect(delay);
      dark.connect(wet).connect(a.destination);
      src.start(t);
      src.stop(t + len + 0.25);
      setTimeout(() => { try { delay.disconnect(); fb.disconnect(); dark.disconnect(); wet.disconnect(); } catch {} }, (len + 2.6) * 1000);
    }
    function screamCheck(p) { // called every frame for every player
      const y = p.mesh.position.y;
      if (y > -0.2) p.screamed = false; // back on something solid (or respawned)
      else if (!p.screamed && y < -0.9 && p.mesh.visible) { p.screamed = true; scream(p); }
    }
    const wakeAudio = () => { audio(); loadSounds(); };
    ["pointerdown", "keydown", "touchstart"].forEach((ev) => wrap.addEventListener(ev, wakeAudio, { passive: true }));

    // ---------- HUD ----------
    // when you're out (or across), click someone's number to watch from behind them
    let watching = null;
    const canWatch = (p) => !p.out && !p.finished && !p.left && p.mesh.visible;
    function watchTarget() {
      const m = me();
      if (m && !m.out && !m.finished) return null; // you're still playing
      return watching && canWatch(watching) ? watching : null;
    }
    function renderPlayers() {
      playersEl.innerHTML = "";
      const m = me();
      const spectator = started && !done && (!m || m.out || m.finished);
      if (!spectator) watching = null;
      const L = leader();
      const list = rules.show ? lineOrder() : order;
      list.forEach((p, i) => {
        let cls = "gb3-player";
        if (p.out) cls += " out";
        else if (p.finished) cls += " finished";
        if ((mode === "online" || order.some((q) => q.bot)) && isMine(p)) cls += " me";
        if (p === L) cls += " lead";
        let label = p.bot ? `🤖 ${p.num}` : mode === "online" ? `${p.num} ${p.name}` : p.num;
        if (rules.show) label = `${i + 1}. ${label}`;
        const watchable = spectator && p !== m && canWatch(p);
        if (watchable) cls += " watchable";
        if (watchable && p === watching) cls += " watching";
        const chip = el("div", cls, p.finished ? "✓ " + label : label);
        if (watchable) chip.addEventListener("click", () => {
          watching = watching === p ? null : p; // click again to go back to the start view
          renderPlayers();
        });
        playersEl.append(chip);
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
    // starting spots spread over the whole platform: rows of 5, about 3 apart, middle first
    const SPAWN_COLS = [[0, -3.2, 3.2, -6.4, 6.4], [-1.6, 1.6, -4.8, 4.8, 0]]; // every other row is staggered
    const spawnSpot = (k) => {
      const row = Math.floor(k / 5) % 4, lap = Math.floor(k / 20); // (more than 20 players: squeeze in between)
      const x = SPAWN_COLS[row % 2][k % 5] + lap * 0.8;
      return new THREE.Vector3(Math.max(START.x0 + 0.6, Math.min(START.x1 - 0.6, x)), 0, 0.3 + row * 3 + lap * 1.4);
    };
    const classicSolo = () => mode === "solo" && !order.some((q) => q.bot) && !rules.show; // 3 players, one at a time

    // ---------- the line (show rules) ----------
    let line = []; // player ids, front of the line first
    const lineOrder = () => line.map((id) => order.find((q) => q.id === id)).filter(Boolean);
    const lineAlive = () => lineOrder().filter((q) => !q.out && !q.finished && !q.left);
    const leader = () => (rules.show ? lineAlive()[0] || null : null);
    const isLeader = (p) => rules.show && leader() === p;
    function aheadOf(p) {
      const a = lineAlive();
      const i = a.indexOf(p);
      return i > 0 ? a[i - 1] : null;
    }
    // which row someone is on: -1 = start platform, 0..17 = glass rows, 18 = finish
    function rowOf(p) {
      const z = p.mesh.position.z;
      if (z >= START.z0 - 0.4) return -1;
      if (z <= FINISH.z1 + 0.4) return STEPS;
      return Math.max(0, Math.min(STEPS - 1, Math.round((FIRST_Z - z) / ROW_GAP)));
    }
    // show rules: the furthest row you're allowed onto (you can't pass the player ahead of you)
    function maxRowFor(p) {
      if (!rules.show || isLeader(p)) return STEPS;
      const a = aheadOf(p);
      return a ? rowOf(a) - 1 : STEPS;
    }
    function spotFor(p) { // where p starts / respawns
      if (classicSolo()) {
        const k = order.indexOf(p);
        return new THREE.Vector3(k === 0 ? 0 : k === 1 ? -2.2 : 2.2, 0, k === 0 ? -1.4 : -0.6);
      }
      const k = rules.show ? Math.max(0, line.indexOf(p.id)) : order.indexOf(p);
      return spawnSpot(k);
    }

    function addPlayer(r, k) {
      const mine = mode === "online" && room && r.id === room.id;
      const p = {
        ...r,
        out: false, finished: false, best: -1,
        vel: new THREE.Vector3(), onGround: true, phase: 0,
        target: null, targetRy: 0, lastSent: null, sendT: 0, ai: null,
        mesh: makePlayerMesh(r.num, mode === "online" || r.bot ? (r.bot ? `🤖 ${r.num}` : r.name) : null, mine, r.char),
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
    function beginMatch(safeArr, roster, id = "", matchRules = opts, lineIds = null) {
      if (loadingMatch) return;
      loadingMatch = true;
      if (Models.available()) {
        lobby.hidden = false;
        lobby.innerHTML = "";
        const card = el("div", "gb3-card");
        card.append(el("h2", "", "Loading characters…"));
        lobby.append(card);
      }
      const go = () => { loadingMatch = false; startMatch(safeArr, roster, id, matchRules, lineIds); };
      if (!Models.available()) return go();
      const chars = roster.map((r) => r.char || "tracksuit");
      const waits = [Models.loadAll(matchRules.show ? [...chars, ...ARCHER_CHARS] : chars)];
      if (matchRules.show) { // the archers need their crossbows, bolts and aiming animations
        if (Models.loadAnims) waits.push(Models.loadAnims(["ranged"]).catch(() => {}));
        if (Models.loadProps) waits.push(Models.loadProps(["Skeleton_Crossbow", "Skeleton_Arrow"]).catch(() => {}));
      }
      Promise.race([Promise.allSettled(waits), new Promise((r) => setTimeout(r, 10000))]).then(go);
    }

    // roster: [{ id, name, num, char }]
    function startMatch(safeArr, roster, id = "", matchRules = opts, lineIds = null) {
      if (started) resetMatch();
      rules = { ...DEFAULT_OPTS, ...matchRules };
      if (rules.show) rules.freePlay = false; // show rules: one life per round
      elapsed = 0;
      finishCount = 0;
      matchId = id;
      safe = safeArr;
      order = roster.map(addPlayer);
      line = lineIds && lineIds.length ? lineIds.slice() : order.map((q) => q.id);
      order.forEach((q) => q.mesh.position.copy(spotFor(q)));
      jump.leaderId = null;
      spawnArchers();
      started = true;
      lobby.hidden = true;
      countdown = COUNTDOWN;
      clockLeft = rules.time;
      input.showTouch(true);
      input.clearJump();
      const touch = navigator.maxTouchPoints > 0;
      const pushHelp = !rules.show;
      say((touch ? `Joystick: up = toward the bridge. JUMP${pushHelp ? ", PUSH" : ""}. Swipe the screen to look around.`
        : `WASD / arrows move (W = toward the bridge) · Space jump${pushHelp ? " · F push" : ""} · drag the mouse to look around`) +
        (rules.show ? "\nShow rules: wait for your turn in line. 10 seconds per jump, or the archers shoot. No pushing." : "") +
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
        sendFor(p, { t: "step", row, side });
        if (row > p.best) {
          p.best = row;
          if (isMine(p) && (mode === "online" || row > soloBest)) {
            soloBest = Math.max(soloBest, row);
            api.addScore(10);
          }
          if (isMine(p)) tone(560 + row * 25, 0.2, 0.12);
        }
      } else {
        breakPanel(row, side);
        sendFor(p, { t: "break", row, side });
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
      const tip = isMine(p) && !rules.freePlay && order.some((q) => q !== p && canWatch(q));
      say(tip ? `${nameOf(p)} fell! Click a player's number at the top to watch them.` : `${nameOf(p)} fell!`, "bad");
      if (rules.freePlay) {
        // option: respawn right away, no waiting for anyone
        p.falls = (p.falls || 0) + 1;
        if (mode === "online" && local(p)) sendFor(p, { t: "fell" });
        if (local(p)) later(() => respawnOne(p), 1200);
        return;
      }
      if (mode === "online") {
        if (local(p)) sendFor(p, { t: "fell" });
        return checkAllDone();
      }
      if (!classicSolo()) return checkAllDone(); // solo with bots / show rules: one player each
      // classic solo: your next player steps up
      later(() => {
        if (done) return;
        const next = order.findIndex((q) => !q.bot && !q.out && !q.finished);
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
      if (mode === "online" && local(p)) sendFor(p, { t: "finish" });
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
      p.mesh.position.copy(classicSolo() ? new THREE.Vector3(0, 0, -1.4) : spotFor(p));
      p.ai = null;
      if (isMine(p)) input.clearJump();
      if (local(p)) sendFor(p, { t: "respawn" });
      renderPlayers();
      say(`${nameOf(p)} ${isMine(p) && mode === "online" ? "are" : "is"} back at the start.`);
    }

    function respawnAll() {
      respawnPending = false;
      if (done) return;
      round++;
      order.forEach((p) => {
        if (p.left) return; // left the room: don't bring them back
        p.out = false;
        p.mesh.visible = true;
        p.mesh.rotation.set(0, 0, 0);
        p.vel.set(0, 0, 0);
        p.onGround = true;
        p.target = null;
        p.lastSent = null;
        p.mesh.position.copy(spotFor(p));
        p.ai = null;
      });
      jump.leaderId = null;
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
        const winner = order.find((q) => q.rank === 1);
        if (winner && winner.bot) {
          say(`🏆 ${winner.name} wins!`, "bad");
        } else if (survivors.length && rules.freePlay) {
          const falls = me().falls || 0;
          api.addScore(Math.max(0, 150 - falls * 25) + timeBonus);
          say(`You made it across in ${clockText(elapsed)} with ${falls} fall${falls === 1 ? "" : "s"}!`, "good");
        } else if (survivors.length) {
          if (classicSolo()) {
            api.addScore(left * 50 + timeBonus);
            say(`You made it across with ${left} player${left === 1 ? "" : "s"} left!`, "good");
          } else {
            api.addScore(150 + timeBonus);
            say(`🏆 You win! (${clockText(elapsed)})`, "good");
          }
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
      const humans = list.slice(0, MAX_ONLINE);
      const bots = opts.bots || 0;
      const nums = assignNumbers([...humans.map((p) => p.num), ...Array(bots).fill("")]);
      const roster = [
        ...humans.map((p, i) => ({ id: p.id, name: p.name, num: nums[i], char: p.char || "tracksuit" })),
        ...makeBots(bots, nums.slice(humans.length)),
      ];
      const data = {
        t: "start",
        m: Math.random().toString(36).slice(2, 10),
        safe: randomSafe(),
        roster,
        line: shuffle(roster.map((r) => r.id)),
        opts: { ...opts },
      };
      room.send(data);
      room.update({ inGame: true, opts: { ...opts } });
      beginMatch(data.safe, data.roster, data.m, data.opts, data.line);
    }

    // computer players: everyone in a dark green tracksuit, like the show
    function makeBots(n, nums) {
      return Array.from({ length: n }, (_, i) => ({ id: "bot" + i, name: `Bot ${nums[i]}`, num: nums[i], char: "tracksuit", bot: true }));
    }
    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // ---------- physics ----------
    const shards = [];
    let time = 0;

    // your controls this frame (bots get theirs from botBrain)
    const humanCtrl = () => ({ mv: input.move(), jump: input.jump(), push: input.push() });

    let lastWaitMsg = -9;
    function stepLocal(p, dt, ctrl) {
      const live = !p.out && countdown <= 0 && !done;
      const mv = live ? ctrl.mv : { x: 0, y: 0 };
      const wantJump = ctrl.jump && live;
      if (ctrl.push && PUSH_ENABLED && !rules.show && live && time - (p.lastPush || -9) > PUSH_COOLDOWN) doPush(p);
      const P = p.mesh.position;

      // players: forward on the stick is always toward the bridge, and your character turns to face
      // the way you're walking. (Bots steer themselves and just walk the way they face.)
      let fwd, dirX, dirZ;
      if (p.bot) {
        fwd = mv.y;
        dirX = -Math.sin(p.mesh.rotation.y); dirZ = -Math.cos(p.mesh.rotation.y);
      } else {
        const len = Math.hypot(mv.x, mv.y);
        fwd = Math.min(1, len);
        dirX = len > 0.01 ? mv.x / len : 0; dirZ = len > 0.01 ? -mv.y / len : 0;
        if (live && len > 0.1) p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, faceAngle(dirX, dirZ), Math.min(1, dt * 12));
      }

      if (wantJump && p.onGround) {
        const from = supportAt(P.x, P.z);
        p.jumpFrom = from && from.kind === "panel" ? from.row * 2 + from.side : null; // which glass tile (or none)
        p.noBack = !!(from && from.kind === "panel"); // jumping off the glass: forward or sideways only
        p.vel.y = JUMP_V;
        p.onGround = false;
        p.jumped = true;
        // show rules: not your turn yet -> you can hop, but not forward past the player ahead of you
        p.noForward = rules.show && rowOf(p) + 1 > maxRowFor(p);
        if (p.noForward && isMine(p) && time - lastWaitMsg > 2) {
          lastWaitMsg = time;
          const a = aheadOf(p);
          say(a ? `Wait your turn: you can't pass ${nameOf(a)}.` : "Wait your turn.", "bad");
        }
        if (isMine(p)) tone(300, 0.08, 0.05, "triangle");
      }
      // show rules: the start platform has a rail while you wait for your turn
      const holdBack = rules.show && maxRowFor(p) < 0;

      // small fixed steps so landings work the same on fast and slow devices
      const n = Math.max(1, Math.ceil(dt * 120));
      const h = dt / n;
      for (let s = 0; s < n; s++) {
        const k = Math.min(1, (p.onGround ? 14 : 8) * h); // less control in the air
        p.vel.x += (dirX * fwd * SPEED - p.vel.x) * k;
        p.vel.z += (dirZ * fwd * SPEED - p.vel.z) * k;
        p.vel.y -= GRAVITY * h;
        if (p.noForward && !p.onGround && p.vel.z < 0) p.vel.z = 0; // can't jump past the player ahead
        if (p.noBack && !p.onGround && p.vel.z > 0) p.vel.z = 0; // can't jump back toward the start

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
        if (holdBack && P.y > -0.5 && P.z < START.z0 + 0.3) { P.z = START.z0 + 0.3; p.vel.z = Math.max(0, p.vel.z); }

        // only a real jump gets the extra landing help, so you can't walk across the gaps
        const sup = p.out ? null : supportAt(P.x, P.z, p.jumped && !p.onGround ? M_LAND : M);
        const wasGround = p.onGround;
        if (sup && p.vel.y <= 0 && prevY >= sup.top - 0.05 && P.y <= sup.top) {
          P.y = sup.top;
          p.vel.y = 0;
          p.onGround = true;
          if (!wasGround) {
            p.jumped = false;
            p.noForward = false;
            p.noBack = false;
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
      animate(p, speed, !p.onGround, dt);

      if (!p.out && P.y < -4) eliminate(p);
      if (P.y < -55) p.mesh.visible = false;

      // online: tell everyone where we are (bots are sent all together by the host, see update)
      if (mode === "online" && p.mesh.visible && !p.bot) {
        p.sendT += dt;
        const moved = !p.lastSent || P.distanceTo(p.lastSent) > 0.01;
        if (p.sendT >= SEND_EVERY && (moved || p.sendT > 0.5)) {
          p.sendT = 0;
          p.lastSent = P.clone();
          const r2 = (v) => Math.round(v * 100) / 100;
          sendFor(p, { t: "pos", x: r2(P.x), y: r2(P.y), z: r2(P.z), ry: r2(p.mesh.rotation.y) });
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
            sendFor(p, { t: "shove", to: q.id, x: sx, z: sz });
            if (local(q)) slideBy(q, sx, sz); // a bot you run (or you): apply it here
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
      sendFor(p, { t: "push", hits });
      hits.forEach((h) => { const q = order.find((o) => o.id === h.to); if (q && q.bot && local(q)) getPushed(q, h.x, h.z); });
    }
    let lastCdText = null;
    const pushBtnEl = wrap.querySelector(".inp-push");
    function updatePushCooldown() {
      const m = me();
      const pushOn = PUSH_ENABLED && !rules.show; // no pushing in show mode
      if (pushBtnEl) pushBtnEl.style.visibility = pushOn ? "" : "hidden";
      if (!pushOn || !started || done || !m || m.out) {
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
    function slideBy(q, x, z) {
      if (q && !q.out && !q.finished) q.slide = { x: x / 0.25, z: z / 0.25, t: 0.25 };
    }
    function getPushed(m, x, z) {
      if (!m || m.out || m.finished || rules.show) return;
      m.vel.x += x;
      m.vel.z += z;
      m.vel.y = Math.max(m.vel.y, 4.5); // knocked off your feet
      m.onGround = false;
      tone(140, 0.15, 0.12, "square");
    }

    // ---------- computer players ----------
    // A bot walks to the back of its glass, lines up with the next tile, runs, and jumps near the edge.
    // It picks a side it knows is safe (stepped on / the other one broke), otherwise it guesses.
    const NONE = { mv: { x: 0, y: 0 }, jump: false, push: false };
    const faceAngle = (dx, dz) => Math.atan2(-dx, -dz);
    // Bots don't need a joystick to turn: they swing straight round to face their target, and only
    // walk forward once they're lined up (so they never circle a spot or jump at an angle).
    let botDt = 0;
    function steer(p, tx, tz, go) {
      const P = p.mesh.position;
      const want = faceAngle(tx - P.x, tz - P.z);
      p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, want, Math.min(1, botDt * 12));
      const diff = Math.abs(Math.atan2(Math.sin(want - p.mesh.rotation.y), Math.cos(want - p.mesh.rotation.y)));
      return { x: 0, y: go && diff < 0.15 ? 1 : 0, off: diff };
    }
    function tileKey(q) {
      const s = supportAt(q.mesh.position.x, q.mesh.position.z);
      return s && s.kind === "panel" ? s.row * 2 + s.side : null;
    }
    function pickSide(row) {
      const [a, b] = panels[row];
      if (a.broken) return 1;
      if (b.broken) return 0;
      if (a.stepped || a.known) return 0;
      if (b.stepped || b.known) return 1;
      return Math.random() < 0.5 ? 0 : 1; // nobody knows: guess
    }
    function botBrain(p, dt) {
      botDt = dt;
      const ai = p.ai || (p.ai = { state: "think", wait: 0.1 + Math.random() * 0.4 });
      if (p.out || p.finished || countdown > 0 || done) return NONE;
      const P = p.mesh.position;
      if (ai.state === "air") {
        if (p.onGround) { // landed: catch a breath
          ai.state = "think";
          ai.wait = rules.show ? (isLeader(p) ? 0.3 + Math.random() * 0.9 : 0.1 + Math.random() * 0.3) : 0.05 + Math.random() * 0.25;
          return NONE;
        }
        return { mv: steer(p, ai.tx, ai.tz, true), jump: false, push: false };
      }
      if (!p.onGround) return NONE;
      if (ai.state === "think") {
        ai.wait -= dt;
        if (ai.wait > 0) return NONE;
        const next = rowOf(p) + 1;
        if (next > maxRowFor(p)) { // not my turn yet: on the platform, wait near the front of it
          ai.wait = 0.1;
          if (!rules.show || rowOf(p) !== -1) return NONE;
          const i = Math.max(0, lineAlive().indexOf(p) - 1);
          const qx = [-2.4, -0.8, 0.8, 2.4][i % 4], qz = START.z0 + 2.2 + Math.floor(i / 4) * 1.4;
          const d = Math.hypot(qx - P.x, qz - P.z);
          if (d < 0.5) return NONE;
          const s = steer(p, qx, qz, true);
          ai.wait = 0;
          return { mv: { x: 0, y: s.y * Math.min(1, d) }, jump: false, push: false };
        }
        if (next >= STEPS) { ai.tx = 0; ai.tz = FINISH_Z + 1.2; } // the finish!
        else {
          const side = pickSide(next);
          if (order.some((q) => q !== p && !q.out && tileKey(q) === next * 2 + side)) { ai.wait = 0.15; return NONE; } // taken
          ai.tx = laneX(side);
          ai.tz = rowZ(next);
        }
        // run-up spot: the back of where I'm standing, lined up with the target
        const sup = supportAt(P.x, P.z);
        const cx = sup && sup.kind === "panel" ? laneX(sup.side) : Math.max(-2.4, Math.min(2.4, ai.tx));
        const cz = sup && sup.kind === "panel" ? rowZ(sup.row) : START.z0 + 1.0;
        const dx = ai.tx - cx, dz = ai.tz - cz, dl = Math.hypot(dx, dz) || 1;
        ai.rx = cx - (dx / dl) * 0.5;
        ai.rz = cz - (dz / dl) * 0.5;
        ai.state = "runup";
        ai.t = 0;
      }
      ai.t = (ai.t || 0) + dt;
      if (ai.t > 6) { ai.state = "think"; ai.wait = 0.2; return NONE; } // stuck: start over
      if (ai.state === "runup") {
        const d = Math.hypot(ai.rx - P.x, ai.rz - P.z);
        const moving = Math.hypot(p.vel.x, p.vel.z);
        if (d > 0.3) { // walk there, slowing down as it gets close
          const s = steer(p, ai.rx, ai.rz, true);
          return { mv: { x: 0, y: s.y * Math.min(1, d * 1.2) }, jump: false, push: false };
        }
        if (moving > 0.8) return NONE; // let it slow down first
        ai.state = "aim";
      }
      if (ai.state === "aim") {
        const s = steer(p, ai.tx, ai.tz, false);
        if (s.off < 0.03) ai.state = "go";
        return NONE;
      }
      // "go": run at it and jump near the edge (or once it's in reach)
      const s = steer(p, ai.tx, ai.tz, true);
      const fx = -Math.sin(p.mesh.rotation.y), fz = -Math.cos(p.mesh.rotation.y);
      const edge = !supportAt(P.x + fx * 0.45, P.z + fz * 0.45);
      const d = Math.hypot(ai.tx - P.x, ai.tz - P.z);
      if (edge || d < 2.45) {
        ai.state = "air";
        return { mv: s, jump: true, push: false };
      }
      return { mv: s, jump: false, push: false };
    }

    // ---------- show rules: 10 seconds per jump, archers at the end ----------
    const jump = { leaderId: null, row: -2, left: SHOW_JUMP_TIME, shot: false };
    function updateJumpClock(dt) {
      const L = started && !done && countdown <= 0 ? leader() : null;
      if (!L) { if (jumpClockEl.textContent) jumpClockEl.textContent = ""; return; }
      const r = rowOf(L);
      if (L.id !== jump.leaderId || r !== jump.row) { // new front player, or they made a jump
        jump.leaderId = L.id;
        jump.row = r;
        jump.left = SHOW_JUMP_TIME;
        jump.shot = false;
        renderPlayers();
      }
      const inAir = L.mesh.position.y > 0.12;
      if (!inAir) jump.left -= dt;
      const secs = Math.max(0, Math.ceil(jump.left));
      jumpClockEl.textContent = jump.shot ? "" : `${isMine(L) ? "YOUR JUMP" : nameOf(L) + " must jump"}: ${secs}`;
      jumpClockEl.classList.toggle("low", jump.left <= 3);
      if (jump.left <= 0 && !jump.shot) {
        jump.shot = true;
        if (local(L)) { // their own game (or the host, for a bot) calls the shot
          sendFor(L, { t: "shot" });
          fire(L);
        }
      }
    }

    // two skeleton archers with crossbows, on posts at the end of the bridge
    const archers = [];
    const archerPost = new THREE.BoxGeometry(1.1, 1.6, 1.1);
    function spawnArchers() {
      archers.forEach((a) => scene.remove(a.root, a.post));
      archers.length = 0;
      if (!rules.show) return;
      [-1, 1].forEach((s, i) => {
        const post = new THREE.Mesh(archerPost, metal);
        post.position.set(s * 2.35, 0.8, FINISH_Z - 1.4);
        scene.add(post);
        const root = new THREE.Group();
        root.position.set(s * 2.35, 1.6, FINISH_Z - 1.4);
        root.rotation.y = Math.PI; // facing back down the bridge
        const kk = Models.available() ? Models.spawn(ARCHER_CHARS[i]) : null;
        if (kk) {
          root.add(kk.root);
          if (kk.hold) kk.hold("Skeleton_Crossbow", "right", { turn: [0, 90, 0] });
          kk.play("Idle_A", { fade: 0 });
        } else {
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xd8d0c0 }));
          body.position.y = 0.85;
          root.add(body);
        }
        scene.add(root);
        archers.push({ root, post, kk, rest: Math.PI, busy: 0, shotT: 0, target: null });
      });
    }
    function updateArchers(dt) {
      const L = leader();
      const tense = L && !jump.shot && jump.left < 4; // crossbows up when time is running out
      archers.forEach((a) => {
        a.busy -= dt;
        const t = a.busy > 0 ? a.target : tense ? L : null;
        const goal = t ? faceAngle(t.mesh.position.x - a.root.position.x, t.mesh.position.z - a.root.position.z) : a.rest;
        a.root.rotation.y = lerpAngle(a.root.rotation.y, goal, dt * 6);
        if (a.kk) {
          a.shotT -= dt;
          if (a.shotT <= 0) a.kk.play(t ? "Ranged_2H_Aiming" : "Idle_A", { fade: 0.25 });
          a.kk.update(dt);
        }
      });
    }
    function fire(p) {
      if (!archers.length) return hit(p);
      // the closer archer takes the shot
      const a = archers.reduce((b, c) => (c.root.position.distanceTo(p.mesh.position) < b.root.position.distanceTo(p.mesh.position) ? c : b));
      a.target = p;
      a.busy = 1.6;
      later(() => {
        if (a.kk) { a.kk.play("Ranged_2H_Shoot", { once: true, fade: 0.05 }); a.shotT = 0.9; }
        later(() => {
          tone(190, 0.28, 0.22, "triangle"); // crossbow twang
          tone(95, 0.2, 0.16, "sawtooth");
          const bow = a.kk && a.kk.held ? a.kk.held("right") : null;
          const from = bow ? bow.getWorldPosition(new THREE.Vector3()) : a.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
          launchBolt(from, p);
        }, 120);
      }, 350);
    }
    const bolts = [];
    const DOWN = new THREE.Vector3(0, -1, 0); // the bolt model's tip points down
    function headOf(p) {
      const kk = p.mesh.userData.kk;
      const bone = kk ? kk.bone("head") : null;
      if (!bone) return p.mesh.position.clone().add(new THREE.Vector3(0, 1.75, 0));
      return bone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.2, 0));
    }
    function launchBolt(from, p) {
      const obj = (Models.prop && Models.prop("Skeleton_Arrow")) ||
        new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0x5a4030 }));
      obj.scale.multiplyScalar(1.6);
      scene.add(obj);
      bolts.push({ obj, from: from.clone(), p, t: 0, dur: Math.max(0.15, from.distanceTo(p.mesh.position) / 60), life: 0 });
    }
    function updateBolts(dt) {
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        if (b.done) { // sticks with the falling body for a moment, then goes
          b.life += dt;
          b.obj.position.copy(headOf(b.p));
          if (b.life > 2.5) { scene.remove(b.obj); bolts.splice(i, 1); }
          continue;
        }
        b.t += dt;
        const to = headOf(b.p);
        const k = Math.min(1, b.t / b.dur);
        const dir = to.clone().sub(b.from).normalize();
        b.obj.quaternion.setFromUnitVectors(DOWN, dir);
        b.obj.position.lerpVectors(b.from, to, k);
        if (k >= 1) { b.done = true; hit(b.p); }
      }
    }
    function hit(p) {
      tone(80, 0.25, 0.28, "sine");
      say(`${nameOf(p)} ${isMine(p) && mode === "online" ? "were" : "was"} shot!`, "bad");
      if (local(p) && !p.out) { // knocked off the bridge
        const side = p.mesh.position.x >= 0 ? 1 : -1;
        p.vel.set(side * 3.5, 3, 1);
        p.onGround = false;
        eliminate(p);
      }
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
        return beginMatch(data.safe, data.roster, data.m, data.opts || DEFAULT_OPTS, data.line);
      }
      if (!started || data.m !== matchId) return; // not for this match
      if (data.t === "bots") { // the host's computer players
        if (simBots()) return;
        (data.list || []).forEach(([id, x, y, z, ry]) => {
          const q = order.find((o) => o.id === id);
          if (!q) return;
          if (!q.target) q.target = new THREE.Vector3();
          q.target.set(x, y, z);
          q.targetRy = ry;
        });
        return;
      }
      const p = order.find((q) => q.id === (data.by || from)); // bots' messages say who they're about
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
        if (q && local(q)) slideBy(q, data.x, data.z); // me, or a bot I run
      } else if (data.t === "push") {
        startPushAnim(p);
        (data.hits || []).forEach((h) => {
          const q = order.find((o) => o.id === h.to);
          if (q) startHitAnim(q); // everyone sees who got hit
          if (q && local(q)) getPushed(q, h.x, h.z);
        });
      }
      else if (data.t === "break") breakPanel(data.row, data.side);
      else if (data.t === "fell") eliminate(p);
      else if (data.t === "respawn") respawnOne(p);
      else if (data.t === "finish") finish(p);
      else if (data.t === "shot") { jump.shot = true; fire(p); }
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
        if (!p.bot && !p.left && !here.has(p.id)) {
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
    let myNum = (() => { try { return cleanNum(localStorage.getItem("gos:num")); } catch { return ""; } })();
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
      toggle("show", "Show rules: random line order, 10 s per jump, archers");
      const botRow = el("label", "gb3-opt");
      const botSel = el("select");
      for (let n = 0; n <= MAX_BOTS; n++) {
        const o = el("option", "", n ? `${n}` : "None");
        o.value = n;
        if (n === (opts.bots || 0)) o.selected = true;
        botSel.append(o);
      }
      botSel.addEventListener("keydown", (e) => e.stopPropagation());
      botSel.onchange = () => { opts.bots = +botSel.value; changed(); };
      botRow.append(el("span", "", "Computer players"), botSel);
      box.append(botRow);
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
      card.append(el("label", "", "Your number (1–456, blank = random)"));
      const numIn = makeInput(myNum, "e.g. 456", 3);
      numIn.inputMode = "numeric";
      numIn.onchange = () => {
        myNum = cleanNum(numIn.value);
        numIn.value = myNum;
        try { localStorage.setItem("gos:num", myNum); } catch {}
      };
      card.append(numIn);
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
        const bots = opts.bots || 0;
        if (!bots && !opts.show) { // classic solo: 3 players, one at a time
          const nums = assignNumbers([myNum, "", ""].slice(0, SOLO_PLAYERS));
          return beginMatch(randomSafe(), nums.map((num, i) => ({ id: "solo" + i, name: "Player " + num, num, char: myChar })));
        }
        // you + computer players
        const nums = assignNumbers([myNum, ...Array(bots).fill("")]);
        const roster = [{ id: "solo0", name: "Player " + nums[0], num: nums[0], char: myChar }, ...makeBots(bots, nums.slice(1))];
        beginMatch(randomSafe(), roster, "", opts, shuffle(roster.map((r) => r.id)));
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
        }, { char: myChar, opts: { ...opts }, num: myNum });
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
        const num = cleanNum(p.num) ? ` #${cleanNum(p.num)}` : "";
        ul.append(el("li", "", `${p.name}${num}${mine ? " (you)" : ""}${i === 0 ? " 👑" : ""}${ch}`));
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
    let lastWatched = null, snapCam = false;
    const camHeading = 0; // the camera always looks down the bridge (drag to look around)
    let botSendT = 0;

    // Look around: hold the mouse button and drag, or swipe the game view on a phone.
    // Let go and the camera eases back behind you.
    const look = { yaw: 0, pitch: 0, dragging: false, id: null, x: 0, y: 0 };
    const view = renderer.domElement;
    view.addEventListener("pointerdown", (e) => {
      if (look.dragging) return;
      look.dragging = true;
      look.id = e.pointerId;
      look.x = e.clientX;
      look.y = e.clientY;
      try { view.setPointerCapture(e.pointerId); } catch {}
    });
    view.addEventListener("pointermove", (e) => {
      if (!look.dragging || e.pointerId !== look.id) return;
      const w = view.clientWidth || 800;
      look.yaw -= ((e.clientX - look.x) / w) * Math.PI * 1.6; // a full-width swipe turns you ~290°
      look.pitch += ((e.clientY - look.y) / w) * 2.2;
      look.yaw = Math.max(-Math.PI, Math.min(Math.PI, look.yaw)); // up to looking straight behind you
      look.pitch = Math.max(-0.6, Math.min(0.5, look.pitch));
      look.x = e.clientX;
      look.y = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === look.id) { look.dragging = false; look.id = null; } };
    view.addEventListener("pointerup", endLook);
    view.addEventListener("pointercancel", endLook);
    view.addEventListener("lostpointercapture", endLook);

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
        if (p === mine) stepLocal(p, dt, humanCtrl());
        else if (p.bot && simBots()) stepLocal(p, dt, botBrain(p, dt));
        else if (mode === "online") stepRemote(p, dt);
        else if (p.out) { /* solo: fallen players keep falling */ p.vel.y -= GRAVITY * dt; p.mesh.position.addScaledVector(p.vel, dt); animate(p, 0, true, dt); if (p.mesh.position.y < -55) p.mesh.visible = false; }
        else stepIdle(p, dt);
        screamCheck(p);
      }

      updateEffects(dt);
      updateJumpClock(dt);
      updateArchers(dt);
      updateBolts(dt);
      // the host sends all its computer players in one message
      if (mode === "online" && amHost() && started) {
        botSendT += dt;
        if (botSendT >= SEND_EVERY) {
          botSendT = 0;
          const r2 = (v) => Math.round(v * 100) / 100;
          const list = order.filter((q) => q.bot && q.mesh.visible)
            .map((q) => [q.id, r2(q.mesh.position.x), r2(q.mesh.position.y), r2(q.mesh.position.z), r2(q.mesh.rotation.y)]);
          if (list.length) send({ t: "bots", list });
        }
      }
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
      const w = watchTarget();
      const t = w || me();
      const dead = !t || t.out;
      if (w !== lastWatched) { // switching who you watch: jump straight there
        lastWatched = w;
        if (w) { camHeld = false; followY = Math.max(0, w.mesh.position.y); snapCam = true; }
      }
      const focus = dead ? START_VIEW : t.mesh.position;
      if (!dead) followY += (Math.max(0, focus.y) - followY) * Math.min(1, dt * 3);
      // look-around: while dragging, the camera swings around you; let go and it eases back
      if (!look.dragging) {
        look.yaw += (0 - look.yaw) * Math.min(1, dt * 5);
        look.pitch += (0 - look.pitch) * Math.min(1, dt * 5);
      }
      const baseY = (dead ? 0 : followY);
      const elev = Math.max(0.2, Math.min(1.35, Math.atan2(CAM_UP, CAM_BACK) + look.pitch));
      const dist = Math.hypot(CAM_UP, CAM_BACK);
      const back = dist * Math.cos(elev), up = dist * Math.sin(elev);
      const yaw = camHeading + look.yaw;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const camGoal = new THREE.Vector3(focus.x + sy * back, baseY + up, focus.z + cy * back);
      const lookGoal = new THREE.Vector3(focus.x - sy * LOOK_AHEAD, baseY + 0.4, focus.z - cy * LOOK_AHEAD);
      const k = look.dragging ? 12 : 4; // follow your finger/mouse closely while dragging
      if (snapCam) {
        snapCam = false;
        camPos.copy(camGoal);
        camLook.copy(lookGoal);
      } else if (dead && !camHeld) { // snap straight back to the start, no swooping
        camHeld = true;
        followY = 0;
        camPos.copy(camGoal);
        camLook.copy(lookGoal);
      } else {
        if (!dead) camHeld = false;
        camPos.lerp(camGoal, Math.min(1, dt * k));
        camLook.lerp(lookGoal, Math.min(1, dt * (k + 1)));
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
