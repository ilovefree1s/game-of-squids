// Input: one set of controls for keyboard, game controllers and phones.
// Any mini-game can use it:
//
//   const input = Input.create(someElement);   // phone controls are drawn inside someElement
//   const m = input.move();       // { x, y } from -1..1  (x: right is +, y: forward/up is +)
//   if (input.jump()) { ... }      // true once per press of the jump button
//   input.showTouch(false);        // hide the phone controls (e.g. on a menu screen)
//   input.destroy();               // in your game's cleanup
//
// Keyboard:   WASD / arrow keys to move, Space to jump
// Controller: left stick or d-pad to move, A / ✕ (bottom button) to jump
// Phone:      joystick bottom-left, JUMP button bottom-right (appears automatically on touch screens)

const Input = (() => {
  const CSS = `
    .inp-touch { position: absolute; inset: 0; pointer-events: none; }
    .inp-stick { position: absolute; left: 22px; bottom: 22px; width: 130px; height: 130px; border-radius: 50%;
                 background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.25);
                 pointer-events: auto; touch-action: none; }
    .inp-knob { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px;
                border-radius: 50%; background: rgba(255,255,255,.35); }
    .inp-jump { position: absolute; right: 26px; bottom: 34px; width: 96px; height: 96px; border-radius: 50%;
                background: rgba(255,204,51,.75); color: #111; font-weight: 800; font-size: 1rem;
                display: grid; place-items: center; pointer-events: auto; touch-action: none; user-select: none; }
    .inp-jump.down { background: rgba(255,204,51,1); transform: scale(.94); }
  `;

  function create(parent, opts = {}) {
    if (!document.getElementById("inp-style")) {
      const s = document.createElement("style");
      s.id = "inp-style";
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    let jumpQueued = false;
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
    ui.append(stick, jumpBtn);
    parent.append(ui);

    let touchMove = { x: 0, y: 0 };
    let stickPointer = null;
    const R = 50;
    function stickAt(e) {
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      touchMove = { x: dx / R, y: -dy / R };
    }
    stick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      stickPointer = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      stickAt(e);
    });
    stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickPointer) stickAt(e); });
    const release = (e) => {
      if (e.pointerId !== stickPointer) return;
      stickPointer = null;
      touchMove = { x: 0, y: 0 };
      knob.style.transform = "";
    };
    stick.addEventListener("pointerup", release);
    stick.addEventListener("pointercancel", release);
    jumpBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      jumpQueued = true;
      jumpBtn.classList.add("down");
    });
    const jumpUp = () => jumpBtn.classList.remove("down");
    jumpBtn.addEventListener("pointerup", jumpUp);
    jumpBtn.addEventListener("pointercancel", jumpUp);
    jumpBtn.addEventListener("pointerleave", jumpUp);

    // show phone controls on touch screens (or once someone touches the screen)
    let isTouch = opts.touch === true ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      navigator.maxTouchPoints > 0;
    let wanted = true;
    const applyVisible = () => (ui.style.display = isTouch && wanted ? "" : "none");
    const onFirstTouch = () => { isTouch = true; applyVisible(); };
    window.addEventListener("touchstart", onFirstTouch, { passive: true });
    applyVisible();

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
      clearJump() { jumpQueued = false; },
      showTouch(on) { wanted = on; applyVisible(); },
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
