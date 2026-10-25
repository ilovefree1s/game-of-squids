// Glass Bridge (3D) — third-person. Jump left or right across 18 rows of glass.
// One panel in each row holds; the other shatters and you fall.
//
// Controls: ← / A = jump to the left panel, → / D = jump to the right panel,
//           or click a glowing panel / the on-screen buttons.
// You have 3 players. When one falls, the next hops along the safe path to
// where they fell, and the other panel in that row is marked safe.
//
// Scoring: +10 per safe step. Finishing adds +50 per surviving player
// and +1 per second left on the clock.
//
// Needs shared/lib/three.min.js (loaded in index.html before this file).

Hub.register({
  id: "glass-bridge",
  name: "Glass Bridge",
  description: "Two panels. One holds. One shatters. (3D)",
  author: "ilovefree1s",

  start(container, api) {
    if (typeof THREE === "undefined") {
      container.textContent = "3D library didn't load (shared/lib/three.min.js).";
      return;
    }

    // ---------- settings ----------
    const STEPS = 18;
    const PLAYERS = 3;
    const TIME = 90; // seconds
    const ROW_GAP = 2.4; // distance between rows
    const LANE_X = 1.25; // left/right panel offset
    const PANEL = 1.5; // panel size
    const FIRST_Z = -4; // z of row 0
    const GRAVITY = 22;
    const NUMBERS = ["023", "148", "311"]; // tracksuit numbers

    const rowZ = (i) => FIRST_Z - i * ROW_GAP;
    const laneX = (side) => (side === 0 ? -LANE_X : LANE_X); // 0 = left, 1 = right
    const lastZ = rowZ(STEPS - 1);
    const FINISH_Z = lastZ - PANEL / 2 - 1.2 - 2.5; // center of finish platform

    // safe[i] = which side (0 left, 1 right) holds in row i
    const safe = Array.from({ length: STEPS }, () => (Math.random() < 0.5 ? 0 : 1));

    let pos = -1; // -1 = start platform; otherwise the row you're standing on
    let lives = PLAYERS;
    let timeLeft = TIME;
    let busy = false; // true while jumping / falling / auto-hopping
    let done = false;
    const timeouts = [];
    const later = (fn, ms) => timeouts.push(setTimeout(fn, ms));

    // ---------- HUD styles (removed on cleanup) ----------
    const style = document.createElement("style");
    style.textContent = `
      .gb3 { position: relative; width: 100%; user-select: none; }
      .gb3 canvas { display: block; width: 100%; border-radius: 12px; }
      .gb3-hud { position: absolute; left: 0; right: 0; top: 0; padding: 14px 16px;
                 display: flex; justify-content: space-between; align-items: center; pointer-events: none; }
      .gb3-players { display: flex; gap: 8px; }
      .gb3-player { width: 36px; height: 36px; border-radius: 50%; background: #1f7a63; color: #fff;
                    display: grid; place-items: center; font-size: .72rem; font-weight: 700;
                    border: 2px solid rgba(255,255,255,.7); }
      .gb3-player.out { background: #2a2a34; color: #666; border-color: #444; text-decoration: line-through; }
      .gb3-timer { font-size: 1.5rem; font-weight: 800; font-variant-numeric: tabular-nums;
                   text-shadow: 0 2px 8px #000; }
      .gb3-timer.low { color: var(--bad); }
      .gb3-bottom { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px;
                    display: flex; flex-direction: column; align-items: center; gap: 10px; }
      .gb3-msg { font-size: 1.05rem; text-shadow: 0 2px 6px #000; text-align: center; }
      .gb3-msg.bad { color: var(--bad); }
      .gb3-msg.good { color: var(--good); }
      .gb3-btns { display: flex; gap: 14px; }
      .gb3-btns button { min-width: 110px; font-weight: 700; opacity: .9; }
      .gb3-btns button:disabled { opacity: .35; cursor: default; }
    `;
    document.head.appendChild(style);

    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    };

    const wrap = el("div", "gb3");
    const hud = el("div", "gb3-hud");
    const playersEl = el("div", "gb3-players");
    const timerEl = el("div", "gb3-timer");
    hud.append(playersEl, timerEl);
    const bottom = el("div", "gb3-bottom");
    const msg = el("div", "gb3-msg", "← / A to jump left, → / D to jump right. Choose carefully.");
    const btns = el("div", "gb3-btns");
    const leftBtn = el("button", "", "◀ Left");
    const rightBtn = el("button", "", "Right ▶");
    leftBtn.onclick = () => choose(0);
    rightBtn.onclick = () => choose(1);
    btns.append(leftBtn, rightBtn);
    bottom.append(msg, btns);

    // ---------- three.js setup ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    wrap.append(renderer.domElement, hud, bottom);
    container.append(wrap);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06070f);
    scene.fog = new THREE.Fog(0x06070f, 20, 85);

    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);

    function resize() {
      const w = wrap.clientWidth || 800;
      const h = Math.max(320, Math.round(Math.min(w * 0.58, window.innerHeight - 170)));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    // lights
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

    // materials
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2f3d, metalness: 0.8, roughness: 0.4 });
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x3b3f58, roughness: 0.8 });
    const finishMat = new THREE.MeshStandardMaterial({ color: 0x2f5a48, roughness: 0.8 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x161925, roughness: 0.9 });
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xbfefff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3,
    });

    // platforms
    const startPlat = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 4), platformMat);
    startPlat.position.set(0, -0.25, -0.3);
    scene.add(startPlat);
    const finishPlat = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 5), finishMat);
    finishPlat.position.set(0, -0.25, FINISH_Z);
    scene.add(finishPlat);

    // steel frame
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

    // big hall: pillars + a floor far below
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

    // glass panels
    const panelGeo = new THREE.BoxGeometry(PANEL, 0.06, PANEL);
    const edgeGeo = new THREE.EdgesGeometry(panelGeo);
    const panels = []; // panels[row][side] = { mesh, edges, broken, known, stepped }
    for (let i = 0; i < STEPS; i++) {
      panels.push([0, 1].map((side) => {
        const mat = new THREE.MeshStandardMaterial({
          color: 0xaee8ff, transparent: true, opacity: 0.28, roughness: 0.05,
          metalness: 0.2, depthWrite: false, emissive: 0x000000,
        });
        const mesh = new THREE.Mesh(panelGeo, mat);
        mesh.position.set(laneX(side), 0, rowZ(i));
        mesh.userData = { row: i, side };
        const edges = new THREE.LineSegments(edgeGeo,
          new THREE.LineBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.45 }));
        mesh.add(edges);
        scene.add(mesh);
        return { mesh, edges, broken: false, known: false, stepped: false };
      }));
    }

    // ---------- players ----------
    function numberTexture(text) {
      const c = document.createElement("canvas");
      c.width = 128; c.height = 64;
      const g = c.getContext("2d");
      g.fillStyle = "#f4f4f4"; g.fillRect(0, 0, 128, 64);
      g.fillStyle = "#111"; g.font = "bold 44px sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text, 64, 35);
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      return t;
    }

    function makePlayer(num) {
      const g = new THREE.Group();
      const suit = new THREE.MeshStandardMaterial({ color: 0x1f7a63, roughness: 0.85 });
      const stripe = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
      const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48a, roughness: 0.7 });
      const hair = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 });

      const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.24);
      for (const x of [-0.13, 0.13]) {
        const leg = new THREE.Mesh(legGeo, suit);
        leg.position.set(x, 0.45, 0);
        g.add(leg);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.32), stripe);
        shoe.position.set(x, 0.05, -0.03);
        g.add(shoe);
      }
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), suit);
      torso.position.y = 1.18;
      g.add(torso);
      // white zip stripe on the front
      const zip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.01), stripe);
      zip.position.set(0, 1.18, -0.175);
      g.add(zip);
      // number patch on the back (back faces +z; the player looks toward -z)
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2),
        new THREE.MeshBasicMaterial({ map: numberTexture(num) }));
      patch.position.set(0, 1.3, 0.172);
      g.add(patch);

      const arms = [];
      for (const x of [-0.37, 0.37]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, 1.5, 0);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.66, 0.18), suit);
        arm.position.y = -0.32;
        pivot.add(arm);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), skin);
        hand.position.y = -0.68;
        pivot.add(hand);
        g.add(pivot);
        arms.push(pivot);
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), skin);
      head.position.y = 1.76;
      g.add(head);
      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair);
      hairCap.position.y = 1.78;
      g.add(hairCap);

      g.userData.arms = arms;
      scene.add(g);
      return g;
    }

    const FRONT = new THREE.Vector3(0, 0, -1.6); // where the active player waits
    const waitSpots = [FRONT, new THREE.Vector3(-1.5, 0, 0.6), new THREE.Vector3(1.5, 0, 0.6)];
    const players = NUMBERS.map((n, k) => {
      const p = makePlayer(n);
      p.position.copy(waitSpots[k]);
      return p;
    });
    const active = () => players[Math.min(PLAYERS - lives, PLAYERS - 1)];

    const panelTop = (row, side) => new THREE.Vector3(laneX(side), 0.03, rowZ(row));

    // ---------- animation state ----------
    let tween = null; // current jump
    let faller = null; // player currently falling
    const shards = [];

    function jumpTo(target, dur, height, onDone) {
      tween = { obj: active(), from: active().position.clone(), to: target.clone(), t: 0, dur, height, onDone };
    }

    function hopChain(targets, onDone) {
      if (!targets.length) return onDone();
      jumpTo(targets[0], 0.32, 0.6, () => hopChain(targets.slice(1), onDone));
    }

    // ---------- sound (synthesized, no files needed) ----------
    let actx = null;
    function audio() {
      if (!actx) {
        try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
      }
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
    function tone(freq, dur = 0.25, vol = 0.15) {
      const a = audio(); if (!a) return;
      const o = a.createOscillator(); o.type = "sine"; o.frequency.value = freq;
      const gain = a.createGain();
      gain.gain.setValueAtTime(vol, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(gain).connect(a.destination);
      o.start(); o.stop(a.currentTime + dur);
    }

    // ---------- HUD ----------
    function renderPlayers() {
      playersEl.innerHTML = "";
      NUMBERS.forEach((n, k) => {
        const out = k < PLAYERS - lives;
        playersEl.append(el("div", "gb3-player" + (out ? " out" : ""), n));
      });
    }
    function renderTimer() {
      timerEl.textContent = `⏱ ${timeLeft}`;
      timerEl.classList.toggle("low", timeLeft <= 15);
    }
    function say(text, kind = "") {
      msg.textContent = text;
      msg.className = "gb3-msg" + (kind ? " " + kind : "");
    }
    function updateButtons() {
      const off = busy || done || pos + 1 >= STEPS;
      leftBtn.disabled = off || (!off && panels[pos + 1][0].broken);
      rightBtn.disabled = off || (!off && panels[pos + 1][1].broken);
    }

    // ---------- game logic ----------
    function choose(side) {
      const row = pos + 1;
      if (busy || done || row >= STEPS) return;
      if (panels[row][side].broken) return;
      audio(); // unlock sound on first input
      busy = true;
      updateButtons();
      jumpTo(panelTop(row, side), 0.55, 1.1, () => land(row, side));
    }

    function land(row, side) {
      if (done) return;
      const p = panels[row][side];
      if (side === safe[row]) {
        p.stepped = true;
        p.mesh.material.color.set(0x8affc1);
        p.mesh.material.emissive.set(0x0b3a22);
        p.edges.material.color.set(0x3ddc84);
        pos = row;
        api.addScore(10);
        tone(660 + row * 25);
        if (pos === STEPS - 1) {
          say("Last panel… run!", "good");
          jumpTo(new THREE.Vector3(0, 0.03, FINISH_Z + 1), 0.6, 1.2, win);
          return;
        }
        say(`Row ${pos + 1} of ${STEPS}. It holds.`, "good");
        busy = false;
        updateButtons();
      } else {
        shatter(p);
        const other = panels[row][1 - side];
        other.known = true;
        other.edges.material.color.set(0x3ddc84);
        faller = { obj: active(), vy: 2, spinX: 2 + Math.random() * 2, spinZ: (Math.random() - 0.5) * 3 };
        lives--;
        renderPlayers();
        if (lives === 0) {
          say("Everyone fell. The bridge wins.", "bad");
          return endGame(1800);
        }
        say(`Player ${NUMBERS[PLAYERS - lives - 1]} fell…`, "bad");
        later(nextPlayer, 1800);
      }
    }

    function shatter(p) {
      p.broken = true;
      p.mesh.visible = false;
      shatterSound();
      const n = 5, size = PANEL / n;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(size * 0.9, 0.05, size * 0.9), shardMat);
          s.position.set(
            p.mesh.position.x - PANEL / 2 + size * (a + 0.5),
            0,
            p.mesh.position.z - PANEL / 2 + size * (b + 0.5));
          s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
          s.userData.spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
          scene.add(s);
          shards.push(s);
        }
      }
    }

    function nextPlayer() {
      if (done) return;
      const p = active();
      p.position.copy(FRONT);
      say(`Player ${NUMBERS[PLAYERS - lives]} steps up and follows the safe path…`);
      // hop along every panel the previous players proved safe
      const path = [];
      for (let r = 0; r <= pos; r++) path.push(panelTop(r, safe[r]));
      later(() => hopChain(path, () => {
        if (done) return;
        busy = false;
        say("Your turn. Left or right?");
        updateButtons();
      }), 400);
    }

    function win() {
      if (done) return;
      done = true;
      clearInterval(clock);
      api.addScore(lives * 50 + timeLeft);
      say(`You made it across with ${lives} player${lives === 1 ? "" : "s"} left!`, "good");
      [523, 659, 784, 1046].forEach((f, i) => later(() => tone(f, 0.3, 0.12), i * 120));
      endGame(1800);
    }

    function endGame(delay) {
      done = true;
      clearInterval(clock);
      updateButtons();
      later(api.gameOver, delay);
    }

    // ---------- input ----------
    function onKey(e) {
      const k = e.key.toLowerCase();
      let side = null;
      if (k === "arrowleft" || k === "a") side = 0;
      if (k === "arrowright" || k === "d") side = 1;
      if (side === null) return;
      e.preventDefault();
      choose(side);
    }
    document.addEventListener("keydown", onKey);

    // click a panel in the next row
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function onPointer(e) {
      if (pos + 1 >= STEPS) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const targets = panels[pos + 1].filter((p) => !p.broken).map((p) => p.mesh);
      const hit = ray.intersectObjects(targets, false)[0];
      if (hit) choose(hit.object.userData.side);
    }
    renderer.domElement.addEventListener("pointerdown", onPointer);

    // ---------- timer ----------
    const clock = setInterval(() => {
      if (done) return;
      timeLeft--;
      renderTimer();
      if (timeLeft <= 0) {
        say("Time's up. The bridge collapses.", "bad");
        for (const row of panels) for (const p of row) if (!p.broken) shatter(p);
        if (!faller) faller = { obj: active(), vy: 1, spinX: 2, spinZ: 1 };
        endGame(2000);
      }
    }, 1000);

    // ---------- main loop ----------
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    let followY = 0;
    let time = 0;

    function update(dt) {
      time += dt;

      // jump
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / tween.dur);
        const t = tween.t;
        tween.obj.position.lerpVectors(tween.from, tween.to, t);
        tween.obj.position.y += tween.height * 4 * t * (1 - t);
        const swing = Math.sin(Math.PI * t) * 2.2;
        tween.obj.userData.arms.forEach((a) => (a.rotation.x = -swing));
        if (t >= 1) {
          tween.obj.userData.arms.forEach((a) => (a.rotation.x = 0));
          const cb = tween.onDone;
          tween = null;
          if (cb) cb();
        }
      }

      // falling player
      if (faller) {
        faller.vy -= GRAVITY * dt;
        faller.obj.position.y += faller.vy * dt;
        faller.obj.rotation.x += faller.spinX * dt;
        faller.obj.rotation.z += faller.spinZ * dt;
        faller.obj.userData.arms.forEach((a) => (a.rotation.x = -2.6 + Math.sin(time * 20) * 0.4));
        if (faller.obj.position.y < -55) {
          faller.obj.visible = false;
          faller = null;
        }
      }

      // shards
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

      // glow the two panels you can jump to next
      const pulse = 0.55 + 0.4 * Math.sin(time * 5);
      panels.forEach((row, i) => row.forEach((p) => {
        if (p.broken || p.stepped) return;
        const isNext = !busy && !done && i === pos + 1;
        p.edges.material.opacity = isNext ? pulse : p.known ? 0.9 : 0.4;
        p.mesh.material.opacity = isNext ? 0.38 : 0.26;
      }));

      // third-person camera: behind and above the active player
      const target = (faller && faller.obj) || active();
      tmp.copy(target.position);
      if (!faller) followY += (tmp.y - followY) * Math.min(1, dt * 4);
      const camGoal = new THREE.Vector3(tmp.x * 0.6, followY + 3.4, tmp.z + 5.8);
      camPos.lerp(camGoal, Math.min(1, dt * 3.5));
      const lookGoal = faller
        ? faller.obj.position
        : new THREE.Vector3(tmp.x * 0.5, followY + 0.6, tmp.z - 5);
      camLook.lerp(lookGoal, Math.min(1, dt * (faller ? 2 : 4)));
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    }

    // start the camera in place (no swoop on load)
    camPos.set(0, 3.4, FRONT.z + 5.8);
    camLook.set(0, 0.6, FRONT.z - 5);

    const frameClock = new THREE.Clock();
    let raf = 0;
    function frame() {
      raf = requestAnimationFrame(frame);
      update(Math.min(frameClock.getDelta(), 0.05));
      renderer.render(scene, camera);
    }

    renderPlayers();
    renderTimer();
    updateButtons();
    frame();

    // ---------- cleanup when leaving the game ----------
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(clock);
      timeouts.forEach(clearTimeout);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", resize);
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
