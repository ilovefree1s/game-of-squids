// Red Light, Green Light (3D) — by Cougar.
//
// The rules (like the show):
//   Everyone starts behind the line. A giant doll at the far end turns her back and sings
//   "Mugunghwa kkochi pieotseumnida" (the traditional Korean playground chant). While she sings,
//   you can move. When the song ends she spins around and watches. Anyone she sees moving is
//   shot by the snipers. Cross the finish line before the 5-minute clock runs out, or you're out.
//   Her song changes speed every time: sometimes slow, sometimes rushed, sometimes both.
//
// SOLO: you alone (optionally with practice dummies). ONLINE: up to 8 players in a lobby.
//   The host's game runs the doll (her timing and songs) and tells everyone else; each player's own device
//   decides whether *they* moved on red, so internet lag never gets you shot.
//   SECRET ALLIANCES (lobby only): ask any player to ally. Only they see the request; if they confirm,
//   each of you sees the other's name in green. Nobody else knows. Alliances reset after every game.
// COMPUTER PLAYERS: 1-12, each with Aggression, Desperation and Cowardice (1-5). Online, the host's game runs them.
// Shoving anyone while she's watching gets YOU shot, unless you're hidden from her behind another player.
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
    const TIME_CHOICES = [1, 2, 3, 4, 5]; // minutes the host can pick
    let timeMin = (() => { try { const t = +localStorage.getItem("rl:time"); return TIME_CHOICES.includes(t) ? t : 3; } catch { return 3; } })();
    let matchTime = timeMin * 60; // seconds on the clock for the game being played
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
    const MAX_ONLINE = 8;
    const MAX_CPUS = 12; // computer players, on top of the real ones
    const TRAITS = [["agg", "Aggression", "How often they try to kill players closer to the finish"],
      ["des", "Desperation", "How much they sprint"],
      ["cow", "Cowardice", "How long they wait to run, and how early they stop"],
      ["ref", "Reflexes", "How fast they stop when she turns around"]];
    const SEND_EVERY = 0.1; // online: seconds between position updates
    const KILL_CREDIT = 1.5; // caught within this many seconds of a shove or bump = the shover gets the kill
    const FT = 3.281; // feet per meter (distances shown to players are in feet)

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
    const later = (fn, ms) => timeouts.push(setTimeout(fn, ms)); // real time (screens, music)
    const timers = []; // game time: these also run during the fast-forward at the end
    const after = (sec, fn) => timers.push({ at: time + sec, fn });
    function runTimers() {
      for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i--, 1)[0]; t.fn(); }
    }
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
      .rl .inp-jump:not(.inp-push):not(.rl-sprint) { display: none !important; } /* no jumping in this game */
      .rl .rl-sprint { position: absolute; z-index: 1; background: rgba(61,180,255,.75); color: #fff; pointer-events: auto; touch-action: none; }
      .rl .rl-sprint.down { background: rgba(61,180,255,1); }
      .rl-follow { position: absolute; left: 50%; bottom: calc(var(--u) * 3 + 8px); transform: translateX(-50%); z-index: 1;
                   font-size: clamp(12px, calc(var(--u) * 2.8), 16px); padding: 6px 14px; }
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
      .rl-splash { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0; }
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
      .rl-msg:not(:empty) { background: rgba(10,10,18,.62); padding: 6px 14px; border-radius: 10px; width: fit-content; max-width: 90%; }
      .rl-msg.bad { color: #ff6b6b; font-weight: 800; } .rl-msg.good { color: #3ddc84; font-weight: 800; }
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
      .rl-row { display: flex; align-items: center; gap: 10px; }
      .rl-row .who { flex: 1; min-width: 0; }
      .rl-row .who b { display: block; }
      .rl-row .who small { color: var(--muted); }
      .rl-row.ally .who b { color: #3ddc84; }
      .rl-face { width: 42px; height: 42px; border-radius: 50%; background: #2a2a40; flex: none; object-fit: cover; }
      .rl-card .rl-allybtn { flex: none; padding: 5px 12px; font-size: .85rem; background: #3a3a55; color: var(--text); }
      .rl-tag { flex: none; font-size: .8rem; font-weight: 700; color: var(--muted); }
      .rl-tag.ally { color: #3ddc84; }
      .rl-asks { background: #2b1f33; border: 1px solid #6b3a7a; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
      .rl-asks .rl-row button { flex: none; padding: 5px 12px; font-size: .85rem; }
      .rl-result b { color: var(--text); }
      .rl-result .rl-stats { font-size: .78rem; color: var(--muted); margin-top: 3px; }
      .rl-betrayed { color: #ff5c5c; font-weight: 800; }
      .rl-cpus { background: #14141f; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
      .rl-cpus .rl-row select { width: auto; padding: 4px 8px; }
      .rl-cpu-grid { display: grid; grid-template-columns: auto repeat(4, minmax(0, 1fr)); gap: 4px 6px; align-items: center; }
      .rl-cpu-grid select { padding: 3px 4px; }
      .rl-cpu-h { font-size: .66rem; color: var(--muted); text-align: center; overflow-wrap: anywhere; }
      .rl-cpu-name { font-size: .85rem; font-weight: 700; white-space: nowrap; }
      .rl-cpu-v { text-align: center; }
      .rl-vol summary { cursor: pointer; color: var(--muted); font-size: .9rem; }
      .rl-vol-row { display: flex; align-items: center; gap: 10px; font-size: .85rem; color: var(--text) !important; margin-top: 6px; }
      .rl-vol-row span:first-child { width: 7.5em; flex: none; }
      .rl-card .rl-vol-row input { flex: 1; padding: 0; accent-color: #ff3b5c; }
      .rl-vol-n { width: 2.2em; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
      .rl-time { background: #14141f; border-radius: 10px; padding: 8px 10px; }
      .rl-card .rl-time select { width: auto; }
      .rl-note { font-size: .85rem; color: var(--muted); min-height: 1.2em; }
      .rl-note.bad { color: #ff5c5c; }
      .rl-player.ally { box-shadow: 0 0 0 2px #3ddc84 inset; }
      .rl-player.me { box-shadow: 0 0 0 2px #ffcc33 inset; }
      .rl-players.pick .rl-player { pointer-events: auto; cursor: pointer; }
      .rl-player.doll { background: #6b2a8a; }
      .rl-player.watching { outline: 2px solid #fff; outline-offset: 1px; }
      .rl-players.pick { max-width: 30%; } /* wrap into rows instead of running into the light label */
      .rl.tall .rl-players.pick { max-width: 70%; }
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
    drawBoard(clockText(matchTime));
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
    // Volume channels, each with its own slider (saved on this device). 0-100.
    const VOL_CHANNELS = [["announcer", "Announcer"], ["song", "Doll's song"], ["sfx", "Sound effects"], ["music", "Music"]];
    const vol = (() => {
      const v = { announcer: 80, song: 100, sfx: 100, music: 100 };
      try { Object.assign(v, JSON.parse(localStorage.getItem("rl:vol") || "{}")); } catch {}
      return v;
    })();
    let actx = null;
    const bus = {}; // one gain per channel (except the announcer, which is the device's speech voice)
    function applyVolume() {
      for (const k in bus) bus[k].gain.value = (vol[k] / 100) * 0.9;
    }
    function audio() {
      if (!actx) {
        try {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          ["song", "sfx", "music"].forEach((k) => { bus[k] = actx.createGain(); bus[k].connect(actx.destination); });
          applyVolume();
        } catch { actx = null; }
      }
      if (actx && actx.state === "suspended") actx.resume();
      return simulating ? null : actx; // silent during the fast-forward
    }
    ["pointerdown", "keydown", "touchstart"].forEach((ev) => wrap.addEventListener(ev, () => { audio(); loadSamples(); }, { passive: true }));
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function tone(freq, dur = 0.25, level = 0.15, type = "sine", when = 0, ch = "sfx") {
      const a = audio(); if (!a) return;
      const t = a.currentTime + when;
      const o = a.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = a.createGain(); env(g, t, 0.01, level, dur);
      o.connect(g).connect(bus[ch]);
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
      src.connect(f).connect(g).connect(bus.sfx);
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
      out.connect(bus.song);
      o.start(t); vib.start(t);
      o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
    }
    // ---------- recorded sounds (files in minigames/red-light/sounds/, credits in sounds/CREDITS.txt) ----------
    const SOUND_DIR = "minigames/red-light/sounds/";
    const SAMPLES = {
      headshot: ["squish_06.mp3"],
      scream: [], // add scream files here (e.g. "scream_1.mp3") once they're in the sounds folder
    };
    const decoded = {}; // file -> AudioBuffer (or a promise while it loads)
    function loadSamples() {
      const a = actx || audio();
      if (!a || location.protocol === "file:") return;
      Object.values(SAMPLES).flat().forEach((f) => {
        if (decoded[f]) return;
        decoded[f] = fetch(SOUND_DIR + f).then((r) => r.arrayBuffer())
          .then((buf) => new Promise((ok, no) => a.decodeAudioData(buf, ok, no)))
          .then((b) => (decoded[f] = b)).catch(() => delete decoded[f]);
      });
    }
    // play one of a sample's files: level 0-1 (distance), with a little pitch variety so repeats don't sound identical
    function playSample(name, level = 1, pick = Math.random()) {
      const a = audio();
      const files = SAMPLES[name];
      if (!a || !files.length || level <= 0) return false;
      const b = decoded[files[Math.floor(pick * files.length) % files.length]];
      if (!(b instanceof AudioBuffer)) { loadSamples(); return false; }
      const src = a.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rand(0.92, 1.08);
      const g = a.createGain(); g.gain.value = level;
      src.connect(g).connect(bus.sfx);
      src.start();
      return true;
    }
    function headshotSound(level = 1) {
      if (!playSample("headshot", level)) arrowHitSound(level); // (until the file has loaded)
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
      o.connect(f).connect(g).connect(bus.sfx);
      o.start(t); o.stop(t + dur + 0.1);
      noise(dur * 0.8, 0.05, "bandpass", 1800);
    }
    function lockOnSound() { tone(1320, 0.12, 0.09, "square"); tone(1760, 0.18, 0.08, "square", 0.1); }
    function scanTick() { tone(2400, 0.05, 0.025, "sine"); }
    function shotSound() { // crossbow: a twang and a whoosh
      tone(190, 0.28, 0.22, "triangle"); tone(95, 0.2, 0.16, "sawtooth");
      noise(0.18, 0.12, "highpass", 2500, 0.02);
    }
    // A bolt hitting something that isn't a person (wood, ground): a sharp crack and thud. Made in code.
    // Kept for when bolts can miss. level 0-1: quieter for hits far away from you.
    function arrowHitSound(level = 1) {
      const a = audio(); if (!a || level <= 0) return;
      const t = a.currentTime;
      const out = a.createGain(); out.gain.value = level; out.connect(bus.sfx);
      const noiseBuf = (dur) => {
        const len = Math.max(1, Math.floor(a.sampleRate * dur));
        const b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return b;
      };
      const burst = (when, dur, type, f0, f1, q, peak) => { // filtered noise with a frequency sweep
        const src = a.createBufferSource(); src.buffer = noiseBuf(dur);
        const f = a.createBiquadFilter(); f.type = type; f.Q.value = q;
        f.frequency.setValueAtTime(f0, t + when);
        f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + when + dur);
        const g = a.createGain(); env(g, t + when, 0.003, peak, dur);
        src.connect(f).connect(g).connect(out);
        src.start(t + when);
      };
      burst(0, 0.035, "highpass", 2500, 1800, 0.7, 0.55); // crack
      burst(0.004, 0.22, "bandpass", 1400, 180, 6, 0.9); // wet squelch, sweeping down
      burst(0.01, 0.12, "lowpass", 900, 300, 1, 0.5); // body of the impact
      for (let i = 0; i < 5; i++) burst(0.012 + i * 0.011 + Math.random() * 0.006, 0.012, "bandpass", 3000 + Math.random() * 2000, 2000, 2, 0.25); // crunch
      const o = a.createOscillator(); o.type = "sine"; // deep thud
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const og = a.createGain(); env(og, t, 0.004, 0.7, 0.2);
      o.connect(og).connect(out); o.start(t); o.stop(t + 0.3);
      for (let i = 0; i < 4; i++) { // splatters landing
        const w = 0.12 + i * 0.07 + Math.random() * 0.05;
        burst(w, 0.05 + Math.random() * 0.04, "bandpass", 900 + Math.random() * 800, 300, 4, 0.18 + Math.random() * 0.12);
      }
    }
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
        tone(f, 1.2, 0.06, "triangle", 0, "music");
        tone(f * 2, 0.5, 0.015, "sine", 0, "music");
        if (k % 4 === 0) tone(f / 2, 0.9, 0.03, "sine", 0, "music");
        k++;
        boxTimer = setTimeout(step, len * beat * 1000);
      };
      step();
    }
    function announce(text) { // "Player 067, eliminated." (uses the device's own voice, if it has one)
      if (simulating) return;
      try {
        if (!window.speechSynthesis) return;
        const u = new SpeechSynthesisUtterance(text);
        if (!vol.announcer) return;
        u.rate = 0.95; u.pitch = 0.75; u.volume = vol.announcer / 100; u.lang = "en-US";
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
    let roundNo = 0; // goes up each time she turns her back (computer players plan each round)
    const heardAt = []; // when each syllable of the current song was sung (phase time)
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

    // Online, only the leader (the host) moves the doll from one phase to the next and tells everyone.
    const leader = () => mode !== "online" || (room && roomPlayers.length > 0 && roomPlayers[0].id === room.id);

    function setPhase(p, len = 0, data = null) {
      phase = p;
      phaseT = 0;
      phaseLen = len;
      setEyes(p === "watch");
      if (p === "watch") chantEl.hidden = true;
      if (p === "sing") {
        chant = data || makeChant();
        sungUpTo = -1;
        // (no subtitles: in the show you only hear her, so you can't see how close she is to turning)
        koSpans.forEach((s) => s.classList.remove("on"));
        roSpans.forEach((s) => s.classList.remove("on"));
      }
      if (p === "turn") whirSound(TURN_TO);
      if (p === "away") { roundNo++; sungUpTo = -1; whirSound(TURN_AWAY); eyes.forEach((e) => { e.iris.position.x = 0; e.pupil.position.x = 0; }); }
      if (p === "watch") lockOnSound();
      renderLight();
      if (mode === "online" && leader() && ["away", "sing", "turn", "watch"].includes(p)) {
        send({ t: "phase", ph: p, len, chant: p === "sing" ? chant : null, clock: clockLeft });
      }
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
        if (t >= 1 && leader()) setPhase("sing");
      } else if (phase === "sing") {
        while (sungUpTo < 9 && phaseT >= chant.times[sungUpTo + 1]) {
          sungUpTo++;
          heardAt[sungUpTo] = phaseT;
          sing(sungUpTo, chant.lens[sungUpTo], chant.base);
          koSpans[sungUpTo].classList.add("on");
          roSpans[sungUpTo].classList.add("on");
        }
        if (phaseT >= chant.total + 0.05 && leader()) setPhase("turn", TURN_TO);
      } else if (phase === "turn") { // spinning around: the head snaps first
        const t = clamp(phaseT / TURN_TO, 0, 1);
        setDoll(Math.PI * (1 - smooth(t)), Math.PI * (1 - smooth(Math.min(1, t * 1.5))));
        if (t >= 1 && leader()) setPhase("watch", rand(WATCH[0], WATCH[1]));
      } else if (phase === "watch") {
        // eyes and beam sweep across the field
        const s = Math.sin(phaseT * 2.4);
        eyes.forEach((e) => { e.iris.position.x = s * 0.1; e.pupil.position.x = s * 0.1; });
        beam.rotation.y = s * 0.28;
        scanT -= dt;
        if (scanT <= 0) { scanT = 0.42; scanTick(); }
        if (phaseT >= phaseLen && leader()) setPhase("away", TURN_AWAY);
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
          kk.play("Idle_A", { fade: 0 }); // at rest (crossbow lowered) until the light turns red
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
      after(rand(0.25, 0.55), () => {
        if (!sn.kk) { shotSound(); return launchBolt(sn.root.position.clone().add(new THREE.Vector3(0, 1.4, 0)), p); }
        sn.kk.play("Ranged_2H_Shoot", { once: true, fade: 0.05 });
        sn.shotT = 0.9; // let the shot finish before going back to aiming / resting
        after(0.12, () => {
          shotSound();
          const bow = sn.kk.held("right");
          const from = bow ? bow.getWorldPosition(new THREE.Vector3()) : sn.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
          launchBolt(from, p);
        });
      });
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
    let clockLeft = matchTime;
    let mode = "lobby"; // "lobby" | "solo" | "online"
    let myId = "solo";
    const me = () => order.find((p) => p.id === myId);
    let room = null; // online room (shared/net.js)
    let roomPlayers = []; // everyone in the room, oldest first (the first one is the host)
    let matchId = ""; // online: messages from an older match are ignored
    // (nothing is sent while the host fast-forwards; everyone gets the final results instead)
    const send = (d, force = false) => { if (mode === "online" && room && (!simulating || force)) room.send({ ...d, m: matchId }); };
    // secret alliances (by player id). They only last for one game.
    const allies = new Set(); // confirmed
    const asked = new Set(); // I asked them, no answer yet
    const incoming = new Set(); // they asked me
    const allied = (p) => allies.has(p.id);
    // Is this player moved by this device? You, practice dummies, and (on the host) the computer players.
    const simLocal = (p) => p.id === myId || p.dummy || (p.cpu && leader());
    // computer players: the setup the host picked (remembered on this device)
    const roll = () => 1 + Math.floor(Math.random() * 5);
    const randomTraits = () => ({ agg: roll(), des: roll(), cow: roll(), ref: roll() });
    let cpuSetup = (() => {
      try {
        const c = JSON.parse(localStorage.getItem("rl:cpus") || "null");
        if (c && Array.isArray(c.list)) { c.list.forEach((t) => { if (!t.ref) t.ref = roll(); }); return c; } // older saves had no Reflexes
      } catch {}
      return { count: 0, list: [] };
    })();
    const saveCpus = () => { try { localStorage.setItem("rl:cpus", JSON.stringify(cpuSetup)); } catch {} };

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
      const name = mode === "online" || p.cpu ? `${p.num} ${p.name}` : p.num;
      const color = mine ? "#ffcc33" : allied(p) ? "#3ddc84" : "#ffffff"; // you: yellow · your allies: green
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textTexture(name, 384, 64, null, color, "bold 34px sans-serif"), depthTest: false, transparent: true,
      }));
      tag.userData.own = true;
      tag.scale.set(2.1, 0.35, 1);
      tag.position.y = 2.75;
      g.add(tag);
      g.userData.tag = tag;
      scene.add(g);
      return g;
    }

    function addPlayer(r, k, n) {
      const p = { ...r, vel: new THREE.Vector3(), knock: new THREE.Vector3(), out: false, dead: false, finished: false,
        speed: 0, pushT: 0, hitT: 0, lastPush: -9, knocked: {},
        remote: mode === "online" && r.id !== myId, target: null, targetRy: 0,
        // for the results screen
        stats: { pushes: 0, landed: 0, gotPushed: 0, bumpsGiven: 0, bumpsTaken: 0, kills: [] },
        lastHit: null, // { by, kind: "push" | "bump", at } the last time someone shoved or bumped them
        cause: "", by: "", betrayed: false, distFt: 0 };
      if (r.cpu) {
        p.traits = { agg: r.agg || 3, des: r.des || 3, cow: r.cow || 3, ref: r.ref || 3 };
        p.ai = { round: -1, laneX: clamp(rand(-FIELD_HALF + 2, FIELD_HALF - 2), -FIELD_HALF + 1, FIELD_HALF - 1) };
      }
      p.mesh = makePlayerMesh(p, r.id === myId);
      const spread = Math.min(3, (FIELD_HALF * 2 - 6) / Math.max(1, n));
      if (r.sx !== undefined) p.mesh.position.set(r.sx, 0, r.sz); // a random spot picked at the start (see startSpots)
      else p.mesh.position.set((k - (n - 1) / 2) * spread, 0, START_Z + 2.2);
      if (r.dummy) { const i = +r.id.slice(5); p.mesh.position.set(-3 + i * 2, 0, START_Z - 4 - (i % 2) * 3); }
      return p;
    }

    function animate(p, dt) {
      if (simulating) return; // nobody's watching: skip the animation work
      const kk = p.mesh.userData.kk;
      if (!kk) {
        if (p.dead) p.mesh.userData.body.rotation.x = Math.min(Math.PI / 2, p.mesh.userData.body.rotation.x + dt * 6);
        return;
      }
      if (p.dead) kk.play("Death_A", { once: true, fade: 0.08 }); // (shared/models.js lays them on the ground)
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

    // sprint: double-tap a direction and hold it (keyboard, stick or phone joystick), or hold Shift on a keyboard
    const tap = { held: false, downAt: -9, upAt: -9, dir: null, sprint: false };
    let shiftHeld = false;
    let sprintBtnHeld = false;
    const sprintBtn = el("div", "inp-jump rl-sprint", "SPRINT");
    sprintBtn.hidden = true;
    sprintBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); sprintBtnHeld = true; sprintBtn.classList.add("down"); });
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => sprintBtn.addEventListener(ev, () => { sprintBtnHeld = false; sprintBtn.classList.remove("down"); }));
    wrap.insertBefore(sprintBtn, lobby);
    function placeSprintBtn() { // same spot and size as the player's JUMP button setting (shared phone layout)
      let j = { x: 0.85, y: 0.8, size: 96 };
      try { const l = JSON.parse(localStorage.getItem("inp:layout") || "null"); if (l && l.jump) j = l.jump; } catch {}
      sprintBtn.style.width = sprintBtn.style.height = j.size + "px";
      sprintBtn.style.left = `calc(${(j.x * 100).toFixed(2)}% - ${j.size / 2}px)`;
      sprintBtn.style.top = `calc(${(j.y * 100).toFixed(2)}% - ${j.size / 2}px)`;
      sprintBtn.style.fontSize = Math.max(11, Math.round(j.size * 0.16)) + "px";
    }
    function showSprintBtn(on) { placeSprintBtn(); sprintBtn.hidden = !(on && input.isTouch); }
    const onShift = (e) => { if (e.key === "Shift") shiftHeld = e.type === "keydown"; };
    const offShift = () => (shiftHeld = false);
    document.addEventListener("keydown", onShift);
    document.addEventListener("keyup", onShift);
    window.addEventListener("blur", offShift);
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
      return { mv, len, sprint: (tap.sprint || shiftHeld || sprintBtnHeld) && held };
    }

    const live = (p) => started && !done && countdown <= 0 && !p.out && !p.finished;

    // Move one player that this device is in charge of (you, or a practice dummy).
    function stepBody(p, dt, mine) {
      const ok = live(p);
      const ctl = !ok ? null : mine ? readMove() : p.cpu ? brain(p) : null;
      const { mv, len, sprint } = ctl || { mv: { x: 0, y: 0 }, len: 0, sprint: false };
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
      const wantPush = mine ? input.push() : !!(ctl && ctl.push);
      if (ok && wantPush && time - p.lastPush > PUSH_COOLDOWN) doPush(p);
      if (!ok) return;
      if (judging() && p.speed > MOVE_LIMIT && seen(p)) caught(p);
      else if (P.z < FINISH_Z) finish(p);
    }

    // ---------- computer players ----------
    // Traits 1-5. Aggression: how often they go after a player closer to the finish (they line up behind them and
    // shove just before they think the song will end, so the victim is still sliding when she turns). Desperation:
    // how much they sprint (more with little time left). Cowardice: how long they wait before running and how early
    // they stop. Reflexes: how fast they stop when she turns. No inside information: they only know what a player
    // could see and hear (her song so far, where everyone is).
    const AGG_CHANCE = [0, 0.2, 0.4, 0.65, 0.9];
    const SPRINT_CHANCE = [0.05, 0.25, 0.45, 0.7, 0.9];
    const REACT = [[0.35, 0.55], [0.28, 0.45], [0.2, 0.36], [0.13, 0.27], [0.08, 0.18]]; // seconds, by Reflexes 1-5
    function newRound(p) { // she just turned her back: decide this round's plan
      const a = p.ai;
      const t = p.traits;
      // the clock makes everyone braver: +1 under 2 minutes, +2 under 1 minute, +3 under 30 seconds
      const nerve = (clockLeft < 120 ? 1 : 0) + (clockLeft < 60 ? 1 : 0) + (clockLeft < 30 ? 1 : 0);
      a.go = time + Math.max(0, (t.cow - 1 - nerve) * 0.3) + rand(0, 0.35); // cowards wait longer before running
      // ...and stop earlier in the song. 10 = keep going until she turns, and count on stopping in time
      a.stopAt = clamp(Math.round(10 - (t.cow - 1) * 1.7 + rand(-0.6, 0.6) + nerve), 2, 10);
      a.sprint = Math.random() < Math.min(0.97, SPRINT_CHANCE[t.des - 1] + nerve * 0.12);
      const [r0, r1] = REACT[t.ref - 1];
      a.reaction = rand(r0, r1); // how long it takes them to notice she's turning (Reflexes)
      a.pushLead = rand(0.15, 0.45); // seconds before the song ends to shove
      a.target = null;
      if (Math.random() < AGG_CHANCE[t.agg - 1]) {
        const P = p.mesh.position, reach = 4 + t.agg * 3;
        let best = null, bd = reach;
        for (const q of order) { // someone closer to the finish, not too far away
          if (q === p || q.out || q.dead || q.finished || q.left) continue;
          const Q = q.mesh.position;
          if (Q.z > P.z - 0.3) continue;
          const d = Math.hypot(Q.x - P.x, Q.z - P.z);
          if (d < bd) { bd = d; best = q; }
        }
        a.target = best;
      }
    }
    // How long until she stops singing? A guess from the tempo so far, like a person would make.
    // A song that suddenly speeds up (or slows down) fools them.
    function guessSongLeft() {
      if (sungUpTo < 1) return 9; // heard too little to judge
      const beat = (heardAt[sungUpTo] - heardAt[0]) / sungUpTo;
      return heardAt[sungUpTo] + beat * (9 - sungUpTo) + beat - phaseT;
    }
    function brain(p) {
      const a = p.ai;
      const none = { mv: { x: 0, y: 0 }, len: 0, sprint: false, push: false };
      if (a.round !== roundNo) { a.round = roundNo; newRound(p); }
      let moving = false;
      const tg0 = a.target;
      const hunting = tg0 && !tg0.out && !tg0.dead && !tg0.finished && !tg0.left;
      if (!hunting) a.target = null;
      // hunters keep going until they're in position behind their target, whatever their nerve
      if (phase === "away" || phase === "sing") moving = time >= a.go && (hunting || sungUpTo < a.stopAt);
      else if (phase === "turn") moving = a.wasMoving && phaseT < a.reaction; // slow to react
      if (phase !== "turn") a.wasMoving = moving;
      if (!moving) return none;
      const P = p.mesh.position;
      let gx = a.laneX, gz = P.z - 10; // default: straight down their lane
      let push = false;
      const tg = a.target;
      let sprint = a.sprint;
      if (tg && (phase === "sing" || phase === "away")) {
        const Q = tg.mesh.position;
        gx = Q.x; gz = Q.z + 0.85; // line up right behind them
        const d = Math.hypot(Q.x - P.x, Q.z - P.z);
        if (d > 4 + p.traits.agg * 3) { a.target = null; return brain(p); } // got away
        if (d > 3) sprint = sprint || p.traits.des >= 3; // closing the gap
        const left = phase === "sing" ? guessSongLeft() : 9;
        if (d < PUSH_RANGE - 0.05 && left < a.pushLead) {
          p.mesh.rotation.y = faceAngle(Q.x - P.x, Q.z - P.z); // face them and shove
          a.target = null;
          return { ...none, push: true };
        }
        if (Math.hypot(gx - P.x, gz - P.z) < 0.35) { // in position: stand still and wait for the moment
          p.mesh.rotation.y = faceAngle(Q.x - P.x, Q.z - P.z);
          return none;
        }
      }
      let dx = gx - P.x, dz = gz - P.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      return { mv: { x: dx, y: -dz }, len: 1, sprint, push };
    }

    // Another player online: glide toward where their device last said they were.
    function stepRemote(p, dt) {
      if (!p.target || p.left) return;
      const P = p.mesh.position;
      const k = Math.min(1, dt * 12);
      P.x += (p.target.x - P.x) * k; // (height is left alone: a fallen body settles itself onto the ground)
      P.z += (p.target.z - P.z) * k;
      if (!p.dead) p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, p.targetRy, dt * 12);
    }

    // Bodies don't overlap. Sprinting into someone knocks them forward.
    function collide(p) {
      const P = p.mesh.position;
      for (const q of order) {
        if (q === p || q.dead || q.left) continue;
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
          noteHit(p, q, "bump");
          knock(q, p.vel.x / runSpeed, p.vel.z / runSpeed, SPRINT_KNOCK, KNOCK_DECAY, "bump", p.id);
          p.vel.multiplyScalar(0.5); // the bump slows the sprinter down
        }
      }
    }

    // Someone shoved or bumped someone: every device keeps the same tally.
    function noteHit(from, to, kind) {
      if (!from || !to) return;
      if (kind === "push") { from.stats.landed++; to.stats.gotPushed++; }
      else { from.stats.bumpsGiven++; to.stats.bumpsTaken++; }
      to.lastHit = { by: from.id, kind, at: time };
    }

    // Shove whoever is right in front of you.
    function doPush(p) {
      p.lastPush = time;
      p.pushT = 0.45;
      p.stats.pushes++;
      send({ t: "push", who: p.id }); // everyone sees the shove
      const fx = -Math.sin(p.mesh.rotation.y), fz = -Math.cos(p.mesh.rotation.y); // facing direction
      let best = null, bd = PUSH_RANGE;
      for (const q of order) {
        if (q === p || q.dead || q.finished || q.left) continue;
        const dx = q.mesh.position.x - p.mesh.position.x, dz = q.mesh.position.z - p.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / Math.max(d, 0.001) > Math.cos(Math.PI / 3)) { bd = d; best = q; }
      }
      tone(150, 0.12, 0.08, "triangle");
      if (best) { noteHit(p, best, "push"); knock(best, fx, fz, PUSH_POWER, PUSH_DECAY, "push", p.id); }
      // shoving while she's watching gets you shot, if she can see you (hidden is hidden)
      if (phase === "watch" && !p.out && !p.finished && seen(p)) caught(p, "shove");
    }

    function knock(q, dx, dz, power, decay = KNOCK_DECAY, kind = "push", by = myId) {
      if (!simLocal(q)) { // another device moves them: tell it
        send({ t: "knock", who: by, to: q.id, dx, dz, power, decay, kind });
        q.hitT = 0.55;
        noise(0.12, power > 5 ? 0.22 : 0.1, "lowpass", 500);
        return;
      }
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
      const watching = wasSpectating; // dead: the chips switch who you're watching
      playersEl.classList.toggle("pick", watching);
      if (watching) {
        const d = el("div", "rl-player doll" + (!specTarget ? " watching" : ""), "👁 Doll");
        d.onclick = () => { specTarget = null; say(""); renderPlayers(); };
        playersEl.append(d);
      }
      order.forEach((p) => {
        let cls = "rl-player";
        if (p.out) cls += " out";
        else if (p.finished) cls += " finished";
        if (mode === "online" && p.id === myId) cls += " me";
        else if (allied(p)) cls += " ally";
        const label = mode === "online" || p.cpu ? `${p.num} ${p.name}` : p.num;
        if (watching && specTarget === p.id) cls += " watching";
        const chip = el("div", cls, (p.finished ? "✓ " : "") + label);
        if (watching && !p.dummy) chip.onclick = () => { specTarget = p.id; free.on = false; followBtn.hidden = true; say(""); renderPlayers(); };
        playersEl.append(chip);
      });
    }
    let specTarget = null; // dead players: whose view they're watching (null = the doll's eyes)
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

    // reason: "red" (moved while she watched) or "time" (time ran out). info: what the victim's own device decided (online).
    function caught(p, reason = "red", info = null) {
      if (p.out || p.finished) return;
      p.out = true;
      p.vel.set(0, 0, 0);
      p.speed = 0;
      if (info) Object.assign(p, info); // another player's device told us how they died
      else if (simLocal(p)) {
        const h = p.lastHit;
        if (reason === "red" && h && time - h.at < KILL_CREDIT) { // shoved or bumped into getting caught
          p.cause = h.kind; p.by = h.by; p.betrayed = allies.has(h.by) || (p.id !== myId && h.by === myId && allied(p));
        } else p.cause = reason;
        p.distFt = Math.max(0, (START_Z - p.mesh.position.z) * FT);
      } else { p.cause = reason; p.distFt = Math.max(0, (START_Z - p.mesh.position.z) * FT); }
      const killer = p.by && order.find((q) => q.id === p.by);
      if (killer && (p.cause === "push" || p.cause === "bump")) killer.stats.kills.push(p.id);
      renderPlayers();
      if (p.id === myId) say(reason === "shove" ? "She saw you shove…" : "She saw you move…", "bad");
      if (simLocal(p) && !p.dummy) send({ t: "caught", who: p.id, info: { cause: p.cause, by: p.by, betrayed: p.betrayed, distFt: p.distFt } });
      fire(p);
    }
    function hit(p) {
      if (p.dead) return;
      p.dead = true;
      p.deadAt = time;
      // the head shot: louder the closer you are (full within ~30 ft, quieter out to the far end)
      const lis = me() && !me().dead ? me().mesh.position : camera.position;
      const far = Math.hypot(p.mesh.position.x - lis.x, p.mesh.position.z - lis.z);
      headshotSound(clamp(1.15 - far / 80, 0.3, 1));
      // the announcer stops once every real player is out (or time's up): no reading out the rest
      const realLeft = order.some((q) => !q.cpu && !q.dummy && !q.left && !q.out && !q.finished);
      if (phase !== "over" && (realLeft || (!p.cpu && !p.dummy))) announce(`Player ${p.num}, eliminated.`);
      if (p.id === myId) {
        const traitor = p.betrayed && order.find((q) => q.id === p.by);
        say(`Player ${p.num}, eliminated.` + (traitor ? `\nBetrayed by ${traitor.name}` : ""), "bad");
      }
      after(1.8, checkEnd);
      splatter(p);
      after(1.4, () => bleed(p)); // once they're lying on the ground
      splashCheck(p);
      screams(p);
    }

    // ---------- screams: contestants near someone who gets shot ----------
    // Each contestant still on the field within 20 ft of the victim has a 1-in-3 chance to scream; at most two
    // screams per shot. The rolls come from the game id and the victim, so every player hears the same screams.
    const SCREAM_RANGE = 6.1; // 20 ft
    function seeded(str) { // a repeatable random number generator from a string
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
    }
    function screams(victim) {
      if (simulating) return;
      const r = seeded((matchId || soloSeed) + ":" + victim.id); // solo: new rolls each game
      const near = order.filter((q) => q !== victim && !q.out && !q.finished && !q.left && !q.dummy &&
        Math.hypot(q.mesh.position.x - victim.mesh.position.x, q.mesh.position.z - victim.mesh.position.z) <= SCREAM_RANGE)
        .sort((a, b) => (a.id < b.id ? -1 : 1)); // same order on every screen
      let n = 0;
      for (const q of near) {
        if (n >= 2) break;
        if (r() >= 1 / 3) continue;
        n++;
        const pick = r(), delay = 0.12 + r() * 0.35; // a moment after the shot
        q.screamT = 1.2; // (for testing: who screamed)
        lastScreams.push(q.id);
        after(delay, () => {
          const lis = me() && !me().dead ? me().mesh.position : camera.position;
          const far = Math.hypot(q.mesh.position.x - lis.x, q.mesh.position.z - lis.z);
          playSample("scream", clamp(1.1 - far / 70, 0.25, 1), pick);
        });
      }
    }
    const lastScreams = [];
    const soloSeed = String(Math.random());

    // ---------- blood on YOUR screen: someone shot right in front of you ----------
    // Within 10 ft of you and inside a 60° slice of your view (30° either side of where your camera points),
    // blood splatters across your screen and fades away over about 8 seconds.
    const SPLASH_RANGE = 3.05; // 10 ft
    const SPLASH_HALF_ANGLE = THREE.MathUtils.degToRad(30);
    const SPLASH_FADE = 8; // seconds
    const splashEl = document.createElement("canvas");
    splashEl.className = "rl-splash";
    wrap.insertBefore(splashEl, edgeEl);
    let splashLeft = 0;
    const camDir = new THREE.Vector3();
    function splashCheck(victim) {
      const m = me();
      if (simulating || !m || m.dead || victim === m) return;
      const d = Math.hypot(victim.mesh.position.x - m.mesh.position.x, victim.mesh.position.z - m.mesh.position.z);
      if (d > SPLASH_RANGE) return;
      camera.getWorldDirection(camDir);
      const tx = victim.mesh.position.x - m.mesh.position.x, tz = victim.mesh.position.z - m.mesh.position.z; // from you, the way you're looking
      const fl = Math.hypot(camDir.x, camDir.z), tl = Math.hypot(tx, tz);
      if (!fl || !tl) return;
      const cos = (camDir.x * tx + camDir.z * tz) / (fl * tl);
      if (cos < Math.cos(SPLASH_HALF_ANGLE)) return; // not in front of you
      splash(1 - (d / SPLASH_RANGE) * 0.6); // closer = more blood
    }
    function splash(amount) {
      const w = (splashEl.width = Math.max(1, wrap.clientWidth)), h = (splashEl.height = Math.max(1, wrap.clientHeight));
      if (splashLeft <= 0) splashEl.getContext("2d").clearRect(0, 0, w, h);
      const g = splashEl.getContext("2d");
      const n = Math.round(6 + amount * 14);
      const u = Math.min(w, h);
      for (let i = 0; i < n; i++) {
        const x = rand(0.05, 0.95) * w, y = rand(0.05, 0.9) * h, r = u * rand(0.02, 0.07) * (0.6 + amount);
        g.fillStyle = `rgba(${110 + Math.floor(rand(0, 40))},0,${Math.floor(rand(4, 14))},${rand(0.75, 0.95).toFixed(2)})`;
        g.beginPath(); // a ragged drop
        for (let k = 0; k <= 14; k++) {
          const a = (k / 14) * Math.PI * 2, rr = r * rand(0.7, 1.15);
          k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
        for (let k = 0; k < 4; k++) { // specks around it
          const a = Math.random() * Math.PI * 2, dd = r * rand(1.3, 2.4);
          g.beginPath(); g.arc(x + Math.cos(a) * dd, y + Math.sin(a) * dd, r * rand(0.08, 0.2), 0, Math.PI * 2); g.fill();
        }
        if (Math.random() < 0.6) { // a drip running down
          g.fillRect(x - r * 0.12, y, r * 0.24, r * rand(1.5, 4));
          g.beginPath(); g.arc(x, y + r * rand(1.5, 4), r * 0.2, 0, Math.PI * 2); g.fill();
        }
      }
      splashLeft = SPLASH_FADE;
      splashEl.style.opacity = "1";
    }
    function updateSplash(dt) {
      if (splashLeft <= 0) return;
      splashLeft -= dt;
      splashEl.style.opacity = Math.max(0, splashLeft / SPLASH_FADE).toFixed(3); // fades out evenly
      if (splashLeft <= 0) splashEl.getContext("2d").clearRect(0, 0, splashEl.width, splashEl.height);
    }

    // ---------- blood: a spatter when the shot hits, then a pool that slowly spreads around the head ----------
    const pools = [];
    const POOL_GROW = 14; // seconds for the pool to reach full size
    const POOL_SIZE = 0.457; // full pool: about 3 ft across (radius in meters)
    const texs = {};
    function blobTexture(kind) { // drawn once each
      if (texs[kind]) return texs[kind];
      texs[kind] = canvasTex(256, 256, (g, w, h) => {
        g.translate(w / 2, h / 2);
        const shape = (r, wobble, points, color) => {
          g.fillStyle = color;
          g.beginPath();
          for (let i = 0; i <= points; i++) {
            const a = (i / points) * Math.PI * 2, rr = r * (1 - wobble + Math.random() * wobble);
            i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          g.closePath();
          g.fill();
        };
        if (kind === "splat") { // ragged, with droplets
          shape(80, 0.35, 18, "rgba(110,6,12,.95)");
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 50;
            g.fillStyle = "rgba(110,6,12,.9)";
            g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 4 + Math.random() * 9, 0, Math.PI * 2); g.fill();
          }
        } else { // a smooth, glossy pool
          const grad = g.createRadialGradient(0, 0, 10, 0, 0, 122);
          grad.addColorStop(0, "rgba(70,0,6,.97)"); grad.addColorStop(0.8, "rgba(100,4,10,.95)"); grad.addColorStop(1, "rgba(120,8,14,.85)");
          shape(122, 0.08, 40, grad);
          g.fillStyle = "rgba(255,255,255,.10)";
          g.beginPath(); g.ellipse(-30, -34, 34, 13, -0.6, 0, Math.PI * 2); g.fill();
        }
      });
      return texs[kind];
    }
    function decal(kind, x, z, size, grow, follow) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({
        map: blobTexture(kind), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * Math.PI * 2;
      m.position.set(x, 0.025 + pools.length * 0.0004, z);
      m.scale.setScalar(0.02);
      scene.add(m);
      pools.push({ m, t: 0, size, grow, follow });
    }
    function splatter(p) { // the moment the shot hits
      if (simulating || p.left) return;
      const h = headOf(p);
      decal("splat", h.x + rand(-0.15, 0.15), h.z + rand(-0.15, 0.15), rand(0.28, 0.36), 0.15, null);
    }
    function bleed(p) { // once they're down: the pool spreads around the head
      if (simulating || !p.dead || p.left) return;
      const h = headOf(p);
      decal("pool", h.x, h.z, POOL_SIZE * rand(0.9, 1.1), POOL_GROW, p);
    }
    function updatePools(dt) {
      for (const b of pools) {
        if (b.t >= b.grow) continue;
        b.t += dt;
        if (b.follow) { const h = headOf(b.follow); b.m.position.x = h.x; b.m.position.z = h.z; } // stays under the head
        const k = 1 - Math.pow(1 - Math.min(1, b.t / b.grow), 2); // spreads fast at first, then slower
        b.m.scale.setScalar(0.02 + (b.size - 0.02) * k);
      }
    }
    function finish(p) {
      if (p.finished || p.out) return;
      // after time's up you can still run (and cross), but it doesn't count: everyone left on the field is shot
      if (phase === "over" || clockLeft <= 0) return;
      p.finished = true;
      p.finishLeft = clockLeft;
      renderPlayers();
      if (simLocal(p) && !p.dummy) send({ t: "finish", who: p.id });
      if (p.id === myId) {
        say("You made it across! 🎉", "good");
        tone(660, 0.15, 0.12); tone(880, 0.3, 0.12, "sine", 0.15);
      }
      checkEnd();
    }
    // When every real player is across or out, the rest of the game (computer players) is played out
    // instantly by the host's game, so the results are complete.
    function checkEnd() {
      if (done || !started) return;
      const over = (p) => p.dummy || p.left || p.finished || p.dead;
      if (!order.every((p) => p.cpu || over(p))) return; // real players still playing
      if (order.every(over)) return endMatch();
      if (simulating) return;
      if (leader()) fastForward();
      else say("Waiting for the host's game to finish the computer players…");
    }
    let simulating = false;
    const SIM_DT = 0.05;
    function fastForward() {
      simulating = true;
      input.showTouch(false);
      showSprintBtn(false);
      say("Playing out the rest for the computer players…");
      const chunk = () => {
        if (!simulating) return;
        const t0 = performance.now();
        while (!done && performance.now() - t0 < 25) update(SIM_DT); // in small slices, so the screen doesn't freeze
        if (!done) timeouts.push(setTimeout(chunk, 0));
        else simulating = false;
      };
      chunk();
    }
    function timeUp() {
      if (phase === "over") return;
      if (mode === "online" && leader()) send({ t: "timeup" });
      setPhase("over");
      setDoll(0, 0);
      setEyes(true);
      chantEl.hidden = true;
      buzzer();
      say("Time's up.", "bad");
      // everyone still on the field is shot
      order.filter((p) => !p.finished && !p.out).forEach((p, k) => after(0.6 + k * 0.45, () => caught(p, "time")));
      after(0.6 + order.length * 0.45 + 2.5, () => { if (!done) endMatch(); });
    }
    function endMatch(hostResults = null) {
      if (done) return;
      done = true;
      simulating = false;
      setPhase("over");
      chantEl.hidden = true;
      input.showTouch(false);
      showSprintBtn(false);
      lightEl.hidden = true;
      const m = me();
      if (m && m.finished) {
        const bonus = Math.ceil(m.finishLeft || 0);
        api.addScore(100 + bonus);
        say(`You survived Red Light, Green Light with ${clockText(bonus)} to spare.`, "good");
      } else say("You didn't make it.", "bad");
      later(() => musicBox(true, 0.26), 800);
      results = hostResults || makeResults();
      results.forEach((r) => (r.mine = r.id === myId));
      if (mode !== "online") { later(() => { musicBox(false); showSoloResults(); }, 3500); return; }
      if (leader()) send({ t: "results", results }, true); // complete results (with the computer players) for everyone
      // online: back to the lobby with the results; alliances don't carry over
      allies.clear(); asked.clear(); incoming.clear();
      if (room) room.update({ inGame: false });
      later(() => { musicBox(false); renderRoom(roomPlayers); }, 4500);
    }
    function makeResults() {
      const nameOf = (id) => { const q = order.find((o) => o.id === id); return q ? (q.cpu ? `${q.num} CPU` : q.name) : "someone"; };
      order.forEach((p) => { if (!p.out && !p.finished) p.distFt = Math.max(0, (START_Z - p.mesh.position.z) * FT); });
      return [...order].filter((p) => !p.dummy)
        .sort((a, b) => (b.finished ? 1 : 0) - (a.finished ? 1 : 0) || (b.finishLeft || 0) - (a.finishLeft || 0) || b.distFt - a.distFt)
        .map((p) => ({
          id: p.id, name: p.name, num: p.num, ok: p.finished, left: p.finishLeft, cpu: !!p.cpu, alive: !p.out && !p.finished,
          cause: p.cause, by: p.by ? nameOf(p.by) : "", betrayed: p.betrayed, distFt: Math.round(p.distFt),
          stats: { ...p.stats, kills: p.stats.kills.map(nameOf) },
        }));
    }
    function showSoloResults() {
      lobby.innerHTML = "";
      lobby.hidden = false;
      const card = el("div", "rl-card");
      card.append(el("h2", "", "Results"), resultsList(results));
      const go = el("button", "", "Continue");
      go.onclick = () => { lobby.hidden = true; api.gameOver(); };
      card.append(go);
      lobby.append(card);
    }
    let results = null; // the last online game's results, shown in the lobby

    // Clear the field for the next game.
    function resetMatch() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      timers.length = 0;
      simulating = false;
      showSprintBtn(false);
      musicBox(false);
      order.forEach((p) => {
        scene.remove(p.mesh);
        p.mesh.traverse((o) => {
          if (!o.userData.own) return; // KayKit parts are shared by every copy
          if (o.geometry && o.geometry !== blobGeo) o.geometry.dispose();
          if (o.material && o.material !== blobMat) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        });
      });
      order = [];
      bolts.forEach((b) => scene.remove(b.obj));
      pools.forEach((b) => { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); });
      pools.length = 0;
      splashLeft = 0;
      splashEl.style.opacity = "0";
      bolts.length = 0;
      started = done = false;
      wasSpectating = false;
      specTarget = null;
      lastWatched = null;
      free.on = false;
      followBtn.hidden = true;
      camera.fov = 58;
      camera.updateProjectionMatrix();
      phase = "idle";
      setEyes(false);
      setDoll(0, 0);
      chantEl.hidden = true;
      lightEl.hidden = true;
      countEl.textContent = "";
      say("");
      api.setScore(0);
    }

    function startMatch(roster, minutes = timeMin) {
      if (order.length) resetMatch();
      matchTime = minutes * 60;
      order = roster.map((r, k) => addPlayer(r, k, roster.length));
      spawnSnipers();
      started = true;
      done = false;
      clockLeft = matchTime;
      countdown = COUNTDOWN;
      lobby.hidden = true;
      setDoll(0, 0); // she faces you while the clock counts down
      setPhase("pre");
      input.showTouch(true);
      showSprintBtn(true);
      musicBox(true);
      const touch = navigator.maxTouchPoints > 0;
      say((touch ? "Joystick to move · hold SPRINT to sprint · PUSH to shove · swipe to look around." : "WASD / arrows to move · Shift to sprint · F to push · drag to look around") +
        "\nMove only while she sings. Freeze when she turns.");
      renderPlayers();
      renderTimer();
    }

    // load everything the match needs (max ~10s), then start
    let loadingMatch = false;
    function beginMatch(roster, id = "", minutes = timeMin) {
      if (loadingMatch) return;
      loadingMatch = true;
      matchId = id;
      lobby.innerHTML = "";
      const card = el("div", "rl-card");
      card.append(el("h2", "", "Loading…"));
      lobby.append(card);
      lobby.hidden = false;
      const go = () => { loadingMatch = false; startMatch(roster, minutes); };
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

    // Redrawing a card (menu or lobby) keeps where you'd scrolled to.
    function scrollOf(kind) {
      const old = lobby.querySelector(".rl-card");
      return old && old.dataset.kind === kind ? old.scrollTop : 0;
    }
    function putCard(card, kind, top) {
      card.dataset.kind = kind;
      lobby.append(card);
      card.scrollTop = top;
    }

    function showMenu() {
      const keepTop = scrollOf("menu");
      lobby.innerHTML = "";
      lobby.hidden = false;
      const card = el("div", "rl-card");
      card.append(el("h2", "", "Red Light, Green Light"));
      card.append(el("div", "rl-help",
        "Move while the doll sings. When she turns around, freeze. If she sees you move, you're shot. " +
        "Cross the red line before the clock runs out."));
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
      const soloCpus = cpuPanel(cpuSetup, true, (soft) => { saveCpus(); if (!soft) showMenu(); });
      const solo = el("button", "", "Play solo");
      solo.onclick = () => {
        audio();
        lobbyListEl = null;
        mode = "solo";
        myId = "solo";
        const nums = randomNumbers(1 + (dumBox.checked ? DUMMIES : 0));
        const roster = [{ id: "solo", name: "You", num: nums[0], char: myChar }];
        nums.slice(1).forEach((num, i) => roster.push({ id: "dummy" + i, name: "Dummy", num, char: "tracksuit", dummy: true }));
        roster.push(...cpuRoster(cpuSetup, nums));
        beginMatch(startSpots(roster));
      };
      const controls = el("button", "alt", "🎮 Phone controls layout");
      controls.onclick = () => { lobby.hidden = true; lobbyListEl = null; input.editLayout(() => showMenu()); };

      // online
      const nameIn = el("input");
      nameIn.id = "rl-name";
      nameIn.value = savedName();
      nameIn.placeholder = "e.g. Cougar";
      nameIn.maxLength = 14;
      nameIn.addEventListener("keydown", (e) => e.stopPropagation()); // typing shouldn't move anyone
      const note = el("div", "rl-note bad");
      const getName = () => {
        const n = nameIn.value.trim().slice(0, 14);
        if (!n) { note.textContent = "Type your name first."; nameIn.focus(); return null; }
        try { localStorage.setItem("gos:name", n); } catch {}
        return n;
      };
      const host = el("button", "", "Host a lobby");
      host.onclick = () => { const n = getName(); if (n) enterRoom(Net.newCode(), n); };
      lobbyListEl = el("ul", "rl-list");
      lobbyListEl.join = (code) => { const n = getName(); if (n) enterRoom(code, n); };

      card.append(timePicker(), soloCpus, dumRow, solo, volumePanel(), el("label", "", "Play online · your name"), nameIn, host,
        el("label", "", "Open lobbies"), lobbyListEl, note, controls,
        el("div", "rl-help", "Move: WASD / arrows · left stick · phone joystick. Sprint: hold Shift (phone: hold SPRINT), or double-tap a direction and hold it. Look around: drag the mouse, or swipe on a phone. " +
          "Push: F · X / □ on a controller · PUSH on a phone."));
      putCard(card, "menu", keepTop);
      if (typeof Net === "undefined" || typeof supabase === "undefined") {
        host.disabled = true;
        note.textContent = "Online play unavailable (Supabase library didn't load).";
        lobbyListEl = null;
        return;
      }
      try {
        if (!lobbyFeed) lobbyFeed = Net.lobbies("red-light", renderLobbyList);
        renderLobbyList(lobbyFeed.list());
      } catch (err) {
        note.textContent = "Online play unavailable: " + err.message;
      }
    }
    const savedName = () => { try { return localStorage.getItem("gos:name") || ""; } catch { return ""; } };

    // ---------- online: open lobbies ----------
    let lobbyFeed = null; // live list of open lobbies
    let lobbyListEl = null; // the list on the menu, while it's showing
    let myName = "";
    let myNum = "";
    function renderLobbyList(list) {
      if (!lobbyListEl || room) return;
      lobbyListEl.innerHTML = "";
      const open = list.filter((l) => l.id !== Net.id).sort((a, b) => (a.inGame ? 1 : 0) - (b.inGame ? 1 : 0) || b.count - a.count);
      if (!open.length) { lobbyListEl.append(el("li", "rl-note", "No open lobbies right now. Host one!")); return; }
      open.forEach((l) => {
        const li = el("li", "rl-row");
        const full = l.count >= MAX_ONLINE;
        const info = el("div", "who");
        info.append(el("b", "", `${l.host}'s lobby`),
          el("small", "", `${l.count}/${MAX_ONLINE} players · ${l.inGame ? "playing now (you'll join next game)" : "waiting to start"}`));
        const btn = el("button", "", full ? "Full" : "Join");
        btn.disabled = full;
        btn.onclick = () => lobbyListEl && lobbyListEl.join(l.code);
        li.append(info, btn);
        lobbyListEl.append(li);
      });
    }
    function advertiseLobby(list) { // the host shows the lobby in everyone's list
      if (!lobbyFeed || !room) return;
      if (!(list.length && list[0].id === room.id)) return lobbyFeed.hide();
      lobbyFeed.advertise({ code: room.code, host: myName, count: Math.min(list.length, MAX_ONLINE), inGame: list.some((p) => p.inGame) });
    }
    function leaveRoom() {
      if (lobbyFeed) lobbyFeed.hide();
      if (room) room.leave();
      room = null;
      roomPlayers = [];
      allies.clear(); asked.clear(); incoming.clear();
    }

    let roomNote = "", roomNoteBad = false;
    function enterRoom(code, name) {
      mode = "online";
      myName = name;
      myNum = randomNumbers(1)[0];
      results = null;
      lobbyListEl = null;
      roomPlayers = [];
      roomNote = "Connecting…";
      roomNoteBad = false;
      try {
        room = Net.joinRoom("red-light", code, name, {
          onPlayers: onRoomPlayers,
          onMessage: onRoomMessage,
          onStatus: (st) => {
            if (started && !done) return;
            if (st === "SUBSCRIBED") { roomNote = "Connected."; roomNoteBad = false; renderRoom(roomPlayers); }
            else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") {
              roomNote = "Couldn't connect to the online server. Check your internet."; roomNoteBad = true; renderRoom(roomPlayers);
            }
          },
        }, { char: myChar, num: myNum, cpus: cpuSetup, time: timeMin });
        myId = room.id;
      } catch (err) {
        roomNote = "Online play failed to start: " + err.message; roomNoteBad = true;
      }
      renderRoom([]);
    }

    function onRoomPlayers(list) {
      roomPlayers = list;
      advertiseLobby(list);
      // same number as someone who joined before me? pick another
      const mineAt = list.findIndex((p) => room && p.id === room.id);
      if (mineAt > 0 && list.slice(0, mineAt).some((p) => p.num === myNum)) {
        myNum = randomNumbers(1)[0];
        room.update({ num: myNum });
      }
      const here = new Set(list.map((p) => p.id));
      [allies, asked, incoming].forEach((set) => [...set].forEach((id) => { if (!here.has(id)) set.delete(id); }));
      if (!started || done) return renderRoom(list);
      order.forEach((p) => { // someone left mid-game
        if (!p.left && !p.cpu && !here.has(p.id)) { // (computer players aren't connected: they never leave)
          p.left = true;
          p.mesh.visible = false;
          if (!p.finished && !p.dead) { p.out = true; p.cause = "left"; p.distFt = Math.max(0, (START_Z - p.mesh.position.z) * FT); say(`${p.name} left the game.`, "bad"); }
          renderPlayers();
          checkEnd();
        }
      });
    }

    function onRoomMessage(data, from) {
      // secret alliances (lobby). Messages go to the whole room; everyone but the named player ignores them.
      if (data.t === "ally-ask" && data.to === myId) {
        if (asked.has(from)) { asked.delete(from); allies.add(from); room.send({ t: "ally-yes", to: from }); } // we both asked
        else if (!allies.has(from)) incoming.add(from);
        return renderRoom(roomPlayers);
      }
      if (data.t === "ally-yes" && data.to === myId) {
        if (asked.has(from)) { asked.delete(from); allies.add(from); tone(880, 0.15, 0.08); }
        return renderRoom(roomPlayers);
      }
      if (data.t === "start") {
        if (started && !done) return;
        if (!data.roster.some((r) => r.id === myId)) { roomNote = "The game started without you (room full)."; roomNoteBad = true; return renderRoom(roomPlayers); }
        incoming.clear(); asked.clear(); // unanswered requests expire when the game starts
        room.update({ inGame: true });
        return beginMatch(data.roster, data.m, data.time || 3);
      }
      if (!started || data.m !== matchId) return; // not for this game
      const p = order.find((q) => q.id === (data.who || from)); // "who": a computer player the host runs
      if (data.t === "cpus") { // the host's computer players
        if (leader()) return;
        data.list.forEach(([id, x, z, ry, sp]) => {
          const q = order.find((o) => o.id === id);
          if (!q) return;
          if (!q.target) q.target = new THREE.Vector3();
          q.target.set(x, 0, z); q.targetRy = ry; q.speed = sp;
        });
        return;
      }
      if (data.t === "results") { // the host's complete results (computer players played out)
        if (!done) endMatch(data.results);
        return;
      }
      if (data.t === "phase") {
        if (leader()) return;
        if (countdown > 0) { countdown = 0; countEl.textContent = ""; musicBox(false); say(""); }
        clockLeft = data.clock;
        setPhase(data.ph, data.len, data.chant);
      } else if (data.t === "timeup") {
        if (!leader()) { clockLeft = 0; timeUp(); }
      } else if (!p) {
        return;
      } else if (data.t === "pos") {
        if (!p.target) p.target = new THREE.Vector3();
        p.target.set(data.x, 0, data.z);
        p.targetRy = data.ry;
        p.speed = data.sp;
      } else if (data.t === "push") { p.pushT = 0.45; p.stats.pushes++; }
      else if (data.t === "knock") {
        const q = order.find((o) => o.id === data.to);
        if (!q) return;
        noteHit(p, q, data.kind || "push");
        if (simLocal(q)) knock(q, data.dx, data.dz, data.power, data.decay, data.kind, p.id); // shoved: me, or a computer player I run
        else q.hitT = 0.55;
      } else if (data.t === "caught") caught(p, "red", data.info || null);
      else if (data.t === "finish") finish(p);
    }

    // The lobby: players, secret alliances, results of the last game, Start (host).
    function renderRoom(list) {
      if (started && !done) return;
      if (mode !== "online") return;
      const keepTop = scrollOf("room");
      lobby.innerHTML = "";
      lobby.hidden = false;
      const card = el("div", "rl-card");
      const hostP = list[0];
      card.append(el("h2", "", `${hostP ? hostP.name : myName}'s lobby`));
      if (results) {
        const ul = resultsList(results);
        card.append(el("label", "", "Last game"), ul);
      }
      // someone asked me to ally
      const asks = list.filter((p) => incoming.has(p.id));
      if (asks.length) {
        const box = el("div", "rl-asks");
        box.append(el("b", "", "🤫 Secret alliance requests"));
        asks.forEach((p) => {
          const row = el("div", "rl-row");
          const yes = el("button", "", "Confirm");
          yes.onclick = () => { incoming.delete(p.id); allies.add(p.id); room.send({ t: "ally-yes", to: p.id }); renderRoom(roomPlayers); };
          const no = el("button", "alt", "Ignore");
          no.onclick = () => { incoming.delete(p.id); renderRoom(roomPlayers); };
          row.append(face(p.char), el("div", "who", `${p.num} ${p.name} wants to ally with you`), yes, no);
          box.append(row);
        });
        card.append(box);
      }
      const inGame = list.some((p) => p.inGame);
      const ul = el("ul", "rl-list");
      list.slice(0, MAX_ONLINE).forEach((p, i) => {
        const mine = room && p.id === room.id;
        const li = el("li", "rl-row" + (allies.has(p.id) ? " ally" : ""));
        const who = el("div", "who");
        who.append(el("b", "", `${p.num || "···"} ${p.name}${mine ? " (you)" : ""}${i === 0 ? " 👑" : ""}`),
          el("small", "", Models.available() && p.char ? Models.byId(p.char).label : ""));
        li.append(face(p.char), who);
        if (!mine) {
          if (allies.has(p.id)) li.append(el("span", "rl-tag ally", "Ally"));
          else if (asked.has(p.id)) li.append(el("span", "rl-tag", "Asked…"));
          else if (!inGame) {
            const b = el("button", "rl-allybtn", "🤝 Ally?");
            b.onclick = () => {
              if (incoming.has(p.id)) { incoming.delete(p.id); allies.add(p.id); room.send({ t: "ally-yes", to: p.id }); }
              else { asked.add(p.id); room.send({ t: "ally-ask", to: p.id }); }
              renderRoom(roomPlayers);
            };
            li.append(b);
          }
        }
        ul.append(li);
      });
      card.append(el("label", "", `Players (${Math.min(list.length, MAX_ONLINE)}/${MAX_ONLINE}) · alliances are secret: only the player you ask sees it`), ul);
      const myIndex = list.findIndex((p) => room && p.id === room.id);
      const iAmHost = myIndex === 0;
      let note = roomNote, bad = roomNoteBad;
      if (inGame) { note = "A game is running in this lobby. You'll join the next one."; bad = false; }
      else if (myIndex >= MAX_ONLINE) { note = `Room is full (${MAX_ONLINE} players).`; bad = true; }
      else if (myIndex >= 0 && !bad) note = iAmHost ? "You're the host 👑. Start when everyone's in." : "Waiting for the host to start…";
      if (iAmHost && !inGame) card.append(timePicker(() => room.update({ time: timeMin })));
      else if (hostP && hostP.time) card.append(el("div", "rl-row rl-time", `⏱ Time limit: ${hostP.time} minute${hostP.time === 1 ? "" : "s"}`));
      if (iAmHost && !inGame) {
        card.append(cpuPanel(cpuSetup, true, (soft) => { saveCpus(); room.update({ cpus: cpuSetup }); if (!soft) renderRoom(roomPlayers); }));
      } else if (hostP && hostP.cpus && hostP.cpus.count) {
        card.append(cpuPanel(hostP.cpus, false));
      }
      if (iAmHost && !inGame) {
        const n = Math.min(list.length, MAX_ONLINE);
        const c = cpuSetup.count || 0;
        const who = (n > 1 ? `${n} players` : "just you") + (c ? ` + ${c} CPU${c === 1 ? "" : "s"}` : "");
        const startBtn = el("button", "", results ? `Play again (${who})` : `Start (${who})`);
        startBtn.onclick = () => hostStart(list);
        card.append(startBtn);
      }
      const leave = el("button", "alt", "Leave lobby");
      leave.onclick = () => { leaveRoom(); resetMatch(); results = null; mode = "lobby"; myId = "solo"; showMenu(); };
      card.append(el("div", "rl-note" + (bad ? " bad" : ""), note), volumePanel(), leave);
      putCard(card, "room", keepTop);
    }

    function hostStart(list) {
      const roster = list.slice(0, MAX_ONLINE).map((p) => ({ id: p.id, name: p.name, num: p.num || randomNumbers(1)[0], char: p.char || "tracksuit" }));
      roster.push(...cpuRoster(cpuSetup, roster.map((r) => r.num)));
      startSpots(roster);
      const m = Math.random().toString(36).slice(2, 10);
      room.send({ t: "start", m, roster, time: timeMin });
      room.update({ inGame: true });
      incoming.clear(); asked.clear();
      beginMatch(roster, m, timeMin);
    }

    // The results of a game: how everyone did, how they died, and their shoving stats.
    function resultsList(rs) {
      const ul = el("ul", "rl-list");
      const CAUSE = { red: "moved on red", shove: "shoved someone on red", time: "time ran out", left: "left the game" };
      rs.forEach((r) => {
        const li = el("li", "rl-result");
        let how;
        if (r.ok) how = `made it with ${clockText(Math.ceil(r.left || 0))} left`;
        else if (r.alive) how = `still on the field · made it ${r.distFt} ft`;
        else {
          how = r.cause === "push" ? `pushed into the line of fire by ${r.by}`
            : r.cause === "bump" ? `bumped into the line of fire by ${r.by}` : CAUSE[r.cause] || "eliminated";
          how += ` · made it ${r.distFt} ft`;
        }
        li.append(el("b", "", `${r.ok ? "✅" : r.alive ? "🏃" : "💀"} ${r.num} ${r.name}${r.mine ? " (you)" : ""}`), el("span", "", " · " + how));
        if (r.betrayed) li.append(el("span", "rl-betrayed", ` · BETRAYED by ${r.by}`));
        const st = r.stats;
        const bits = [`pushes ${st.pushes} (${st.landed} landed)`, `got pushed ${st.gotPushed}`,
          `sprint bumps ${st.bumpsGiven} given / ${st.bumpsTaken} taken`];
        if (st.kills.length) bits.push(`got ${st.kills.join(", ")} killed`);
        li.append(el("div", "rl-stats", bits.join(" · ")));
        ul.append(li);
      });
      return ul;
    }

    // Everyone starts at a random spot in a loose crowd behind the start line (3 rows, about 5 ft apart).
    // Online, the host picks the spots and sends them with the roster, so every screen matches.
    function startSpots(roster) {
      const cells = [];
      for (let row = 0; row < 3; row++) {
        for (let x = -FIELD_HALF + 1.5; x <= FIELD_HALF - 1.5; x += 1.5) cells.push([x, START_Z + 1.4 + row * 1.6]);
      }
      for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
      let c = 0;
      roster.forEach((r) => {
        if (r.dummy) return; // practice dummies have their own places on the field
        const [x, z] = cells[c++ % cells.length];
        r.sx = +(x + rand(-0.3, 0.3)).toFixed(2);
        r.sz = +(z + rand(-0.3, 0.3)).toFixed(2);
      });
      return roster;
    }

    // computer players for a new game, with numbers nobody else has
    function cpuRoster(setup, taken) {
      const used = new Set(taken);
      const out = [];
      for (let i = 0; i < Math.min(MAX_CPUS, setup.count || 0); i++) {
        let num;
        do num = randomNumbers(1)[0]; while (used.has(num));
        used.add(num);
        const t = setup.list[i] || randomTraits();
        out.push({ id: "cpu" + i, name: "CPU", num, char: "tracksuit", cpu: true, agg: t.agg, des: t.des, cow: t.cow, ref: t.ref || 3 });
      }
      return out;
    }

    // The computer players panel: how many (0-12) and each one's traits (1-5). Read-only for everyone but the host.
    function cpuPanel(setup, editable, onChange) {
      const box = el("div", "rl-cpus");
      const head = el("div", "rl-row");
      head.append(el("b", "who", "🤖 Computer players"));
      if (editable) {
        const count = el("select");
        count.id = "rl-cpu-count";
        for (let n = 0; n <= MAX_CPUS; n++) { const o = el("option", "", n ? String(n) : "None"); o.value = n; if (n === (setup.count || 0)) o.selected = true; count.append(o); }
        count.addEventListener("keydown", (e) => e.stopPropagation());
        count.onchange = () => {
          setup.count = +count.value;
          while (setup.list.length < setup.count) setup.list.push(randomTraits()); // new ones get a random mix
          onChange();
        };
        head.append(count);
      } else head.append(el("span", "rl-tag", setup.count ? String(setup.count) : "None"));
      box.append(head);
      if (!setup.count) return box;
      const grid = el("div", "rl-cpu-grid");
      grid.append(el("span", ""), ...TRAITS.map(([, label, help]) => { const h = el("span", "rl-cpu-h", label); h.title = help; return h; }));
      for (let i = 0; i < setup.count; i++) {
        const t = setup.list[i] || (setup.list[i] = randomTraits());
        grid.append(el("span", "rl-cpu-name", "CPU " + (i + 1)));
        TRAITS.forEach(([key]) => {
          if (!editable) { grid.append(el("span", "rl-cpu-v", String(t[key]))); return; }
          const sel = el("select");
          for (let v = 1; v <= 5; v++) { const o = el("option", "", String(v)); o.value = v; if (v === t[key]) o.selected = true; sel.append(o); }
          sel.addEventListener("keydown", (e) => e.stopPropagation());
          sel.onchange = () => { t[key] = +sel.value; onChange(true); }; // just this value: no redraw
          grid.append(sel);
        });
      }
      box.append(grid);
      if (editable) {
        const mix = el("button", "alt", "🎲 Random mix");
        mix.onclick = () => { setup.list = setup.list.map(() => randomTraits()); onChange(); };
        box.append(mix);
      }
      box.append(el("div", "rl-help", TRAITS.map(([, label, help]) => `${label}: ${help.toLowerCase()}.`).join(" ") + " 1 = least, 5 = most."));
      return box;
    }

    // ⏱ time limit picker (solo, and the host in the lobby)
    function timePicker(onChange) {
      const row = el("div", "rl-row rl-time");
      const sel = el("select");
      sel.id = "rl-time";
      TIME_CHOICES.forEach((m) => { const o = el("option", "", `${m} minute${m === 1 ? "" : "s"}`); o.value = m; if (m === timeMin) o.selected = true; sel.append(o); });
      sel.addEventListener("keydown", (e) => e.stopPropagation());
      sel.onchange = () => {
        timeMin = +sel.value;
        try { localStorage.setItem("rl:time", timeMin); } catch {}
        if (onChange) onChange();
      };
      row.append(el("b", "who", "⏱ Time limit"), sel);
      return row;
    }

    function volumePanel() {
      const det = el("details", "rl-vol");
      det.append(el("summary", "", "🔊 Volume"));
      VOL_CHANNELS.forEach(([key, label]) => {
        const row = el("label", "rl-vol-row");
        const r = el("input");
        r.type = "range"; r.min = 0; r.max = 100; r.value = vol[key]; r.id = "rl-vol-" + key;
        const num = el("span", "rl-vol-n", String(vol[key]));
        r.oninput = () => {
          vol[key] = +r.value;
          num.textContent = r.value;
          applyVolume();
          try { localStorage.setItem("rl:vol", JSON.stringify(vol)); } catch {}
        };
        r.onchange = () => { // a sample of that channel
          if (key === "announcer") announce("Player 456, eliminated.");
          else if (key === "song") sing(0, 0.4, 530);
          else if (key === "music") tone(659, 0.8, 0.06, "triangle", 0, "music");
          else { shotSound(); setTimeout(() => headshotSound(1), 250); }
        };
        row.append(el("span", "", label), r, num);
        det.append(row);
      });
      return det;
    }

    // a small picture of a character's face, for the lobby (made once per character)
    const faces = {};
    let faceRenderer = null;
    function face(charId) {
      const img = el("img", "rl-face");
      img.alt = "";
      const id = Models.byId(charId || "tracksuit").id;
      if (faces[id]) { img.src = faces[id]; return img; }
      if (!Models.available()) return img;
      Models.load(id).then(() => {
        if (!faces[id]) faces[id] = drawFace(id);
        if (faces[id]) img.src = faces[id];
      }).catch(() => {});
      return img;
    }
    function drawFace(id) {
      try {
        if (!faceRenderer) {
          faceRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
          faceRenderer.setSize(96, 96);
          faceRenderer.outputEncoding = THREE.sRGBEncoding;
        }
        const sc = new THREE.Scene();
        sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
        const l = new THREE.DirectionalLight(0xffffff, 0.8); l.position.set(1, 2, -3); sc.add(l);
        const c = Models.spawn(id);
        if (!c) return null;
        sc.add(c.root);
        c.update(0.01);
        sc.updateMatrixWorld(true);
        const h = c.bone("head") ? c.bone("head").getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.6, 0);
        const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
        cam.position.set(h.x, h.y + 0.2, h.z - 1.5); // characters face -Z: look at them from the front
        cam.lookAt(h.x, h.y + 0.15, h.z);
        faceRenderer.render(sc, cam);
        return faceRenderer.domElement.toDataURL("image/png");
      } catch { return null; }
    }

    // ---------- main loop ----------
    const camPos = new THREE.Vector3(0, 5, START_Z + 9);
    const camLook = new THREE.Vector3(0, 2, START_Z - 10);
    let time = 0;
    let sendT = 0;

    function update(dt) {
      time += dt;
      runTimers();
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
            if (leader()) setPhase("away", TURN_AWAY); // online: everyone else waits for the host's doll
          }
        } else if (phase !== "over") {
          clockLeft -= dt;
          if (clockLeft <= 0) { clockLeft = 0; if (leader()) timeUp(); }
        }
      }
      if (phase !== "idle" && phase !== "pre" && phase !== "over") updateDoll(dt);
      renderTimer();

      const mine = me();
      for (const p of order) {
        if (p === mine) stepBody(p, dt, true);
        else if (p.dummy) stepBody(p, dt, false);
        else if (p.cpu && leader()) stepBody(p, dt, false);
        else if (p.remote) stepRemote(p, dt);
        animate(p, dt);
      }
      if (mode === "online" && mine && started && !done) { // tell everyone where I am
        sendT -= dt;
        if (sendT <= 0) {
          sendT = SEND_EVERY;
          const P = mine.mesh.position;
          send({ t: "pos", x: +P.x.toFixed(2), z: +P.z.toFixed(2), ry: +mine.mesh.rotation.y.toFixed(2), sp: +mine.speed.toFixed(2) });
          if (leader()) { // all my computer players in one message
            const list = order.filter((q) => q.cpu && !q.dead).map((q) => [q.id, +q.mesh.position.x.toFixed(2), +q.mesh.position.z.toFixed(2), +q.mesh.rotation.y.toFixed(2), +q.speed.toFixed(2)]);
            if (list.length) send({ t: "cpus", list });
          }
        }
      }
      // snipers turn to their target, then back to watching the field
      snipers.forEach((sn) => {
        sn.busy -= dt;
        const goal = sn.busy > 0 && sn.target
          ? faceAngle(sn.target.mesh.position.x - sn.root.position.x, sn.target.mesh.position.z - sn.root.position.z)
          : sn.rest;
        sn.root.rotation.y = lerpAngle(sn.root.rotation.y, goal, dt * 8);
        if (sn.kk) {
          // weapons down while she sings; raised from the moment she starts to turn (and when time's up)
          sn.shotT = (sn.shotT || 0) - dt;
          const red = phase === "turn" || phase === "watch" || phase === "over" || sn.busy > 0;
          if (sn.shotT <= 0) sn.kk.play(red ? "Ranged_2H_Aiming" : "Idle_A", { fade: 0.25 });
          sn.kk.update(dt);
        }
      });
      updateBolts(dt);
      updatePools(dt);
      updateSplash(dt);

      // camera: behind and above you, looking down the field at the doll.
      // Once you're dead (after a moment to see yourself fall), you watch the rest from the doll's eyes.
      const spectating = mine && mine.dead && time - mine.deadAt > SPECTATE_AFTER && started && !done;
      const watched = spectating && specTarget ? order.find((q) => q.id === specTarget && !q.left) : null;
      let camGoal, lookGoal;
      if (spectating && free.on && !watched) { // looking wherever they dragged to
        camGoal = DOLL_EYES;
        const cp = Math.cos(free.pitch);
        lookGoal = DOLL_EYES.clone().add(new THREE.Vector3(-Math.sin(free.yaw) * cp, Math.sin(free.pitch), -Math.cos(free.yaw) * cp).multiplyScalar(60));
        camera.fov += (50 - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      } else if (spectating && !watched) {
        camGoal = DOLL_EYES;
        const alive = order.filter((q) => !q.out && !q.finished && !q.left && !q.dummy);
        let spread = 0;
        if (alive.length) { // look at the middle of everyone still playing
          const c = new THREE.Vector3();
          alive.forEach((q) => c.add(q.mesh.position));
          lookGoal = c.divideScalar(alive.length).setY(1);
          alive.forEach((q) => (spread = Math.max(spread, q.mesh.position.distanceTo(lookGoal))));
        } else lookGoal = new THREE.Vector3(0, 1, (START_Z + FINISH_Z) / 2);
        // zoom so the group fills the view (far away = zoomed in, like binoculars)
        // (camera.fov is put back to normal when you watch a player)
        const dist = DOLL_EYES.distanceTo(lookGoal);
        const fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan((3 + spread) / dist)), 6, 50);
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 2);
        camera.updateProjectionMatrix();
      } else {
        const who = watched || mine; // you, or (when you're dead) the player you picked to watch
        const focus = who ? who.mesh.position : new THREE.Vector3(0, 0, START_Z);
        if (watched && camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); }
        // narrow (upright phone) screens: follow you straight on, a bit further back, so you stay in view
        const narrow = camera.aspect < 1;
        const UP = narrow ? 5.4 : 4.6, BACK = narrow ? 9.5 : 7.5, AHEAD = narrow ? 10 : 12, LOOK_Y = narrow ? 1.6 : 2.2;
        const cx = narrow ? focus.x : focus.x * 0.7, lx = narrow ? focus.x : focus.x * 0.4;
        // look-around (same as Glass Bridge): while dragging, the camera swings around you; let go and it eases back
        if (!look.dragging) {
          look.yaw += (0 - look.yaw) * Math.min(1, dt * 5);
          look.pitch += (0 - look.pitch) * Math.min(1, dt * 5);
        }
        const elev = clamp(Math.atan2(UP, BACK) + look.pitch, 0.2, 1.35);
        const dist = Math.hypot(UP, BACK);
        const back = dist * Math.cos(elev), up = dist * Math.sin(elev);
        const sy = Math.sin(look.yaw), cy = Math.cos(look.yaw);
        camGoal = new THREE.Vector3(cx + sy * back, up, focus.z + cy * back);
        lookGoal = new THREE.Vector3(lx - sy * AHEAD, LOOK_Y, focus.z - cy * AHEAD);
      }
      if (spectating !== wasSpectating) { // cut, don't swoop
        wasSpectating = spectating;
        camPos.copy(camGoal);
        camLook.copy(lookGoal);
        if (!spectating) { camera.fov = 58; camera.updateProjectionMatrix(); free.on = false; followBtn.hidden = true; }
        if (spectating) {
          specTarget = null;
          say((navigator.maxTouchPoints > 0 ? "Watching from the doll's eyes · swipe to look around" : "Watching from the doll's eyes · drag to look around") +
            "\nTap a player's number at the top to watch from behind them", "");
          later(() => { if (/doll's eyes/.test(msg.textContent)) say(""); }, 6000);
        }
        renderPlayers(); // the number chips become buttons (or stop being buttons)
      }
      const dollView = spectating && !watched;
      const k = look.dragging && !dollView ? 12 : 4; // follow your finger/mouse closely while dragging
      if (watched !== lastWatched) { lastWatched = watched; camPos.copy(camGoal); camLook.copy(lookGoal); } // switching who you watch: cut
      camPos.lerp(camGoal, Math.min(1, dt * k));
      camLook.lerp(lookGoal, Math.min(1, dt * (dollView ? (free.on ? 14 : 2.5) : k + 1)));
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      if (debugCam) { camera.position.set(...debugCam.pos); camera.lookAt(...debugCam.look); }
    }
    let wasSpectating = false;
    let lastWatched = null;
    // Look around: hold the mouse button and drag, or swipe the game view on a phone (same as Glass Bridge).
    // Let go and the camera eases back behind you. Moving still goes toward the doll, whichever way you look.
    const look = { yaw: 0, pitch: 0, dragging: false, id: null, x: 0, y: 0 };
    const free = { on: false, yaw: 0, pitch: 0 }; // dragging around while watching from the doll's eyes
    const followBtn = el("button", "rl-follow", "👁 Follow players");
    followBtn.hidden = true;
    followBtn.onclick = () => { free.on = false; followBtn.hidden = true; };
    wrap.insertBefore(followBtn, lobby);
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
      if (wasSpectating && !specTarget) { // from the doll's eyes: look any direction, and it stays there
        if (!free.on) { // start from wherever the camera is looking now
          const d = camLook.clone().sub(camPos).normalize();
          free.yaw = Math.atan2(-d.x, -d.z);
          free.pitch = Math.asin(clamp(d.y, -1, 1));
          free.on = true;
          followBtn.hidden = false;
        }
        free.yaw -= ((e.clientX - look.x) / w) * Math.PI * 1.6;
        free.pitch = clamp(free.pitch - ((e.clientY - look.y) / w) * 2.2, -1.45, 1.45);
        look.x = e.clientX;
        look.y = e.clientY;
        return;
      }
      look.yaw -= ((e.clientX - look.x) / w) * Math.PI * 1.6; // a full-width swipe turns you ~290°
      look.pitch += ((e.clientY - look.y) / w) * 2.2;
      look.yaw = clamp(look.yaw, -Math.PI, Math.PI); // up to looking straight behind you
      look.pitch = clamp(look.pitch, -0.6, 0.5);
      look.x = e.clientX;
      look.y = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === look.id) { look.dragging = false; look.id = null; } };
    view.addEventListener("pointerup", endLook);
    view.addEventListener("pointercancel", endLook);
    view.addEventListener("lostpointercapture", endLook);
    const SPECTATE_AFTER = 2.5; // seconds after you're shot
    // just in front of her face, at eye height (she's DOLL_SIZE times her model size)
    const DOLL_EYES = new THREE.Vector3(0, (9.85 + 0.12) * DOLL_SIZE, DOLL_Z + 2.4 * DOLL_SIZE);
    let debugCam = null; // testing only: a fixed camera
    let debugSteps = 1; // testing only: run the game faster than real time

    const frameClock = new THREE.Clock();
    let raf = 0;
    function frame() {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(frameClock.getDelta(), 0.05);
      if (!simulating) for (let i = 0; i < debugSteps; i++) update(dt); // (debugSteps is 1 except in automated tests)
      renderer.render(scene, camera);
    }

    // for automated testing only: lets a test script read the game's state
    wrap.rlDebug = { get screams() { return lastScreams; }, set cam(v) { debugCam = v; }, set steps(v) { debugSteps = v; }, get phase() { return phase; }, get phaseT() { return phaseT; }, get time() { return time; }, get order() { return order; }, get clockLeft() { return clockLeft; }, set clockLeft(v) { clockLeft = v; }, me, snipers, camera, doll };

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
      document.removeEventListener("keydown", onShift);
      document.removeEventListener("keyup", onShift);
      window.removeEventListener("blur", offShift);
      leaveRoom();
      if (lobbyFeed) lobbyFeed.stop();
      if (faceRenderer) faceRenderer.dispose();
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
