// Input: one set of controls for keyboard, game controllers and phones.
// Any mini-game can use it:
//
//   const input = Input.create(someElement);   // phone controls are drawn inside someElement
//   const m = input.move();       // { x, y } from -1..1  (x: right is +, y: forward/up is +)
//   if (input.jump()) { ... }      // true once per press of the jump button
//   if (input.push()) { ... }      // true once per press of the push button
//   input.setPushCharge(0.4);      // optional: show a cooldown on the phone PUSH button (0 = empty, 1 = ready)
//   input.showTouch(false);        // hide the phone controls (e.g. on a menu screen)
//   input.editLayout(onDone);      // let the player drag/resize the phone controls (saved on their device)
//   input.destroy();               // in your game's cleanup
//
// Keyboard:   WASD / arrow keys to move, Space to jump, F to push
// Controller: left stick or d-pad to move, A / ✕ (bottom button) to jump, X / □ (left button) to push
// Phone:      joystick + JUMP + PUSH buttons (appear on touch screens; players can move and resize them)

const Input = (() => {
  const CSS = `
    .inp-touch { position: absolute; inset: 0; pointer-events: none; }
    .inp-stick { position: absolute; border-radius: 50%;
                 background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.25);
                 pointer-events: auto; touch-action: none; }
    .inp-knob { position: absolute; left: 50%; top: 50%; border-radius: 50%; background: rgba(255,255,255,.35);
                transform: translate(-50%, -50%); }
    .inp-jump { position: absolute; border-radius: 50%;
                background: rgba(255,204,51,.75); color: #111; font-weight: 800;
                display: grid; place-items: center; pointer-events: auto; touch-action: none; user-select: none; }
    .inp-jump.down { background: rgba(255,204,51,1); }
    .inp-push { background: rgba(255,92,92,.75); color: #fff; }
    .inp-push.down { background: rgba(255,92,92,1); }
    .inp-touch.editing .inp-stick, .inp-touch.editing .inp-jump { outline: 3px dashed #fff; outline-offset: 4px; cursor: move; }
    .inp-edit { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); width: min(92%, 340px);
                background: rgba(20,20,31,.95); color: #f2f2f7; border-radius: 12px; padding: 12px 14px;
                display: flex; flex-direction: column; gap: 8px; pointer-events: auto; font-size: .9rem;
                box-shadow: 0 8px 30px #000; z-index: 3; }
    .inp-edit b { color: #ffcc33; }
    .inp-edit label { display: flex; align-items: center; gap: 10px; }
    .inp-edit input[type=range] { flex: 1; accent-color: #ffcc33; }
    .inp-edit .row { display: flex; gap: 8px; }
    .inp-edit button { flex: 1; font: inherit; padding: 8px; border: 0; border-radius: 8px; cursor: pointer;
                       background: #ffcc33; color: #111; font-weight: 700; }
    .inp-edit button.alt { background: #3a3a55; color: #f2f2f7; }
  `;

  // Where the phone controls sit: centers as fractions of the game area, sizes in pixels.
  const DEFAULT_LAYOUT = {
    stick: { x: 0.17, y: 0.8, size: 130 },
    jump: { x: 0.85, y: 0.8, size: 96 },
    push: { x: 0.84, y: 0.6, size: 74 },
  };
  const LAYOUT_KEY = "inp:layout";
  function loadLayout() {
    try {
      const l = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
      if (l && l.stick && l.jump) return { ...JSON.parse(JSON.stringify(DEFAULT_LAYOUT)), ...l }; // older saves have no push
    } catch {}
    return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
  }
  function saveLayout(l) { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch {} }

  function create(parent, opts = {}) {
    if (!document.getElementById("inp-style")) {
      const s = document.createElement("style");
      s.id = "inp-style";
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    let jumpQueued = false;
    let pushQueued = false;
    const keys = new Set();
    const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
    const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

    // ----- keyboard -----
    function onDown(e) {
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "spacebar") {
        e.preventDefault();
        if (!e.repeat) jumpQueued = true;
      } else if (k === "f") {
        if (!e.repeat) pushQueued = true;
      } else if (MOVE_KEYS.includes(k)) {
        e.preventDefault();
        keys.add(k);
      }
    }
    function onUp(e) { keys.delete(e.key.toLowerCase()); }
    function onBlur() { keys.clear(); }
    document.addEventListener("keydown", onDown);
    document.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);

    // ----- game controller -----
    const padJumpWas = {};
    const padPushWas = {};
    function readPads() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let best = null;
      for (const p of pads) {
        if (!p) continue;
        let x = p.axes[0] || 0, y = p.axes[1] || 0;
        if (Math.hypot(x, y) < 0.2) { x = 0; y = 0; } // dead zone
        const b = (i) => p.buttons[i] && p.buttons[i].pressed;
        if (b(14)) x = -1;
        if (b(15)) x = 1;
        if (b(12)) y = -1;
        if (b(13)) y = 1;
        const j = b(0);
        if (j && !padJumpWas[p.index]) jumpQueued = true;
        padJumpWas[p.index] = j;
        const pu = b(2);
        if (pu && !padPushWas[p.index]) pushQueued = true;
        padPushWas[p.index] = pu;
        if (!best && (x || y)) best = { x, y: -y };
      }
      return best;
    }

    // ----- phone (touch) -----
    const ui = document.createElement("div");
    ui.className = "inp-touch";
    const stick = document.createElement("div");
    stick.className = "inp-stick";
    const knob = document.createElement("div");
    knob.className = "inp-knob";
    stick.append(knob);
    const jumpBtn = document.createElement("div");
    jumpBtn.className = "inp-jump";
    jumpBtn.textContent = "JUMP";
    const pushBtn = document.createElement("div");
    pushBtn.className = "inp-jump inp-push";
    pushBtn.textContent = "PUSH";
    ui.append(stick, jumpBtn, pushBtn);
    const hasPush = opts.push !== false; // Input.create(el, { push: false }) hides the PUSH button
    if (!hasPush) pushBtn.style.display = "none";
    parent.append(ui);

    let layout = loadLayout();
    function applyLayout() {
      const place = (elem, c) => {
        elem.style.width = elem.style.height = c.size + "px";
        elem.style.left = `calc(${(c.x * 100).toFixed(2)}% - ${c.size / 2}px)`;
        elem.style.top = `calc(${(c.y * 100).toFixed(2)}% - ${c.size / 2}px)`;
      };
      place(stick, layout.stick);
      place(jumpBtn, layout.jump);
      place(pushBtn, layout.push);
      pushBtn.style.fontSize = Math.max(11, Math.round(layout.push.size * 0.19)) + "px";
      const k = Math.round(layout.stick.size * 0.43);
      knob.style.width = knob.style.height = k + "px";
      jumpBtn.style.fontSize = Math.max(12, Math.round(layout.jump.size * 0.17)) + "px";
    }
    applyLayout();

    let editing = false;
    let touchMove = { x: 0, y: 0 };
    let stickPointer = null;
    const stickRadius = () => layout.stick.size * 0.38;
    function stickAt(e) {
      const R = stickRadius();
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      touchMove = { x: dx / R, y: -dy / R };
    }
    stick.addEventListener("pointerdown", (e) => {
      if (editing) return;
      e.preventDefault();
      stickPointer = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      stickAt(e);
    });
    stick.addEventListener("pointermove", (e) => { if (!editing && e.pointerId === stickPointer) stickAt(e); });
    const release = (e) => {
      if (e.pointerId !== stickPointer) return;
      stickPointer = null;
      touchMove = { x: 0, y: 0 };
      knob.style.transform = "";
    };
    stick.addEventListener("pointerup", release);
    stick.addEventListener("pointercancel", release);
    jumpBtn.addEventListener("pointerdown", (e) => {
      if (editing) return;
      e.preventDefault();
      jumpQueued = true;
      jumpBtn.classList.add("down");
    });
    const jumpUp = () => jumpBtn.classList.remove("down");
    jumpBtn.addEventListener("pointerup", jumpUp);
    jumpBtn.addEventListener("pointercancel", jumpUp);
    jumpBtn.addEventListener("pointerleave", jumpUp);
    pushBtn.addEventListener("pointerdown", (e) => {
      if (editing) return;
      e.preventDefault();
      pushQueued = true;
      pushBtn.classList.add("down");
    });
    const pushUp = () => pushBtn.classList.remove("down");
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => pushBtn.addEventListener(ev, pushUp));

    // show phone controls on touch screens (or once someone touches the screen)
    let isTouch = opts.touch === true ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      navigator.maxTouchPoints > 0;
    let wanted = true;
    const applyVisible = () => (ui.style.display = (isTouch && wanted) || editing ? "" : "none");
    const onFirstTouch = () => { isTouch = true; applyVisible(); };
    window.addEventListener("touchstart", onFirstTouch, { passive: true });
    applyVisible();

    // ----- layout editor: drag the controls around, resize with sliders -----
    function editLayout(onDone) {
      if (editing) return;
      editing = true;
      ui.classList.add("editing");
      applyVisible();
      const panel = document.createElement("div");
      panel.className = "inp-edit";
      panel.innerHTML = `<div><b>Controls layout</b><br>Drag the joystick, JUMP and PUSH buttons to move them.</div>`;
      const slider = (label, key, min, max) => {
        const row = document.createElement("label");
        const r = document.createElement("input");
        r.type = "range"; r.min = min; r.max = max; r.value = layout[key].size;
        r.oninput = () => { layout[key].size = +r.value; applyLayout(); };
        row.append(label, r);
        panel.append(row);
        return r;
      };
      const s1 = slider("Joystick size", "stick", 80, 220);
      const s2 = slider("Jump size", "jump", 60, 180);
      const s3 = slider("Push size", "push", 50, 160);
      if (!hasPush) s3.parentElement.style.display = "none";
      const btns = document.createElement("div");
      btns.className = "row";
      const reset = document.createElement("button");
      reset.className = "alt"; reset.textContent = "Reset";
      reset.onclick = () => {
        layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
        s1.value = layout.stick.size; s2.value = layout.jump.size; s3.value = layout.push.size;
        applyLayout();
      };
      const done = document.createElement("button");
      done.textContent = "Done";
      done.onclick = () => {
        editing = false;
        ui.classList.remove("editing");
        panel.remove();
        saveLayout(layout);
        [stick, jumpBtn, pushBtn].forEach((b) => b.removeEventListener("pointerdown", dragStart));
        applyVisible();
        if (onDone) onDone();
      };
      btns.append(reset, done);
      panel.append(btns);
      ui.append(panel);

      // dragging
      let drag = null;
      function dragStart(e) {
        if (!editing) return;
        e.preventDefault();
        e.stopPropagation();
        const key = e.currentTarget === stick ? "stick" : e.currentTarget === pushBtn ? "push" : "jump";
        drag = { key, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      function dragMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const r = parent.getBoundingClientRect();
        const c = layout[drag.key];
        const half = c.size / 2;
        const x = Math.min(r.width - half, Math.max(half, e.clientX - r.left));
        const y = Math.min(r.height - half, Math.max(half, e.clientY - r.top));
        c.x = x / r.width;
        c.y = y / r.height;
        applyLayout();
      }
      const dragEnd = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
      [stick, jumpBtn, pushBtn].forEach((b) => b.addEventListener("pointerdown", dragStart));
      [stick, jumpBtn, pushBtn].forEach((b) => {
        b.addEventListener("pointermove", dragMove);
        b.addEventListener("pointerup", dragEnd);
        b.addEventListener("pointercancel", dragEnd);
      });
    }

    return {
      move() {
        const pad = readPads();
        if (touchMove.x || touchMove.y) return { ...touchMove };
        if (pad) return pad;
        let x = 0, y = 0;
        if (keys.has("a") || keys.has("arrowleft")) x -= 1;
        if (keys.has("d") || keys.has("arrowright")) x += 1;
        if (keys.has("w") || keys.has("arrowup")) y += 1;
        if (keys.has("s") || keys.has("arrowdown")) y -= 1;
        const len = Math.hypot(x, y);
        return len > 1 ? { x: x / len, y: y / len } : { x, y };
      },
      jump() {
        readPads();
        const j = jumpQueued;
        jumpQueued = false;
        return j;
      },
      push() {
        readPads();
        const p = pushQueued;
        pushQueued = false;
        return p;
      },
      clearJump() { jumpQueued = false; pushQueued = false; },
      setPushCharge(f) {
        const v = Math.max(0, Math.min(1, f));
        pushBtn.style.opacity = v >= 1 ? "" : String(0.35 + 0.4 * v);
        pushBtn.style.backgroundImage = v >= 1 ? "" :
          `conic-gradient(rgba(255,255,255,.35) ${Math.round(v * 360)}deg, transparent 0)`;
      },
      showTouch(on) { wanted = on; applyVisible(); },
      editLayout,
      get isTouch() { return isTouch; },
      destroy() {
        document.removeEventListener("keydown", onDown);
        document.removeEventListener("keyup", onUp);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("touchstart", onFirstTouch);
        ui.remove();
      },
    };
  }

  return { create };
})();
