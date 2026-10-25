// Red Light, Green Light (3D) — by Cougar.
//
// The rules (like the show):
//   Everyone starts behind the line. A giant doll at the far end turns her back and sings
//   "Mugunghwa kkochi pieotseumnida" (the traditional Korean playground chant). While she sings,
//   you can move. When the song ends she spins around and watches. Anyone she sees moving is
//   shot by the snipers. Cross the finish line before the 5-minute clock runs out, or you're out.
//   Her song changes speed every time: sometimes slow, sometimes rushed, sometimes both.
//
// STEP 1 (this version): solo. STEP 2: online (up to 8 players). STEP 3: CPU players.
//
// Art: KayKit characters/props (shared/models.js). The doll, stage, music and sounds are original,
// built in code (no image or sound files).
//
// Controls (shared/input.js): WASD / arrows / left stick / phone joystick. No jumping in this game.

Hub.register({
  id: "red-light",
  name: "Red Light, Green Light",
  description: "Move while she sings. Freeze when she looks. (3D)",
  author: "Cougar",
  color: "#ff3b5c",
  // home-screen picture: the doll at the end of a long field, a red and a green light
  art: `<svg viewBox="0 0 120 70"><g stroke-width="3" fill="none">
    <path d="M10 66 L48 30 L72 30 L110 66" stroke="#c9a46b"/>
    <circle cx="60" cy="14" r="7" stroke="#ffffff"/><path d="M53 34 L56 21 L64 21 L67 34 Z" stroke="#2de1c2"/>
    <circle cx="20" cy="18" r="6" fill="#ff3b5c" stroke="none"/><circle cx="100" cy="18" r="6" fill="#3ddc84" stroke="none"/></g></svg>`,

  start(container, api) {
    if (typeof THREE === "undefined" || typeof Input === "undefined") {
      container.textContent = "Missing shared/lib/three.min.js or shared/input.js.";
      return;
    }

    // ---------- settings ----------
    const TIME_LIMIT = 300; // seconds (the show's 5 minutes)
    const COUNTDOWN = 3;
    const SPEED = 3.2; // full-speed run
    const STOP_RATE = 26; // how fast you stop when you let go (higher = quicker)
    const MOVE_LIMIT = 0.1; // moving faster than this (m/s) while she watches = caught
    const GRACE = 0.1; // seconds after she finishes turning before she starts judging
    const TURN_TO = 0.33; // seconds to spin around and look at you
    const TURN_AWAY = 0.8; // seconds to turn back to the tree
    const WATCH = [2.4, 4.6]; // how long she watches (random in this range)
    const SPRINT_SPEED = SPEED * 2; // double-tap and hold a direction to sprint
    const SPRINT_STOP_RATE = STOP_RATE / 2; // ...and stopping from a sprint takes twice as long
    const TAP_GAP = 0.3; // seconds: how quick the double tap must be
    const BODY_R = 0.32; // players can't overlap closer than 2 x this (0.32 m = about 12.6 in)
    const SPRINT_KNOCK = 6.4; // sprinting into someone knocks them this hard (m/s): slides them about 3 ft
    const PUSH_RANGE = 1.05; // how far a push reaches, center to center (about 3 ft 5.5 in)
    const PUSH_POWER = 9; // how hard a push shoves (m/s): slides them about 6 1/2 ft
    const PUSH_DECAY = 4.5; // how fast a push wears off (lower = slides further)
    const PUSH_COOLDOWN = 0.8; // seconds between pushes
    const KNOCK_DECAY = 7; // how fast a sprint bump wears off
    const DUMMIES = 4; // practice dummies (solo testing)

    const FIELD_HALF = 18; // the field is 36 wide
    const START_Z = 0; // start line
    const FINISH_Z = -110; // finish line
    const DOLL_Z = -121;
    const TREE_Z = -131;
    const BACK_Z = -140;
    const FRONT_Z = 12;
    const WALL_X = 20;
    const WALL_H = 18;
    const DOLL_SIZE = 1.75; // the doll is about 20 tall
    const BOARD_Y = 30; // the big clock floats high above the far wall

    // the chant: 무궁화 꽃이 피었습니다 (10 syllables)
    const KO = ["무", "궁", "화", "꽃", "이", "피", "었", "습", "니", "다"];
    const ROMA = ["mu", "gung", "hwa", "kko", "chi", "pi", "eot", "seum", "ni", "da"];
    const WORD_END = [2, 4]; // a space after these syllables
    const VOWEL = ["u", "u", "a", "o", "i", "i", "eo", "eu", "i", "a"];
    const MELODY = [0, 2, 4, 4, 2, 0, 2, 4, 2, -1]; // semitones (original tune)

    // ---------- helpers ----------
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const timeouts = [];
    const later = (fn, ms) => timeouts.push(setTimeout(fn, ms));
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const smooth = (t) => t * t * (3 - 2 * t);
    const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, t);
    const faceAngle = (dx, dz) => Math.atan2(-dx, -dz); // characters face -Z at angle 0
    const clockText = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const randomNumbers = (n) => {
      const s = new Set();
      while (s.size < n) s.add(String(Math.floor(Math.random() * 456) + 1).padStart(3, "0"));
      return [...s];
    };

    // ---------- styles (removed on cleanup) ----------
    const style = document.createElement("style");
    style.textContent = `
      .rl { position: relative; width: 100%; user-select: none; -webkit-user-select: none; overflow: hidden; border-radius: 12px; }
      .rl canvas { display: block; width: 100%; touch-action: none; }
      .rl .inp-jump:not(.inp-push) { display: none !important; } /* no jumping in this game */
      /* Everything on top of the game is sized from --u = 1% of the game area's height (set in resize()),
         so short phone screens get smaller text instead of a pile-up. */
      .rl { --u: 6px; }
      .rl-hud { position: absolute; left: 0; right: 0; top: 0; padding: calc(var(--u) * 1.6) calc(var(--u) * 2); display: flex;
                align-items: flex-start; pointer-events: none; gap: calc(var(--u) * 1.6); }
      .rl-players { display: flex; flex-wrap: wrap; gap: 4px; max-width: 22%; }
      .rl.tall .rl-players { max-width: 70%; }
      .rl.tall .rl-top { top: calc(var(--u) * 3 + 40px); max-width: 94%; } /* upright phones: under the timer row */
      .rl-player { padding: 2px 8px; border-radius: 999px; background: #1f7a63; color: #fff; font-weight: 700;
                   font-size: clamp(10px, calc(var(--u) * 2.2), 13px); }
      .rl-player.out { background: #2a2a34; color: #888; text-decoration: line-through; }
      .rl-player.finished { background: #2f8f4e; }
      .rl-timer { font: 800 clamp(15px, calc(var(--u) * 4.4), 28px)/1 ui-monospace, monospace; color: #fff; text-shadow: 0 2px 8px #000; }
      .rl-timer.low { color: #ff5c5c; }
      .rl-top { position: absolute; left: 50%; top: calc(var(--u) * 1.6); transform: translateX(-50%); pointer-events: none;
                display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 1); max-width: 56%; }
      .rl-light { padding: calc(var(--u) * .7) calc(var(--u) * 2); border-radius: 999px; font-weight: 800; letter-spacing: .06em;
                  font-size: clamp(10px, calc(var(--u) * 2.4), 15px); background: rgba(0,0,0,.55); color: #fff;
                  transition: background .15s; white-space: nowrap; }
      .rl-light.green { background: rgba(31,140,80,.85); }
      .rl-light.red { background: rgba(200,30,50,.9); }
      .rl-edge { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 0 rgba(255,0,40,0);
                 transition: box-shadow .2s; }
      .rl-edge.on { box-shadow: inset 0 0 calc(var(--u) * 8) calc(var(--u) * 2) rgba(255,0,40,.45); }
      .rl-chant { text-align: center; text-shadow: 0 2px 6px #000; white-space: nowrap; }
      .rl-chant .ko { font-size: clamp(14px, calc(var(--u) * 4.6), 30px); font-weight: 800; letter-spacing: .06em; }
      .rl-chant .ro { font-size: clamp(10px, calc(var(--u) * 2), 14px); color: #ddd; margin-top: 2px; }
      .rl.short .rl-chant .ro { display: none; } /* short screens: just the Korean line */
      .rl-chant span { opacity: .25; transition: opacity .08s; }
      .rl-chant span.on { opacity: 1; color: #ffe08a; }
      .rl-msg { position: absolute; left: 50%; top: 24%; transform: translateX(-50%); width: min(90%, 640px); text-align: center;
                pointer-events: none; font-size: clamp(12px, calc(var(--u) * 3.2), 18px); text-shadow: 0 2px 6px #000; white-space: pre-line; }
      .rl-msg.bad { color: #ff5c5c; } .rl-msg.good { color: #3ddc84; }
      .rl-count { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none;
                  font-size: clamp(36px, calc(var(--u) * 15), 96px); font-weight: 900; color: #ffcc33; text-shadow: 0 4px 20px #000; }
      .rl-lobby { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
                  background: rgba(5,6,14,.72); z-index: 2; overflow: auto; }
      .rl-card { background: var(--panel); border-radius: 14px; padding: 22px; width: min(92%, 400px); max-height: 96%;
                 overflow: auto; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 10px 40px #000; }
      .rl-card h2 { margin: 0; color: #ff3b5c; }
      .rl-card label { font-size: .85rem; color: var(--muted); }
      .rl-card input, .rl-card select { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid #444;
                 background: #14141f; color: var(--text); width: 100%; }
      .rl-card button.alt { background: #3a3a55; color: var(--text); }
      .rl-card button:disabled { opacity: .4; cursor: default; }
      .rl-help { font-size: .82rem; color: var(--muted); line-height: 1.5; }
      .rl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
      .rl-list li { background: #14141f; padding: 6px 10px; border-radius: 6px; }
      .rl-check { display: flex; align-items: flex-start; gap: 10px; font-size: .88rem; color: var(--text) !important; cursor: pointer; }
      .rl-card .rl-check input { width: 18px; height: 18px; flex: none; margin-top: 2px; accent-color: #ff3b5c; }
    `;
    document.head.appendChild(style);

    // ---------- DOM ----------
    const wrap = el("div", "rl");
    const hud = el("div", "rl-hud");
    const playersEl = el("div", "rl-players");
    const timerEl = el("div", "rl-timer");
    hud.append(timerEl, playersEl); // timer on the left: the top right is where the full screen button sits
    const lightEl = el("div", "rl-light", "");
    lightEl.hidden = true;
    const edgeEl = el("div", "rl-edge");
    const chantEl = el("div", "rl-chant");
    const koLine = el("div", "ko");
    const roLine = el("div", "ro");
    const koSpans = KO.map((s, i) => { const sp = el("span", "", s + (WORD_END.includes(i) ? " " : "")); koLine.append(sp); return sp; });
    const roSpans = ROMA.map((s, i) => { const sp = el("span", "", s + (i < 9 ? (WORD_END.includes(i) ? "  " : "-") : "")); roLine.append(sp); return sp; });
    chantEl.append(koLine, roLine);
    chantEl.hidden = true;
    const msg = el("div", "rl-msg", "");
    const countEl = el("div", "rl-count", "");
    const lobby = el("div", "rl-lobby");

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const topEl = el("div", "rl-top"); // the light, then the chant under it
    topEl.append(lightEl, chantEl);
    wrap.append(renderer.domElement, edgeEl, hud, topEl, msg, countEl);
    container.append(wrap);
    const input = Input.create(wrap); // joystick + PUSH (the jump button is hidden by the CSS above)
    wrap.append(lobby);
    input.showTouch(false);

    // ---------- scene ----------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa9d8f5);
    scene.fog = new THREE.Fog(0xbfe3f7, 110, 260);
    const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 400);

    function resize() {
      const w = wrap.clientWidth || 800;
      const portrait = window.innerHeight > window.innerWidth;
      const full = document.body.classList.contains("gos-fs");
      const h = full ? Math.max(300, container.clientHeight)
        : Math.max(380, Math.round(portrait ? window.innerHeight - 190 : Math.min(w * 0.6, window.innerHeight - 160)));
      renderer.setSize(w, h);
      wrap.style.setProperty("--u", (Math.min(h, w * 0.75) / 100).toFixed(2) + "px"); // narrow screens size by width
      wrap.classList.toggle("short", h < 480);
      wrap.classList.toggle("tall", h > w * 1.1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x9a7b55, 0.75));
    const sun = new THREE.DirectionalLight(0xfff3e0, 0.85);
    sun.position.set(-20, 40, 15);
    scene.add(sun);

    function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      draw(c.getContext("2d"), w, h);
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      if (repeatX !== 1 || repeatY !== 1) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeatX, repeatY);
      }
      t.anisotropy = 4;
      return t;
    }

    // ground: packed sand
    const groundTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#d8bd8a"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const v = Math.floor(rand(-28, 22));
        g.fillStyle = `rgb(${216 + v},${189 + v},${138 + v})`;
        g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3));
      }
    }, 14, 52);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, FRONT_Z - BACK_Z),
      new THREE.MeshLambertMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, (FRONT_Z + BACK_Z) / 2);
    scene.add(ground);

    // painted walls: an original mural of sky, clouds and hills
    const muralTex = (seed) => canvasTex(1024, 384, (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#5fb2ec"); sky.addColorStop(0.75, "#b9e2fa"); sky.addColorStop(1, "#d8f0ff");
      g.fillStyle = sky; g.fillRect(0, 0, w, h);
      let r = seed;
      const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
      g.fillStyle = "rgba(255,255,255,.92)";
      for (let i = 0; i < 9; i++) {
        const x = rnd() * w, y = 30 + rnd() * h * 0.45, s = 30 + rnd() * 40;
        for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x + k * s * 0.55, y + Math.sin(k * 2) * 6, s * 0.6, s * 0.38, 0, 0, Math.PI * 2); g.fill(); }
      }
      g.fillStyle = "#7fbf6a";
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.82 - Math.sin(x / 90 + seed) * 22 - Math.sin(x / 37) * 6);
      g.lineTo(w, h); g.fill();
      g.fillStyle = "#5ea552";
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.9 - Math.sin(x / 60 + seed * 2) * 14);
      g.lineTo(w, h); g.fill();
    });
    const sideMat = new THREE.MeshLambertMaterial({ map: muralTex(3) });
    sideMat.map.wrapS = THREE.RepeatWrapping;
    sideMat.map.repeat.set(4, 1);
    const endMat = new THREE.MeshLambertMaterial({ map: muralTex(7) });
    const wallLen = FRONT_Z - BACK_Z;
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(wallLen, WALL_H), sideMat);
      w.position.set(s * WALL_X, WALL_H / 2, (FRONT_Z + BACK_Z) / 2);
      w.rotation.y = -s * Math.PI / 2;
      scene.add(w);
    }
    for (const [z, ry] of [[BACK_Z, 0], [FRONT_Z, Math.PI]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, WALL_H), endMat);
      w.position.set(0, WALL_H / 2, z);
      w.rotation.y = ry;
      scene.add(w);
    }
    // a dark trim along the top of the walls
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x2b3240 });
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, wallLen), trimMat);
      t.position.set(s * (WALL_X - 0.3), WALL_H, (FRONT_Z + BACK_Z) / 2);
      scene.add(t);
    }

    // start and finish lines
    const lineMat = (c) => new THREE.MeshBasicMaterial({ color: c });
    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_HALF * 2 + 2, 0.35), lineMat(0xffffff));
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(0, 0.02, START_Z);
    scene.add(startLine);
    const finishLine = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_HALF * 2 + 2, 0.5), lineMat(0xd21f3c));
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.position.set(0, 0.02, FINISH_Z);
    scene.add(finishLine);

    // the big clock above the far wall
    let boardShown = "";
    const boardCanvas = document.createElement("canvas");
    boardCanvas.width = 512; boardCanvas.height = 160;
    const boardTex = new THREE.CanvasTexture(boardCanvas);
    boardTex.encoding = THREE.sRGBEncoding;
    function drawBoard(text) {
      if (text === boardShown) return;
      boardShown = text;
      const g = boardCanvas.getContext("2d");
      g.fillStyle = "#0b0b10"; g.fillRect(0, 0, 512, 160);
      g.strokeStyle = "#333"; g.lineWidth = 8; g.strokeRect(4, 4, 504, 152);
      g.fillStyle = "#ff2a3a"; g.shadowColor = "#ff2a3a"; g.shadowBlur = 18;
      g.font = "bold 118px ui-monospace, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text, 256, 86);
      g.shadowBlur = 0;
      boardTex.needsUpdate = true;
    }
    drawBoard(clockText(TIME_LIMIT));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.75), new THREE.MeshBasicMaterial({ map: boardTex }));
    board.position.set(0, BOARD_Y, BACK_Z + 0.3);
    scene.add(board);
    const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(12.6, 4.3, 0.4), trimMat);
    boardFrame.position.set(0, BOARD_Y, BACK_Z + 0.05);
    for (const s of [-1, 1]) { // posts holding the clock up
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, BOARD_Y - WALL_H, 0.5), trimMat);
      post.position.set(s * 5, (BOARD_Y + WALL_H) / 2 - 1, BACK_Z + 0.2);
      scene.add(post);
    }
    scene.add(boardFrame);

    // the tree behind the doll (original: a round, leafy tree)
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 9, 10), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    trunk.position.y = 4.5;
    tree.add(trunk);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x4e9a45, flatShading: true });
    [[0, 11, 0, 5], [-3.6, 9.4, 0.6, 3.6], [3.4, 9.8, -0.4, 3.8], [0.6, 13.6, -0.8, 3.4], [-1.8, 12.6, 2, 3]].forEach(([x, y, z, r]) => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
      b.position.set(x, y, z);
      tree.add(b);
    });
    tree.position.set(0, 0, TREE_Z);
    tree.scale.setScalar(1.6);
    scene.add(tree);

    // ---------- the doll (original design, built from simple shapes) ----------
    // Front faces +Z (toward the players) at angle 0; angle PI = facing the tree.
    const doll = new THREE.Group();
    const dollBody = new THREE.Group();
    doll.add(dollBody);
    const porcelain = new THREE.MeshLambertMaterial({ color: 0xf7e9de });
    const dressMat = new THREE.MeshLambertMaterial({ color: 0x17807f });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf6f6f2 });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1d1d22 });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x3a2418 });
    const redMat = new THREE.MeshLambertMaterial({ color: 0xc8202f });
    const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    for (const s of [-1, 1]) {
      add(dollBody, new THREE.BoxGeometry(0.9, 0.55, 1.5), shoeMat, s * 0.7, 0.28, 0.2);
      add(dollBody, new THREE.CylinderGeometry(0.4, 0.38, 1.6, 14), whiteMat, s * 0.7, 1.35, 0);
      add(dollBody, new THREE.CylinderGeometry(0.38, 0.4, 1.4, 14), porcelain, s * 0.7, 2.8, 0);
    }
    add(dollBody, new THREE.CylinderGeometry(1.4, 2.7, 2.7, 28), dressMat, 0, 4.55, 0);
    add(dollBody, new THREE.CylinderGeometry(2.72, 2.75, 0.3, 28), whiteMat, 0, 3.3, 0); // hem
    add(dollBody, new THREE.CylinderGeometry(1.25, 1.42, 2.1, 24), dressMat, 0, 6.9, 0);
    add(dollBody, new THREE.CylinderGeometry(1.6, 1.6, 0.28, 24), whiteMat, 0, 7.85, 0); // collar
    // bow on the collar
    const bow = new THREE.Group();
    add(bow, new THREE.SphereGeometry(0.22, 12, 10), redMat, 0, 0, 0);
    for (const s of [-1, 1]) {
      const wing = add(bow, new THREE.ConeGeometry(0.42, 0.8, 4), redMat, s * 0.42, 0, 0);
      wing.rotation.z = s * Math.PI / 2;
    }
    bow.position.set(0, 7.65, 1.5);
    dollBody.add(bow);
    // arms hang at the sides
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 1.5, 7.55, 0);
      add(arm, new THREE.SphereGeometry(0.55, 14, 10), dressMat, 0, 0, 0); // puffed sleeve
      add(arm, new THREE.CylinderGeometry(0.28, 0.26, 2.3, 12), porcelain, 0, -1.3, 0);
      add(arm, new THREE.SphereGeometry(0.33, 12, 10), porcelain, 0, -2.5, 0);
      arm.rotation.z = s * 0.14;
      dollBody.add(arm);
    }
    add(dollBody, new THREE.CylinderGeometry(0.45, 0.5, 0.6, 14), porcelain, 0, 8.2, 0); // neck
    // head (turns a little ahead of the body)
    const head = new THREE.Group();
    head.position.set(0, 9.85, 0);
    doll.add(head);
    add(head, new THREE.SphereGeometry(1.75, 32, 24), porcelain, 0, 0, 0);
    const hairCap = add(head, new THREE.SphereGeometry(1.86, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat, 0, 0.05, -0.12);
    hairCap.rotation.x = -0.42;
    add(head, new THREE.SphereGeometry(0.95, 20, 16), hairMat, 0, 1.85, -0.55); // top bun
    const tie = add(head, new THREE.TorusGeometry(0.62, 0.13, 8, 20), redMat, 0, 1.35, -0.42);
    tie.rotation.x = Math.PI / 2 - 0.3;
    const eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.6, 0.12, 1.5);
      const white = add(eye, new THREE.SphereGeometry(0.42, 18, 14), whiteMat, 0, 0, 0);
      white.scale.z = 0.5;
      const iris = add(eye, new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshLambertMaterial({ color: 0x2a1d17 }), 0, 0, 0.12);
      iris.scale.z = 0.5;
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
      const pupil = add(eye, new THREE.SphereGeometry(0.14, 12, 10), glowMat, 0, 0, 0.24);
      add(eye, new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.1, 0.1, 0.27); // shine
      head.add(eye);
      eyes.push({ iris, pupil, glowMat });
      const cheek = add(head, new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0xf2a1a8, transparent: true, opacity: 0.75 }), s * 1.0, -0.5, 1.5);
      cheek.rotation.y = s * 0.55;
    }
    add(head, new THREE.BoxGeometry(0.42, 0.09, 0.1), redMat, 0, -0.78, 1.66); // mouth
    // the eyes' red scanning beam (only while she watches)
    const BEAM_LEN = 130;
    const beamGeo = new THREE.ConeGeometry(7, BEAM_LEN, 24, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, BEAM_LEN / 2);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xff1a30, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    beam.position.set(0, 0.12, 1.6);
    beam.rotation.x = 0.1;
    beam.visible = false;
    head.add(beam);
    doll.position.set(0, 0, DOLL_Z);
    doll.scale.setScalar(DOLL_SIZE);
    scene.add(doll);

    let dollAngle = 0; // 0 = looking at the players
    let headAngle = 0;
    function setDoll(bodyA, headA) {
      dollAngle = bodyA;
      headAngle = headA;
      dollBody.rotation.y = bodyA;
      head.rotation.y = headA;
    }
    function setEyes(on) {
      eyes.forEach((e) => e.glowMat.color.set(on ? 0xff1a30 : 0x050505));
      beam.visible = on;
      edgeEl.classList.toggle("on", on);
    }

    // ---------- sound (all made in code, original) ----------
    let actx = null;
    let master = null;
    function audio() {
      if (!actx) {
        try {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          master = actx.createGain();
          master.gain.value = 0.9;
          master.connect(actx.destination);
        } catch { actx = null; }
      }
      if (actx && actx.state === "suspended") actx.resume();
      return actx;
    }
    ["pointerdown", "keydown", "touchstart"].forEach((ev) => wrap.addEventListener(ev, audio, { passive: true }));
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function tone(freq, dur = 0.25, vol = 0.15, type = "sine", when = 0) {
      const a = audio(); if (!a) return;
      const t = a.currentTime + when;
      const o = a.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = a.createGain(); env(g, t, 0.01, vol, dur);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol, filterType, freq, when = 0) {
      const a = audio(); if (!a) return;
      const t = a.currentTime + when;
      const len = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource(); src.buffer = buf;
      const f = a.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
      const g = a.createGain(); env(g, t, 0.005, vol, dur);
      src.connect(f).connect(g).connect(master);
      src.start(t);
    }
    // the doll's singing voice: a buzzy tone shaped into vowels (two formant filters)
    const FORMANTS = { a: [850, 1350], i: [330, 2500], u: [370, 900], o: [500, 950], eo: [620, 1150], eu: [380, 1550] };
    function sing(i, dur, base) {
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      const f0 = base * Math.pow(2, MELODY[i] / 12);
      const o = a.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(f0 * 1.03, t);
      o.frequency.exponentialRampToValueAtTime(f0, t + 0.06);
      if (i === 9) o.frequency.exponentialRampToValueAtTime(f0 * 0.94, t + dur);
      const vib = a.createOscillator(); vib.frequency.value = 5.6;
      const vibAmt = a.createGain(); vibAmt.gain.value = f0 * 0.012;
      vib.connect(vibAmt).connect(o.frequency);
      const out = a.createGain(); env(out, t, 0.025, 0.33, Math.max(0.08, dur * 0.92));
      const [f1, f2] = FORMANTS[VOWEL[i]].map((f) => f * 1.18); // a child's voice: higher formants
      for (const [f, q, v] of [[f1, 6, 1], [f2, 9, 0.6]]) {
        const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q;
        const g = a.createGain(); g.gain.value = v;
        o.connect(bp).connect(g).connect(out);
      }
      out.connect(master);
      o.start(t); vib.start(t);
      o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
    }
    function whirSound(dur) { // the doll turning: a heavy motor
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      const o = a.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(55, t);
      o.frequency.linearRampToValueAtTime(110, t + dur * 0.6);
      o.frequency.linearRampToValueAtTime(70, t + dur);
      const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 420;
      const g = a.createGain(); env(g, t, 0.05, 0.28, dur);
      o.connect(f).connect(g).connect(master);
      o.start(t); o.stop(t + dur + 0.1);
      noise(dur * 0.8, 0.05, "bandpass", 1800);
    }
    function lockOnSound() { tone(1320, 0.12, 0.09, "square"); tone(1760, 0.18, 0.08, "square", 0.1); }
    function scanTick() { tone(2400, 0.05, 0.025, "sine"); }
    function shotSound() { // crossbow: a twang and a whoosh
      tone(190, 0.28, 0.22, "triangle"); tone(95, 0.2, 0.16, "sawtooth");
      noise(0.18, 0.12, "highpass", 2500, 0.02);
    }
    function hitSound() { tone(80, 0.25, 0.28, "sine"); noise(0.12, 0.12, "lowpass", 600); }
    function buzzer() { tone(110, 0.9, 0.14, "square"); tone(116, 0.9, 0.1, "square"); }

    // music box tune (original) for the countdown and the end
    const BOX = [[76, 1], [79, 1], [84, 2], [83, 1], [79, 1], [76, 2], [74, 1], [76, 1], [79, 1], [77, 1], [74, 2], [72, 2],
      [76, 1], [79, 1], [84, 2], [86, 1], [84, 1], [83, 2], [79, 1], [77, 1], [76, 1], [74, 1], [72, 4]];
    let boxTimer = null;
    function musicBox(on, beat = 0.24) {
      clearTimeout(boxTimer);
      boxTimer = null;
      if (!on) return;
      let k = 0;
      const step = () => {
        const [n, len] = BOX[k % BOX.length];
        const f = 440 * Math.pow(2, (n - 69) / 12);
        tone(f, 1.2, 0.06, "triangle");
        tone(f * 2, 0.5, 0.015, "sine");
        if (k % 4 === 0) tone(f / 2, 0.9, 0.03, "sine");
        k++;
        boxTimer = setTimeout(step, len * beat * 1000);
      };
      step();
    }
    function announce(text) { // "Player 067, eliminated." (uses the device's own voice, if it has one)
      try {
        if (!window.speechSynthesis) return;
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95; u.pitch = 0.75; u.volume = 0.8; u.lang = "en-US";
        window.speechSynthesis.speak(u);
      } catch {}
    }

    // ---------- the doll's game: sing, turn, watch, turn back ----------
    // phase: "idle" | "pre" (facing players before GO) | "away" (turning to the tree) | "sing"
    //        | "turn" (spinning to look) | "watch" | "over"
    let phase = "idle";
    let phaseT = 0;
    let phaseLen = 0;
    let chant = null; // { times: [...], lens: [...], base, kind }
    let sungUpTo = -1;
    let scanT = 0;

    function makeChant() {
      const r = Math.random();
      let unit, kind, times = [], lens = [];
      if (r < 0.42) { kind = "normal"; unit = rand(0.36, 0.46); }
      else if (r < 0.62) { kind = "fast"; unit = rand(0.15, 0.2); }
      else if (r < 0.78) { kind = "slow"; unit = rand(0.55, 0.68); }
      else kind = "slowfast";
      let t = 0;
      for (let i = 0; i < 10; i++) {
        let u = unit;
        if (kind === "slowfast") u = i < 7 ? 0.56 : 0.15;
        if (WORD_END.includes(i - 1) && kind !== "fast") t += u * 0.35; // little breath between words
        times.push(t);
        const len = i === 9 ? u * 1.7 : u * 0.92;
        lens.push(len);
        t += u;
      }
      return { times, lens, kind, base: rand(500, 560), total: times[9] + lens[9] };
    }

    function setPhase(p, len = 0) {
      phase = p;
      phaseT = 0;
      phaseLen = len;
      setEyes(p === "watch");
      if (p === "sing") {
        chant = makeChant();
        sungUpTo = -1;
        chantEl.hidden = false;
        koSpans.forEach((s) => s.classList.remove("on"));
        roSpans.forEach((s) => s.classList.remove("on"));
      }
      if (p === "turn") whirSound(TURN_TO);
      if (p === "away") whirSound(TURN_AWAY);
      if (p === "watch") lockOnSound();
      renderLight();
    }

    function renderLight() {
      const green = phase === "away" || phase === "sing";
      const red = phase === "turn" || phase === "watch";
      lightEl.hidden = !(green || red);
      lightEl.className = "rl-light" + (green ? " green" : red ? " red" : "");
      lightEl.textContent = green ? "🟢 GREEN LIGHT · MOVE" : red ? "🔴 RED LIGHT · FREEZE" : "";
    }

    function updateDoll(dt) {
      phaseT += dt;
      if (phase === "away") { // turning her back to the players
        const t = clamp(phaseT / TURN_AWAY, 0, 1);
        setDoll(Math.PI * smooth(t), Math.PI * smooth(Math.min(1, t * 1.3)));
        if (t >= 1) setPhase("sing");
      } else if (phase === "sing") {
        while (sungUpTo < 9 && phaseT >= chant.times[sungUpTo + 1]) {
          sungUpTo++;
          sing(sungUpTo, chant.lens[sungUpTo], chant.base);
          koSpans[sungUpTo].classList.add("on");
          roSpans[sungUpTo].classList.add("on");
        }
        if (phaseT >= chant.total + 0.05) setPhase("turn", TURN_TO);
      } else if (phase === "turn") { // spinning around: the head snaps first
        const t = clamp(phaseT / TURN_TO, 0, 1);
        setDoll(Math.PI * (1 - smooth(t)), Math.PI * (1 - smooth(Math.min(1, t * 1.5))));
        if (t >= 1) { setPhase("watch", rand(WATCH[0], WATCH[1])); chantEl.hidden = true; }
      } else if (phase === "watch") {
        // eyes and beam sweep across the field
        const s = Math.sin(phaseT * 2.4);
        eyes.forEach((e) => { e.iris.position.x = s * 0.1; e.pupil.position.x = s * 0.1; });
        beam.rotation.y = s * 0.28;
        scanT -= dt;
        if (scanT <= 0) { scanT = 0.42; scanTick(); }
        if (phaseT >= phaseLen) {
          eyes.forEach((e) => { e.iris.position.x = 0; e.pupil.position.x = 0; });
          setPhase("away", TURN_AWAY);
        }
      }
    }
    const judging = () => phase === "watch" && phaseT > GRACE;

    // Can she see p? Not if another standing player blocks both her view of p's head and chest.
    const EYE = new THREE.Vector3(0, 0.12, 1.6); // between her eyes, in head space
    const eyeW = new THREE.Vector3();
    function seen(p) {
      head.updateWorldMatrix(true, false);
      eyeW.copy(EYE);
      head.localToWorld(eyeW);
      const P = p.mesh.position;
      return [1.7, 1.1].some((y) => !blocked(eyeW, P.x, y, P.z, p));
    }
    function blocked(E, tx, ty, tz, target) {
      const dx = tx - E.x, dz = tz - E.z, len2 = dx * dx + dz * dz;
      for (const q of order) {
        if (q === target || q.dead) continue;
        const Q = q.mesh.position;
        const t = ((Q.x - E.x) * dx + (Q.z - E.z) * dz) / len2; // where along the sight line q stands
        if (t <= 0 || t >= 1) continue;
        const cx = E.x + dx * t - Q.x, cz = E.z + dz * t - Q.z;
        if (cx * cx + cz * cz > (BODY_R + 0.05) ** 2) continue;
        const y = E.y + (ty - E.y) * t; // height of the sight line as it passes q
        if (y < 1.95) return true;
      }
      return false;
    }

    // ---------- snipers: skeletons with crossbows on ledges along the walls ----------
    const SNIPER_SPOTS = [-12, -40, -68, -96].flatMap((z) => [[-1, z], [1, z]]);
    const SNIPER_CHARS = ["skeleton-rogue", "skeleton-warrior", "skeleton-minion", "skeleton-mage"];
    const LEDGE_Y = 6.5;
    const snipers = [];
    const ledgeMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4d });
    SNIPER_SPOTS.forEach(([s, z]) => {
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 3), ledgeMat);
      ledge.position.set(s * (WALL_X - 1.3), LEDGE_Y - 0.25, z);
      scene.add(ledge);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 3), ledgeMat);
      rail.position.set(s * (WALL_X - 2.55), LEDGE_Y + 0.4, z);
      scene.add(rail);
    });

    function spawnSnipers() {
      snipers.forEach((sn) => scene.remove(sn.root));
      snipers.length = 0;
      SNIPER_SPOTS.forEach(([s, z], i) => {
        const kk = Models.spawn(SNIPER_CHARS[i % SNIPER_CHARS.length]);
        let root;
        if (kk) {
          root = kk.root;
          kk.hold("Skeleton_Crossbow", "right", { turn: [0, 90, 0] });
          kk.play("Ranged_2H_Aiming", { fade: 0 });
        } else {
          root = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), new THREE.MeshLambertMaterial({ color: 0xe8e2d0 }));
          root.position.y = 0.9;
          const g = new THREE.Group(); g.add(root); root = g;
        }
        root.position.set(s * (WALL_X - 1.5), LEDGE_Y, z);
        const rest = faceAngle(-s, 0.25); // look out across the field, a little toward the start
        root.rotation.y = rest;
        scene.add(root);
        snipers.push({ kk, root, rest, aim: rest, busy: 0 });
      });
    }

    const bolts = []; // flying and stuck crossbow bolts
    const tmpV = new THREE.Vector3();
    const DOWN = new THREE.Vector3(0, -1, 0); // the bolt models point their tip down (-Y)
    // Snipers always go for the head. The aim point is the middle of the head, worked out from the head bone.
    const HEAD_UP = 0.22; // from the head bone (base of the skull) up to the middle of the head
    const tmpQ = new THREE.Quaternion();
    function headBone(p) {
      const kk = p.mesh.userData.kk;
      return kk ? kk.bone("head") : null;
    }
    function headOf(p) {
      const bone = headBone(p);
      if (!bone) return p.mesh.position.clone().add(new THREE.Vector3(0, 1.75, 0));
      const v = bone.getWorldPosition(new THREE.Vector3());
      bone.getWorldQuaternion(tmpQ);
      return v.add(new THREE.Vector3(0, HEAD_UP, 0).applyQuaternion(tmpQ));
    }
    function fire(p) {
      // the nearest sniper takes the shot
      let best = null, bd = Infinity;
      snipers.forEach((sn) => {
        const d = sn.root.position.distanceTo(p.mesh.position) + (sn.busy > 0 ? 40 : 0);
        if (d < bd) { bd = d; best = sn; }
      });
      if (!best) return hit(p);
      const sn = best;
      sn.target = p;
      sn.busy = 1.6;
      later(() => {
        if (!sn.kk) { shotSound(); return launchBolt(sn.root.position.clone().add(new THREE.Vector3(0, 1.4, 0)), p); }
        sn.kk.play("Ranged_2H_Shoot", { once: true, fade: 0.05 });
        later(() => {
          shotSound();
          const bow = sn.kk.held("right");
          const from = bow ? bow.getWorldPosition(new THREE.Vector3()) : sn.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
          launchBolt(from, p);
        }, 120);
        later(() => sn.kk && sn.kk.play("Ranged_2H_Aiming", { fade: 0.2 }), 900);
      }, rand(250, 550));
    }
    function launchBolt(from, p) {
      const obj = Models.prop("Skeleton_Arrow") || new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0x5a4030 }));
      obj.scale.multiplyScalar(1.6);
      scene.add(obj);
      bolts.push({ obj, from: from.clone(), p, t: 0, dur: Math.max(0.12, from.distanceTo(p.mesh.position) / 70), stuck: false });
    }
    function updateBolts(dt) {
      for (const b of bolts) {
        if (b.stuck) { // stays stuck in the head as the body falls
          const bone = headBone(b.p);
          if (bone) {
            bone.getWorldPosition(b.obj.position);
            bone.getWorldQuaternion(tmpQ);
            b.obj.position.add(tmpV.copy(b.relPos).applyQuaternion(tmpQ));
            b.obj.quaternion.copy(tmpQ).multiply(b.relRot);
          }
          continue;
        }
        b.t += dt;
        const to = headOf(b.p);
        const k = Math.min(1, b.t / b.dur);
        tmpV.subVectors(to, b.from).normalize();
        b.obj.quaternion.setFromUnitVectors(DOWN, tmpV);
        // the bolt's middle stops short of the target, so its tip sinks into the head
        b.obj.position.lerpVectors(b.from, to, k).addScaledVector(tmpV, -0.3 * k);
        if (k >= 1) {
          b.stuck = true;
          const bone = headBone(b.p);
          if (bone) { // remember where it sits relative to the head
            const bp = bone.getWorldPosition(new THREE.Vector3());
            bone.getWorldQuaternion(tmpQ);
            const inv = tmpQ.clone().invert();
            b.relPos = b.obj.position.clone().sub(bp).applyQuaternion(inv);
            b.relRot = inv.multiply(b.obj.quaternion);
          }
          hit(b.p);
        }
      }
    }

    // ---------- players ----------
    let order = []; // { id, name, num, char, mesh, vel, out, finished, dead, ... }
    let started = false;
    let done = false;
    let countdown = 0;
    let clockLeft = TIME_LIMIT;
    let mode = "lobby";
    let myId = "solo";
    const me = () => order.find((p) => p.id === myId);

    function textTexture(text, w, h, bg, fg, font) {
      return canvasTex(w, h, (g) => {
        if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
        g.fillStyle = fg; g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
        if (!bg) { g.shadowColor = "#000"; g.shadowBlur = 8; }
        g.fillText(text, w / 2, h / 2 + 2);
      });
    }
    const blobGeo = new THREE.CircleGeometry(0.55, 20);
    const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });

    function makePlayerMesh(p, mine) {
      const g = new THREE.Group();
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.015;
      blob.userData.own = true;
      g.add(blob);
      const kk = Models.spawn(p.char);
      if (kk) {
        g.add(kk.root);
        if (kk.info.id === "tracksuit") { // number patch on the back (like the show's tracksuits)
          const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18),
            new THREE.MeshBasicMaterial({ map: textTexture(p.num, 128, 64, "#f4f4f4", "#111", "bold 44px sans-serif") }));
          patch.userData.own = true;
          g.add(patch);
          g.updateMatrixWorld(true);
          const chest = kk.bone("chest");
          const cp = new THREE.Vector3(0, 1.2, 0);
          if (chest) chest.getWorldPosition(cp);
          patch.position.set(0, cp.y + 0.02, 0.17);
          g.updateMatrixWorld(true);
          if (chest) chest.attach(patch);
        }
        g.userData.kk = kk;
      } else {
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 4, 10), new THREE.MeshLambertMaterial({ color: 0x14513f }));
        body.position.y = 0.9;
        body.userData.own = true;
        g.add(body);
        g.userData.body = body;
      }
      const name = mode === "online" ? p.name : p.num;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textTexture(name, 256, 64, null, mine ? "#ffcc33" : "#ffffff", "bold 34px sans-serif"), depthTest: false, transparent: true,
      }));
      tag.userData.own = true;
      tag.scale.set(1.4, 0.35, 1);
      tag.position.y = 2.75;
      g.add(tag);
      g.userData.tag = tag;
      scene.add(g);
      return g;
    }

    function addPlayer(r, k, n) {
      const p = { ...r, vel: new THREE.Vector3(), knock: new THREE.Vector3(), out: false, dead: false, finished: false,
        speed: 0, pushT: 0, hitT: 0, lastPush: -9, knocked: {} };
      p.mesh = makePlayerMesh(p, r.id === myId);
      const spread = Math.min(3, (FIELD_HALF * 2 - 6) / Math.max(1, n));
      p.mesh.position.set((k - (n - 1) / 2) * spread, 0, START_Z + 2.2);
      if (r.dummy) { const i = +r.id.slice(5); p.mesh.position.set(-3 + i * 2, 0, START_Z - 4 - (i % 2) * 3); }
      return p;
    }

    function animate(p, dt) {
      const kk = p.mesh.userData.kk;
      if (!kk) {
        if (p.dead) p.mesh.userData.body.rotation.x = Math.min(Math.PI / 2, p.mesh.userData.body.rotation.x + dt * 6);
        return;
      }
      if (p.dead) kk.play("Death_A", { once: true, fade: 0.08 });
      else if (p.pushT > 0) kk.play("Melee_Block_Attack", { once: true, speed: 1.6, fade: 0.05 }); // two-handed shove
      else if (p.hitT > 0) kk.play("Hit_A", { once: true, fade: 0.05 });
      else if (p.finished) kk.play("Cheering");
      else if (p.speed > 2.2) kk.play("Running_A", { speed: clamp(p.speed / 3.4, 0.7, 1.9) });
      else if (p.speed > 0.25) kk.play("Walking_A", { speed: clamp(p.speed / 1.5, 0.6, 1.4) });
      else kk.play("Idle_A");
      kk.update(dt);
      p.pushT -= dt;
      p.hitT -= dt;
    }

    // sprint: double-tap a direction and hold it (keyboard, stick or phone joystick)
    const tap = { held: false, downAt: -9, upAt: -9, dir: null, sprint: false };
    function readMove() {
      const mv = input.move();
      const len = Math.hypot(mv.x, mv.y);
      const held = len > 0.5;
      if (held && !tap.held) {
        const dir = { x: mv.x / len, y: mv.y / len };
        const quick = time - tap.upAt < TAP_GAP && tap.upAt - tap.downAt < TAP_GAP;
        const same = !!tap.dir && dir.x * tap.dir.x + dir.y * tap.dir.y > 0.7;
        tap.sprint = quick && same;
        tap.downAt = time;
        tap.dir = dir;
      } else if (!held && tap.held) {
        tap.upAt = time;
        tap.sprint = false;
      }
      tap.held = held;
      return { mv, len, sprint: tap.sprint && held };
    }

    const live = (p) => started && !done && countdown <= 0 && !p.out && !p.finished;

    // Move one player that this device is in charge of (you, or a practice dummy).
    function stepBody(p, dt, mine) {
      const ok = live(p);
      const { mv, len, sprint } = ok && mine ? readMove() : { mv: { x: 0, y: 0 }, len: 0, sprint: false };
      if (sprint) p.fromSprint = true;
      else if (len > 0.05) p.fromSprint = false;
      const want = new THREE.Vector3(mv.x, 0, -mv.y).multiplyScalar(sprint ? SPRINT_SPEED : SPEED);
      const rate = len > 0.05 ? 10 : p.fromSprint ? SPRINT_STOP_RATE : STOP_RATE;
      p.vel.lerp(want, 1 - Math.exp(-dt * rate));
      if (p.vel.lengthSq() < 0.0004) { p.vel.set(0, 0, 0); p.fromSprint = false; }
      // getting shoved: slide the exact distance for this frame, so the slide is the same at any frame rate
      const kd = p.knockDecay || KNOCK_DECAY, kf = Math.exp(-dt * kd);
      const P = p.mesh.position;
      P.addScaledVector(p.vel, dt).addScaledVector(p.knock, (1 - kf) / kd);
      p.knock.multiplyScalar(kf);
      if (p.knock.lengthSq() < 0.0004) p.knock.set(0, 0, 0);
      collide(p);
      P.x = clamp(P.x, -FIELD_HALF, FIELD_HALF);
      P.z = clamp(P.z, BACK_Z + 26, FRONT_Z - 3);
      const mx = p.vel.x + p.knock.x, mz = p.vel.z + p.knock.z;
      p.speed = Math.hypot(mx, mz);
      const run = Math.hypot(p.vel.x, p.vel.z);
      if (run > 0.3) p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, faceAngle(p.vel.x, p.vel.z), dt * 12);
      if (mine && ok && input.push() && time - p.lastPush > PUSH_COOLDOWN) doPush(p);
      if (!ok) return;
      if (judging() && p.speed > MOVE_LIMIT && seen(p)) caught(p);
      else if (P.z < FINISH_Z) finish(p);
    }

    // Bodies don't overlap. Sprinting into someone knocks them forward.
    function collide(p) {
      const P = p.mesh.position;
      for (const q of order) {
        if (q === p || q.dead) continue;
        const Q = q.mesh.position;
        let dx = P.x - Q.x, dz = P.z - Q.z;
        const d = Math.hypot(dx, dz);
        if (d >= BODY_R * 2) continue;
        if (d < 0.001) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        P.x = Q.x + dx * BODY_R * 2;
        P.z = Q.z + dz * BODY_R * 2;
        const into = -(p.vel.x * dx + p.vel.z * dz); // how fast p was heading at q
        const runSpeed = Math.hypot(p.vel.x, p.vel.z);
        if (runSpeed > SPEED * 1.2 && into > 0.5 && time - (p.knocked[q.id] || -9) > 0.6) {
          p.knocked[q.id] = time;
          knock(q, p.vel.x / runSpeed, p.vel.z / runSpeed, SPRINT_KNOCK);
          p.vel.multiplyScalar(0.5); // the bump slows the sprinter down
        }
      }
    }

    // Shove whoever is right in front of you.
    function doPush(p) {
      p.lastPush = time;
      p.pushT = 0.45;
      const fx = -Math.sin(p.mesh.rotation.y), fz = -Math.cos(p.mesh.rotation.y); // facing direction
      let best = null, bd = PUSH_RANGE;
      for (const q of order) {
        if (q === p || q.dead || q.finished) continue;
        const dx = q.mesh.position.x - p.mesh.position.x, dz = q.mesh.position.z - p.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / Math.max(d, 0.001) > Math.cos(Math.PI / 3)) { bd = d; best = q; }
      }
      tone(150, 0.12, 0.08, "triangle");
      if (best) knock(best, fx, fz, PUSH_POWER, PUSH_DECAY);
    }

    function knock(q, dx, dz, power, decay = KNOCK_DECAY) {
      q.knock.x += dx * power;
      q.knock.z += dz * power;
      q.knockDecay = decay;
      q.hitT = 0.55; // stagger
      if (q.knock.lengthSq() > 0.01) q.mesh.rotation.y = faceAngle(q.knock.x, q.knock.z); // stumble the way they're shoved
      noise(0.12, power > 5 ? 0.22 : 0.1, "lowpass", 500);
      tone(power > 5 ? 90 : 120, 0.18, 0.18, "sine");
    }

    // ---------- the match ----------
    function renderPlayers() {
      playersEl.innerHTML = "";
      order.forEach((p) => {
        let cls = "rl-player";
        if (p.out) cls += " out";
        else if (p.finished) cls += " finished";
        const label = mode === "online" ? `${p.num} ${p.name}` : p.num;
        playersEl.append(el("div", cls, (p.finished ? "✓ " : "") + label));
      });
    }
    let lastClock = "";
    function renderTimer() {
      const s = started ? clockText(Math.max(0, Math.ceil(clockLeft))) : "";
      if (s !== lastClock) {
        lastClock = s;
        timerEl.textContent = s ? "⏱ " + s : "";
        timerEl.classList.toggle("low", started && clockLeft <= 30);
        if (s) drawBoard(s);
      }
    }
    function say(text, kind = "") {
      msg.textContent = text;
      msg.className = "rl-msg" + (kind ? " " + kind : "");
    }

    function caught(p) {
      if (p.out || p.finished) return;
      p.out = true;
      p.vel.set(0, 0, 0);
      p.speed = 0;
      renderPlayers();
      if (p.id === myId) say("She saw you move…", "bad");
      fire(p);
    }
    function hit(p) {
      if (p.dead) return;
      p.dead = true;
      hitSound();
      announce(`Player ${p.num}, eliminated.`);
      if (p.id === myId) say(`Player ${p.num}, eliminated.`, "bad");
      later(checkEnd, 1800);
    }
    function finish(p) {
      if (p.finished || p.out) return;
      p.finished = true;
      p.finishLeft = clockLeft;
      renderPlayers();
      if (p.id === myId) {
        say("You made it across! 🎉", "good");
        tone(660, 0.15, 0.12); tone(880, 0.3, 0.12, "sine", 0.15);
      }
      checkEnd();
    }
    function checkEnd() {
      if (done || !started) return;
      if (order.every((p) => p.dummy || p.finished || p.dead)) endMatch();
    }
    function timeUp() {
      setPhase("over");
      setDoll(0, 0);
      setEyes(true);
      chantEl.hidden = true;
      buzzer();
      say("Time's up.", "bad");
      // everyone still on the field is shot
      order.filter((p) => !p.finished && !p.out).forEach((p, k) => later(() => caught(p), 600 + k * 450));
      later(() => { if (!done) endMatch(); }, 600 + order.length * 450 + 2500);
    }
    function endMatch() {
      if (done) return;
      done = true;
      setPhase("over");
      chantEl.hidden = true;
      input.showTouch(false);
      lightEl.hidden = true;
      const m = me();
      if (m && m.finished) {
        const bonus = Math.ceil(m.finishLeft || 0);
        api.addScore(100 + bonus);
        say(`You survived Red Light, Green Light with ${clockText(bonus)} to spare.`, "good");
      } else say("You didn't make it.", "bad");
      later(() => musicBox(true, 0.26), 800);
      later(() => { musicBox(false); api.gameOver(); }, 5200);
    }

    function startMatch(roster) {
      order = roster.map((r, k) => addPlayer(r, k, roster.length));
      spawnSnipers();
      started = true;
      done = false;
      clockLeft = TIME_LIMIT;
      countdown = COUNTDOWN;
      lobby.hidden = true;
      setDoll(0, 0); // she faces you while the clock counts down
      setPhase("pre");
      input.showTouch(true);
      musicBox(true);
      const touch = navigator.maxTouchPoints > 0;
      say((touch ? "Joystick to move · PUSH to shove." : "WASD / arrows to move · F to push") + " · double-tap and hold to sprint" +
        "\nMove only while she sings. Freeze when she turns.");
      renderPlayers();
      renderTimer();
    }

    // load everything the match needs (max ~10s), then start
    function beginMatch(roster) {
      lobby.innerHTML = "";
      const card = el("div", "rl-card");
      card.append(el("h2", "", "Loading…"));
      lobby.append(card);
      lobby.hidden = false;
      const go = () => startMatch(roster);
      if (!Models.available()) return go();
      const need = Promise.allSettled([
        Models.loadAll([...roster.map((r) => r.char), ...SNIPER_CHARS], 10000),
        Models.loadAnims(["ranged", "melee"]),
        Models.loadProps(["Skeleton_Crossbow", "Skeleton_Arrow"]),
      ]);
      Promise.race([need, new Promise((r) => setTimeout(r, 10000))]).then(go);
    }

    // ---------- menu ----------
    let myChar = (() => { try { return Models.byId(localStorage.getItem("gos:char") || "tracksuit").id; } catch { return "tracksuit"; } })();
    if (Models.available()) {
      Models.load(myChar).catch(() => {}); // start downloading early
      Models.loadAnims(["ranged", "melee"]).catch(() => {});
      Models.loadProps(["Skeleton_Crossbow", "Skeleton_Arrow"]).catch(() => {});
    }

    function showMenu() {
      lobby.innerHTML = "";
      lobby.hidden = false;
      const card = el("div", "rl-card");
      card.append(el("h2", "", "Red Light, Green Light"));
      card.append(el("div", "rl-help",
        "Move while the doll sings. When she turns around, freeze. If she sees you move, you're shot. " +
        "Cross the red line within 5 minutes."));
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
      const dumRow = el("label", "rl-check");
      const dumBox = el("input");
      dumBox.type = "checkbox";
      dumBox.id = "rl-dummies";
      dumBox.checked = (() => { try { return localStorage.getItem("rl:dummies") === "1"; } catch { return false; } })();
      dumBox.onchange = () => { try { localStorage.setItem("rl:dummies", dumBox.checked ? "1" : "0"); } catch {} };
      dumRow.append(dumBox, el("span", "", `Add ${DUMMIES} practice dummies (stand still: push them, sprint into them, hide behind them)`));
      const solo = el("button", "", "Play solo");
      solo.onclick = () => {
        audio();
        mode = "solo";
        myId = "solo";
        const nums = randomNumbers(1 + (dumBox.checked ? DUMMIES : 0));
        const roster = [{ id: "solo", name: "You", num: nums[0], char: myChar }];
        nums.slice(1).forEach((num, i) => roster.push({ id: "dummy" + i, name: "Dummy", num, char: "tracksuit", dummy: true }));
        beginMatch(roster);
      };
      const online = el("button", "alt", "Play online (coming next)");
      online.disabled = true;
      const controls = el("button", "alt", "🎮 Phone controls layout");
      controls.onclick = () => { lobby.hidden = true; input.editLayout(() => showMenu()); };
      card.append(dumRow, solo, online, controls,
        el("div", "rl-help", "Move: WASD / arrows · left stick · phone joystick. Sprint: double-tap a direction and hold it. " +
          "Push: F · X / □ on a controller · PUSH on a phone."));
      lobby.append(card);
    }

    // ---------- main loop ----------
    const camPos = new THREE.Vector3(0, 5, START_Z + 9);
    const camLook = new THREE.Vector3(0, 2, START_Z - 10);
    let time = 0;

    function update(dt) {
      time += dt;
      if (started && !done) {
        if (countdown > 0) {
          const before = Math.ceil(countdown);
          countdown -= dt;
          const now = Math.ceil(countdown);
          countEl.textContent = countdown > 0 ? String(now) : "GO!";
          if (now !== before && countdown > 0) tone(440, 0.2, 0.1);
          if (countdown <= 0) {
            musicBox(false);
            buzzer();
            later(() => (countEl.textContent = ""), 700);
            say(""); // the how-to line only shows during the countdown
            setPhase("away", TURN_AWAY);
          }
        } else if (phase !== "over") {
          clockLeft -= dt;
          if (clockLeft <= 0) { clockLeft = 0; timeUp(); }
        }
      }
      if (phase !== "idle" && phase !== "pre" && phase !== "over") updateDoll(dt);
      renderTimer();

      const mine = me();
      for (const p of order) {
        if (p === mine) stepBody(p, dt, true);
        else if (p.dummy) stepBody(p, dt, false);
        animate(p, dt);
      }
      // snipers turn to their target, then back to watching the field
      snipers.forEach((sn) => {
        sn.busy -= dt;
        const goal = sn.busy > 0 && sn.target
          ? faceAngle(sn.target.mesh.position.x - sn.root.position.x, sn.target.mesh.position.z - sn.root.position.z)
          : sn.rest;
        sn.root.rotation.y = lerpAngle(sn.root.rotation.y, goal, dt * 8);
        if (sn.kk) sn.kk.update(dt);
      });
      updateBolts(dt);

      // camera: behind and above you, looking down the field at the doll
      const focus = mine ? mine.mesh.position : new THREE.Vector3(0, 0, START_Z);
      const camGoal = new THREE.Vector3(focus.x * 0.7, 4.6, focus.z + 7.5);
      const lookGoal = new THREE.Vector3(focus.x * 0.4, 2.2, focus.z - 12);
      camPos.lerp(camGoal, Math.min(1, dt * 4));
      camLook.lerp(lookGoal, Math.min(1, dt * 4));
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      if (debugCam) { camera.position.set(...debugCam.pos); camera.lookAt(...debugCam.look); }
    }
    let debugCam = null; // testing only: a fixed camera

    const frameClock = new THREE.Clock();
    let raf = 0;
    function frame() {
      raf = requestAnimationFrame(frame);
      update(Math.min(frameClock.getDelta(), 0.05));
      renderer.render(scene, camera);
    }

    // for automated testing only: lets a test script read the game's state
    wrap.rlDebug = { set cam(v) { debugCam = v; }, get phase() { return phase; }, get phaseT() { return phaseT; }, get time() { return time; }, get order() { return order; }, get clockLeft() { return clockLeft; }, set clockLeft(v) { clockLeft = v; }, me, snipers, camera, doll };

    showMenu();
    frame();

    // ---------- cleanup when leaving the game ----------
    return () => {
      cancelAnimationFrame(raf);
      timeouts.forEach(clearTimeout);
      musicBox(false);
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {}
      window.removeEventListener("resize", resize);
      input.destroy();
      scene.traverse((o) => {
        if (o.userData && o.userData.kk) return;
        if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose();
      });
      [groundTex, sideMat.map, endMat.map, boardTex].forEach((t) => t.dispose());
      renderer.dispose();
      if (actx) actx.close();
      style.remove();
    };
  },
});
