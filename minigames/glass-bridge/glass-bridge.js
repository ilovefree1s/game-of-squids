// Glass Bridge — cross 18 rows of glass. Each row has two panels: one holds, one shatters.
// Controls: ↑ / W = top panel, ↓ / S = bottom panel, or click a glowing panel.
// You have 3 players. When one falls, the next steps up where they fell,
// and the broken row is now known. Reach the finish before the timer runs out.
//
// Scoring: +10 per safe step. Finishing adds +50 per surviving player
// and +1 per second left on the clock.

Hub.register({
  id: "glass-bridge",
  name: "Glass Bridge",
  description: "Two panels. One holds. One shatters.",
  author: "ilovefree1s",

  start(container, api) {
    const STEPS = 18;
    const PLAYERS = 3;
    const TIME = 90; // seconds

    // safe[i] is 0 (top) or 1 (bottom): the panel that holds in row i
    const safe = Array.from({ length: STEPS }, () => (Math.random() < 0.5 ? 0 : 1));

    let pos = -1; // -1 = start platform, 0..STEPS-1 = row you're standing on
    let lives = PLAYERS;
    let timeLeft = TIME;
    let busy = false; // true during a fall animation
    let done = false;
    const timeouts = [];
    const later = (fn, ms) => timeouts.push(setTimeout(fn, ms));

    // ---------- styles (scoped to this game, removed on cleanup) ----------
    const style = document.createElement("style");
    style.textContent = `
      .gb { width: 100%; max-width: 960px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
      .gb-top { display: flex; justify-content: space-between; align-items: center; }
      .gb-players { display: flex; gap: 8px; }
      .gb-player { width: 34px; height: 34px; border-radius: 50%; background: #1f8a70; color: #fff;
                   display: grid; place-items: center; font-size: .75rem; font-weight: 700; }
      .gb-player.out { background: #3a3a48; color: #777; text-decoration: line-through; }
      .gb-timer { font-size: 1.3rem; font-weight: 700; font-variant-numeric: tabular-nums; }
      .gb-timer.low { color: var(--bad); }
      .gb-bridge { display: flex; gap: 4px; align-items: stretch; padding: 40px 8px; border-radius: 10px;
                   background: linear-gradient(#0b0b14, #000); }
      .gb-pad { flex: 0 0 48px; position: relative; border-radius: 6px; background: #3a3a55; color: var(--muted);
                display: flex; align-items: center; justify-content: center;
                writing-mode: vertical-rl; font-size: .7rem; letter-spacing: .2em; }
      .gb-pad.finish { background: #2d4a3a; }
      .gb-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 18px; }
      .gb-panel { position: relative; height: 64px; padding: 0; border-radius: 4px; cursor: default;
                  border: 1px solid rgba(160, 220, 255, .3); background: rgba(150, 210, 255, .1);
                  transition: background .15s, border-color .15s, box-shadow .15s; }
      .gb-panel.next { cursor: pointer; border-color: rgba(160, 220, 255, .9); background: rgba(150, 210, 255, .25);
                       box-shadow: 0 0 10px rgba(150, 210, 255, .4); }
      .gb-panel.next:hover { background: rgba(150, 210, 255, .45); }
      .gb-panel.known { border: 2px dashed var(--good); }
      .gb-panel.safe { background: rgba(61, 220, 132, .3); border: 1px solid var(--good); box-shadow: none; }
      .gb-panel.broken { background: transparent; border: 1px dashed rgba(255, 92, 92, .5); box-shadow: none; cursor: default; }
      .gb-marker { position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px;
                   border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent);
                   transition: transform .6s ease-in, opacity .6s ease-in; pointer-events: none; }
      .gb-marker.fall { transform: translateY(180px) scale(.3); opacity: 0; }
      .gb-msg { text-align: center; color: var(--muted); min-height: 1.4em; }
      .gb-msg.bad { color: var(--bad); }
      .gb-msg.good { color: var(--good); }
    `;
    document.head.appendChild(style);

    // ---------- build the board ----------
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    };

    const root = el("div", "gb");
    const top = el("div", "gb-top");
    const playersEl = el("div", "gb-players");
    const timerEl = el("div", "gb-timer");
    top.append(playersEl, timerEl);

    const bridge = el("div", "gb-bridge");
    const startPad = el("div", "gb-pad", "START");
    bridge.append(startPad);

    const cols = []; // cols[i] = [topPanel, bottomPanel]
    for (let i = 0; i < STEPS; i++) {
      const col = el("div", "gb-col");
      const panels = [0, 1].map((side) => {
        const p = el("button", "gb-panel");
        p.setAttribute("aria-label", `Row ${i + 1} ${side === 0 ? "top" : "bottom"}`);
        p.onclick = () => choose(i, side);
        col.append(p);
        return p;
      });
      cols.push(panels);
      bridge.append(col);
    }
    const endPad = el("div", "gb-pad finish", "FINISH");
    bridge.append(endPad);

    const msg = el("div", "gb-msg", "↑ / W for the top panel, ↓ / S for the bottom. Choose carefully.");
    root.append(top, bridge, msg);
    container.append(root);

    const marker = el("div", "gb-marker");
    startPad.append(marker);

    // ---------- helpers ----------
    function renderPlayers() {
      playersEl.innerHTML = "";
      for (let n = 0; n < PLAYERS; n++) {
        const alive = n >= PLAYERS - lives;
        playersEl.append(el("div", "gb-player" + (alive ? "" : " out"), "#" + (n + 1)));
      }
    }

    function renderTimer() {
      timerEl.textContent = `⏱ ${timeLeft}s`;
      timerEl.classList.toggle("low", timeLeft <= 15);
    }

    function say(text, kind = "") {
      msg.textContent = text;
      msg.className = "gb-msg" + (kind ? " " + kind : "");
    }

    function highlightNext() {
      cols.flat().forEach((p) => p.classList.remove("next"));
      if (done || busy || pos + 1 >= STEPS) return;
      cols[pos + 1].forEach((p) => {
        if (!p.classList.contains("broken")) p.classList.add("next");
      });
    }

    function placeMarkerAtPos() {
      if (pos < 0) startPad.append(marker);
      else cols[pos][safe[pos]].append(marker);
    }

    // ---------- game logic ----------
    function choose(row, side) {
      if (done || busy || row !== pos + 1) return;
      const panel = cols[row][side];
      if (panel.classList.contains("broken")) return;

      if (side === safe[row]) {
        panel.classList.add("safe");
        panel.append(marker);
        pos = row;
        api.addScore(10);
        if (pos === STEPS - 1) return win();
        say(`Row ${pos + 1} of ${STEPS}. It holds.`, "good");
        highlightNext();
      } else {
        fall(panel, row, side);
      }
    }

    function fall(panel, row, side) {
      busy = true;
      highlightNext();
      panel.classList.add("broken");
      panel.append(marker);
      // the other panel in this row must be safe — show it to the next player
      cols[row][1 - side].classList.add("known");
      requestAnimationFrame(() => marker.classList.add("fall"));
      lives--;
      renderPlayers();

      later(() => {
        marker.classList.remove("fall");
        if (lives === 0) return lose("Everyone fell. The bridge wins.");
        placeMarkerAtPos();
        say(`Player #${PLAYERS - lives} fell. Player #${PLAYERS - lives + 1} steps up…`, "bad");
        busy = false;
        highlightNext();
      }, 700);
    }

    function win() {
      done = true;
      clearInterval(clock);
      highlightNext();
      endPad.append(marker);
      api.addScore(lives * 50 + timeLeft);
      say(`You made it across with ${lives} player${lives === 1 ? "" : "s"} left!`, "good");
      later(api.gameOver, 1200);
    }

    function lose(text) {
      done = true;
      clearInterval(clock);
      highlightNext();
      say(text, "bad");
      later(api.gameOver, 1200);
    }

    // ---------- input ----------
    function onKey(e) {
      const k = e.key.toLowerCase();
      let side = null;
      if (k === "arrowup" || k === "w") side = 0;
      if (k === "arrowdown" || k === "s") side = 1;
      if (side === null) return;
      e.preventDefault();
      choose(pos + 1, side);
    }
    document.addEventListener("keydown", onKey);

    // ---------- timer ----------
    const clock = setInterval(() => {
      if (done) return;
      timeLeft--;
      renderTimer();
      if (timeLeft <= 0) lose("Time's up. The bridge collapses.");
    }, 1000);

    renderPlayers();
    renderTimer();
    highlightNext();

    // Cleanup when leaving the game
    return () => {
      clearInterval(clock);
      timeouts.forEach(clearTimeout);
      document.removeEventListener("keydown", onKey);
      style.remove();
    };
  },
});
