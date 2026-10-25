// Net: online rooms for multiplayer mini-games, using Supabase Realtime.
// No database tables needed: rooms are Realtime channels.
//   - presence  = who is in the room
//   - broadcast = game messages sent to everyone else in the room
//
// Usage:
//   const room = Net.joinRoom("my-game", "ABCD", "Sam", {
//     onPlayers(list) {},          // [{ id, name, joinedAt, ...extra }] oldest first
//     onMessage(data, fromId) {},  // something another player sent
//     onStatus(status) {},         // "SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"
//   });
//   room.send({ anything: 1 });   // to everyone else (not yourself)
//   room.update({ ready: true }); // change your presence info
//   room.leave();
//
// Lobby list (so players can browse open lobbies instead of typing codes):
//   const list = Net.lobbies("my-game", (lobbies) => { ... });  // [{ id, code, host, count, ... }]
//   list.advertise({ code, host: "Sam", count: 2 });  // host: show my lobby to everyone (call again to update)
//   list.hide();                                       // stop showing it
//   list.stop();                                       // in cleanup

const Net = (() => {
  let client = null;

  function getClient() {
    if (!client) {
      if (typeof supabase === "undefined") throw new Error("Supabase library didn't load (shared/lib/supabase.js)");
      client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
    return client;
  }

  // One id per browser tab, so two tabs on one computer count as two players.
  const myId = (() => {
    const make = () => Math.random().toString(36).slice(2, 10);
    try {
      let id = sessionStorage.getItem("net:id");
      if (!id) { id = make(); sessionStorage.setItem("net:id", id); }
      return id;
    } catch { return make(); }
  })();

  // extra: more info about you everyone in the room can see, e.g. { char: "knight" }
  function joinRoom(game, code, name, handlers = {}, extra = {}) {
    const c = getClient();
    const ch = c.channel(`gos-${game}-${code}`, {
      config: { broadcast: { self: false }, presence: { key: myId } },
    });
    let meta = { ...extra, name, joinedAt: Date.now() };

    function players() {
      const state = ch.presenceState();
      return Object.entries(state)
        .map(([id, metas]) => ({ ...metas[0], id }))
        .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
    }

    ch.on("presence", { event: "sync" }, () => handlers.onPlayers && handlers.onPlayers(players()));
    ch.on("broadcast", { event: "msg" }, ({ payload }) =>
      handlers.onMessage && handlers.onMessage(payload.data, payload.from));
    ch.subscribe(async (status) => {
      if (handlers.onStatus) handlers.onStatus(status);
      if (status === "SUBSCRIBED") await ch.track(meta);
    });

    return {
      id: myId,
      code,
      send(data) { ch.send({ type: "broadcast", event: "msg", payload: { from: myId, data } }); },
      update(extra) { meta = { ...meta, ...extra }; return ch.track(meta); },
      players,
      leave() { try { c.removeChannel(ch); } catch {} },
    };
  }

  function lobbies(game, onList) {
    const c = getClient();
    const ch = c.channel(`gos-${game}-lobbies`, { config: { presence: { key: myId } } });
    let meta = null;
    let subscribed = false;
    const list = () => Object.entries(ch.presenceState())
      .map(([id, metas]) => ({ ...metas[0], id }))
      .filter((l) => l.code);
    ch.on("presence", { event: "sync" }, () => onList && onList(list()));
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        subscribed = true;
        if (meta) await ch.track(meta);
        if (onList) onList(list());
      }
    });
    return {
      advertise(m) {
        const changed = JSON.stringify(m) !== JSON.stringify(meta);
        meta = m;
        if (subscribed && changed) ch.track(meta);
      },
      hide() {
        if (meta && subscribed) ch.untrack();
        meta = null;
      },
      list,
      stop() { try { c.removeChannel(ch); } catch {} },
    };
  }

  function newCode() {
    const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O (look like 1 and 0)
    let s = "";
    for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
    return s;
  }

  return { joinRoom, lobbies, newCode, id: myId };
})();
