// Scores: all-time leaderboards for every mini-game, stored online in Supabase (table "scores", see supabase/scores.sql).
// Each mini-game posts one row per player per finished game, and reads its own boards.
//
// Usage:
//   Scores.post("red-light", { mode: "normal", player: "Sam", won: true, time_ms: 41230, kills: 2, extra: { cpus: 6 } });
//   const rows = await Scores.board("red-light", "time");          // fastest first; mode "*" = all modes together
//   const rows = await Scores.board("red-light", "wins", "normal"); // or "kills"
//   // rows: [{ player, games, wins, kills, best_ms }], best first (up to 10)
//   // Scores.board throws an Error with .setup = true if the table hasn't been created in Supabase yet.
//
// Posting never throws: if you're offline, the score is kept on this device and sent with the next one.

const Scores = (() => {
  let client = null;
  const QUEUE = "scores:queue";

  function db() {
    if (!client) {
      if (typeof supabase === "undefined" || typeof CONFIG === "undefined") throw new Error("Supabase isn't loaded");
      client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
    return client;
  }
  const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE) || "[]"); } catch { return []; } };
  const saveQueue = (q) => { try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-50))); } catch {} };

  function clean(game, r) {
    const player = String(r.player || "").trim().slice(0, 24);
    if (!player) return null;
    const t = r.time_ms == null ? null : Math.round(r.time_ms);
    return {
      game: String(game).slice(0, 40),
      mode: String(r.mode || "").slice(0, 40),
      player,
      won: !!r.won,
      time_ms: t != null && t >= 1 && t <= 3600000 ? t : null,
      kills: Math.max(0, Math.min(100, Math.round(r.kills || 0))),
      extra: r.extra || {},
    };
  }

  let sending = false;
  async function flush() {
    if (sending) return;
    const q = readQueue();
    if (!q.length) return;
    sending = true;
    try {
      const { error } = await db().from("scores").insert(q);
      if (!error) saveQueue(readQueue().slice(q.length)); // (anything added meanwhile stays queued)
    } catch {} finally { sending = false; }
  }

  // Post one result. Returns a promise that resolves to true once it's saved online (false = kept for later).
  async function post(game, r) {
    const row = clean(game, r);
    if (!row) return false;
    saveQueue([...readQueue(), row]);
    await flush();
    return !readQueue().some((x) => JSON.stringify(x) === JSON.stringify(row));
  }

  const ORDER = { time: ["best_ms", true], wins: ["wins", false], kills: ["kills", false] };
  async function board(game, by = "time", mode = "*", limit = 10) {
    const [col, asc] = ORDER[by] || ORDER.time;
    let q = db().from("score_totals").select("player,games,wins,kills,best_ms").eq("game", game).eq("mode", mode);
    q = by === "time" ? q.not("best_ms", "is", null) : q.gt(col, 0);
    const { data, error } = await q.order(col, { ascending: asc }).limit(limit);
    if (error) {
      const e = new Error(error.message || "Couldn't load scores");
      if (/score_totals|does not exist|schema cache|PGRST205|42P01/i.test((error.code || "") + " " + (error.message || ""))) e.setup = true;
      throw e;
    }
    return data || [];
  }

  // send anything left over from last time (e.g. a game finished while offline)
  if (typeof window !== "undefined") setTimeout(() => { try { flush(); } catch {} }, 2000);

  return { post, board };
})();
