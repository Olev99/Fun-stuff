// Phone-to-phone multiplayer. One phone hosts (and simulates the AI racers,
// items and positions); up to three friends join with a 4-letter room code.
// Connections are WebRTC data channels set up through PeerJS's free public
// broker, so no game server is needed. A BroadcastChannel transport
// (?net=local) lets two tabs in one browser play together for testing.

import { cleanNick } from './nametags.js';
import { cleanLook } from './cosmetics.js';
import { cleanEvCfg } from './events.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_PLAYERS = 4;

export function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

const params = new URLSearchParams(location.search);

// Stable id for this browser tab, so a phone that connects twice (double tap,
// flaky network, reload) replaces its old lobby entry instead of adding one.
function clientId() {
  let id = null;
  try { id = sessionStorage.getItem('zoomies.cid'); } catch (e) { /* storage blocked */ }
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    try { sessionStorage.setItem('zoomies.cid', id); } catch (e) { /* ignore */ }
  }
  return id;
}

// Messages come from other people's phones: check their shape before use.
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const charId = (v) => (typeof v === 'string' && v.length <= 32 ? v : null);

// A guest's copy of the host's player list.
function cleanPlayers(list) {
  if (!Array.isArray(list) || list.length > MAX_PLAYERS) return null;
  const out = [];
  for (const p of list) {
    if (!isObj(p) || typeof p.id !== 'string' || p.id.length > 64) return null;
    out.push({ id: p.id, char: charId(p.char), name: typeof p.name === 'string' ? p.name.slice(0, 8) : '', nick: cleanNick(p.nick), look: cleanLook(p.look) });
  }
  return out;
}

// The lobby settings a guest receives from the host (shown in its lobby).
const pick = (v, list, d) => (list.includes(v) ? v : d);
export function cleanLobby(c) {
  if (!isObj(c) || typeof c.track !== 'string' || c.track.length > 32) return null;
  return { track: c.track, reverse: !!c.reverse, speedClass: pick(c.speedClass, ['chill', 'zoom', 'turbo'], 'zoom'), difficulty: pick(c.difficulty, ['easy', 'normal', 'hard'], 'normal'), ai: !!c.ai };
}

// The race setup a guest receives from the host.
export function validStart(cfg) {
  if (!isObj(cfg) || !Array.isArray(cfg.grid) || cfg.grid.length > 16 || !Array.isArray(cfg.humans) || cfg.humans.length > MAX_PLAYERS) return false;
  if (!cfg.humans.every((h) => isObj(h) && typeof h.id === 'string' && Number.isInteger(h.slot) && h.slot >= 0 && h.slot < cfg.grid.length)) return false;
  // Track events: an integer seed in range and a known mode; anything else turns them off.
  Object.assign(cfg, cleanEvCfg(cfg.evSeed, cfg.evMode));
  return true;
}

const HEARTBEAT_MS = 1500;
const PEER_TIMEOUT_MS = 9000;
const RATE = 60, BURST = 120; // messages a second we take from one phone (its kart state is 30)
const NET_MAX = 64 * 1024; // characters: no race message comes near this

// ---- the wire ----
// Every message travels as one JSON string. (PeerJS's JSON mode silently dropped anything of
// 16,300 bytes or more, such as the ghost of a run slower than about 2.5 minutes.) A long
// message goes in numbered pieces of at most FRAME characters, at worst 15 KB of UTF-8, which
// every browser's data channel takes; the other side puts them back together.
const FRAME = 5000;
export const FRAME_LIMIT = 16300; // bytes: the test transport refuses a single piece this big
export const MAX_MSG = 256 * 1024; // characters: refused when sent and when received
let wireId = 0;

export function toFrames(data) {
  const s = JSON.stringify(data);
  if (s.length <= FRAME) return [s];
  if (s.length > MAX_MSG) throw new Error(`A message was too big to send (${Math.round(s.length / 1024)} KB).`);
  const id = (wireId = (wireId + 1) % 1e6), parts = [];
  for (let a = 0; a < s.length;) {
    let e = Math.min(s.length, a + FRAME);
    const c = s.charCodeAt(e - 1);
    if (e < s.length && c >= 0xd800 && c < 0xdc00) e--; // never split an emoji's surrogate pair
    parts.push(s.slice(a, e));
    a = e;
  }
  return parts.map((p, i) => `~${id}:${i}:${parts.length}:${p}`);
}

// The receiving end: puts pieces back together and drops late or repeated fast messages.
export class Inbox {
  constructor() {
    this.parts = new Map(); // peer -> the long message coming in (pieces arrive in order)
    this.last = new Map(); // `${peer}|${type}` -> newest sequence number
  }

  // One string from a peer -> [message, size] once whole, else null.
  take(from, d) {
    if (typeof d !== 'string') return null; // shortcut: a phone on an older version (PeerJS JSON mode) is not understood; both must update
    if (d[0] === '~') {
      const m = /^~(\d{1,6}):(\d{1,3}):(\d{1,3}):/.exec(d);
      if (!m) return null;
      const id = +m[1], i = +m[2], n = +m[3];
      let a = this.parts.get(from);
      if (i === 0) {
        if (n < 2 || n > Math.ceil(MAX_MSG / (FRAME - 1))) return null;
        this.parts.set(from, (a = { id, n, got: [] }));
      }
      if (!a || a.id !== id || a.n !== n || a.got.length !== i) { this.parts.delete(from); return null; }
      a.got.push(d.slice(m[0].length));
      if (a.got.length < n) return null;
      this.parts.delete(from);
      d = a.got.join('');
    }
    if (d.length > MAX_MSG) return null;
    let msg;
    try { msg = JSON.parse(d); } catch (e) { return null; }
    if (!isObj(msg)) return null;
    // Fast messages (kart state, wheel input) are numbered: a late or repeated one is dropped.
    if (Number.isInteger(msg.q)) {
      const k = `${from}|${msg.t}`;
      if (msg.q <= (this.last.get(k) ?? -1)) return null;
      this.last.set(k, msg.q);
    }
    return [msg, d.length];
  }

  forget(from) {
    this.parts.delete(from);
    for (const k of this.last.keys()) if (k.startsWith(`${from}|`)) this.last.delete(k);
  }
}

let peerLoad = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerLoad) {
    peerLoad = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/peerjs.min.js';
      s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('PeerJS failed to load')));
      s.onerror = () => rej(new Error('Could not load the multiplayer library'));
      document.head.appendChild(s);
    });
  }
  return peerLoad;
}

// Debug-only URL switches (a self-hosted broker, PeerJS logging) are honoured
// only when the game is served from this computer, so a crafted link can't
// point real players at someone else's matchmaking server. (?net=local never
// uses PeerJS, so it needs neither.)
const devMode = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

// The servers that help two phones find a way to each other. STUN only works when one side
// can be reached directly (most home Wi-Fi); phones on carrier networks often need a TURN
// relay. A TURN entry goes here, { urls: 'turn:host:3478', username, credential }, once
// there is one of our own to use. None is configured today.
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function peerOptions() {
  const o = {
    debug: devMode && params.has('debug') ? 2 : 0,
    config: { iceServers: ICE_SERVERS },
  };
  // Optional self-hosted broker (dev only): ?peerhost=example.com&peerport=443&peerpath=/
  if (devMode && params.get('peerhost')) {
    o.host = params.get('peerhost');
    o.port = +(params.get('peerport') || 443);
    o.path = params.get('peerpath') || '/';
    o.secure = o.port === 443;
  }
  return o;
}

// Our own unreliable, unordered channel beside PeerJS's reliable one, on the same connection
// (both phones open it with this id, so it needs no signalling). Kart state and wheel input
// ride it: a lost packet is simply replaced by the next one instead of holding up the rest.
const FAST_ID = 9;

// ns keeps races and phone wheels (wheel.js) apart on the broker.
export class PeerTransport {
  constructor(cb, ns = 'kart') {
    this.cb = cb;
    this.ns = ns;
    this.conns = new Map();
    this.inbox = new Inbox();
    this.q = 0;
  }

  async start(role, code) {
    const Peer = await loadPeerJS();
    const id = `zoomies-${this.ns}-${code.toLowerCase()}`;
    if (role === 'host') {
      this.peer = new Peer(id, peerOptions());
      await new Promise((res, rej) => {
        this.peer.once('open', res);
        this.peer.once('error', rej);
        setTimeout(() => rej(new Error('Timed out reaching the matchmaking server')), 12000);
      });
      this.peer.on('connection', (conn) => {
        conn.on('open', () => {
          this.conns.set(conn.peer, conn);
          this._wire(conn, conn.peer);
          this.cb.join(conn.peer);
        });
      });
    } else {
      this.peer = new Peer(peerOptions());
      await new Promise((res, rej) => {
        this.peer.once('open', res);
        this.peer.once('error', rej);
        setTimeout(() => rej(new Error('Timed out reaching the matchmaking server')), 12000);
      });
      const conn = this.peer.connect(id, { reliable: true, serialization: 'raw' });
      // The broker found the room but no direct route opened (often a carrier network, see ICE_SERVERS).
      const apart = () => new Error(this.ns === 'kart' ? 'Found the race, but the phones could not reach each other. Try the same Wi-Fi.' : 'Found it, but the two devices could not reach each other. Try the same Wi-Fi.');
      let found = false;
      conn.on('iceStateChanged', () => { found = true; });
      await new Promise((res, rej) => {
        conn.once('open', res);
        conn.once('error', () => rej(apart()));
        this.peer.once('error', (e) => rej(e.type === 'peer-unavailable' ? new Error(this.ns === 'kart' ? 'No race found with that code. Check the code and try again.' : 'Nothing found with that code. Check the code and try again.') : e));
        setTimeout(() => rej(found ? apart() : new Error('No answer from the other phone. Check your internet connection and try again.')), 15000);
      });
      this.conns.set('host', conn);
      this._wire(conn, 'host');
    }
    this.peer.on('error', (e) => this.cb.error(e));
    this.peer.on('disconnected', () => {
      // Lost the broker only; open data channels keep working. Try to re-register quietly.
      try { this.peer.reconnect(); } catch (_) { /* ignore */ }
    });
  }

  _wire(conn, id) {
    conn.on('data', (d) => this._recv(id, d));
    conn.on('close', () => {
      this.conns.delete(id);
      this.inbox.forget(id);
      this.cb.leave(id);
    });
    conn.on('error', (e) => this.cb.error(e));
    this._fast(conn, id);
  }

  _recv(id, d) {
    const r = this.inbox.take(id, d);
    if (r) this.cb.message(id, r[0], r[1]);
  }

  // Open the fast channel. It is used once the other phone is heard on it (so it has the
  // channel too); until then, or if it never opens, everything rides the reliable channel.
  _fast(conn, id) {
    let ch;
    try {
      ch = conn.peerConnection.createDataChannel('zf', { negotiated: true, id: FAST_ID, ordered: false, maxRetransmits: 0 });
    } catch (e) { return; }
    let tries = 0;
    const timer = setInterval(() => {
      if (conn.fast || ++tries > 40 || ch.readyState === 'closed') clearInterval(timer);
      else if (ch.readyState === 'open') try { ch.send('?'); } catch (e) { /* closing */ }
    }, 250);
    ch.onmessage = (e) => {
      conn.fast = ch;
      if (e.data === '?') try { ch.send('!'); } catch (err) { /* closing */ }
      else if (e.data !== '!') this._recv(id, e.data);
    };
    ch.onclose = () => { conn.fast = null; clearInterval(timer); };
  }

  // fast: a message the next one replaces (kart state, wheel input): numbered, and sent on the
  // fast channel when there is one and the message fits in one piece.
  _frames(data, fast) {
    if (fast) data.q = ++this.q;
    try { return toFrames(data); } catch (e) { this.cb.error(e); return null; }
  }

  _out(c, frames, fast) {
    if (!frames || !c.open) return;
    const f = fast && frames.length === 1 && c.fast && c.fast.readyState === 'open' ? c.fast : null;
    if (f && f.bufferedAmount > 65536) return; // a slow link: skip this one rather than queue it
    try { for (const s of frames) (f || c).send(s); } catch (e) { this.cb.error(e); }
  }

  send(to, data, fast = false) {
    const c = this.conns.get(to);
    if (c) this._out(c, this._frames(data, fast), fast);
  }

  broadcast(data, fast = false) {
    if (!this.conns.size) return;
    const frames = this._frames(data, fast);
    for (const c of this.conns.values()) this._out(c, frames, fast);
  }

  // Host: cut off one peer (stale or duplicate connection).
  drop(id) {
    const c = this.conns.get(id);
    this.conns.delete(id);
    if (c) try { c.close(); } catch (_) { /* ignore */ }
  }

  close() {
    for (const c of this.conns.values()) try { c.close(); } catch (_) { /* ignore */ }
    this.conns.clear();
    if (this.peer) try { this.peer.destroy(); } catch (_) { /* ignore */ }
  }
}

// Same-browser transport for testing two tabs side by side. It sends the same pieces as the
// real one and refuses any single piece the real channels could not carry.
// ?lag=ms delays every message, ?loss=percent drops that share of fast messages.
export class LocalTransport {
  constructor(cb, ns = 'kart') {
    this.cb = cb;
    this.ns = ns;
    this.lag = +(params.get('lag') || 0);
    this.loss = +(params.get('loss') || 0);
    this.peers = new Set();
    this.gone = new Set(); // peers the host dropped: not heard any more
    this.inbox = new Inbox();
    this.q = 0;
  }

  start(role, code) {
    this.role = role;
    this.id = role === 'host' ? 'host' : `g${Math.random().toString(36).slice(2, 8)}`;
    this.ch = new BroadcastChannel(`zoomies-${this.ns}-${code}`);
    return new Promise((res, rej) => {
      this.ch.onmessage = (e) => {
        const m = e.data;
        if (m.from === this.id || (m.to && m.to !== this.id) || this.gone.has(m.from)) return;
        const deliver = () => {
          if (m.kind === 'hello' && role === 'host') {
            this.peers.add(m.from);
            this.ch.postMessage({ from: this.id, to: m.from, kind: 'ack' });
            this.cb.join(m.from);
          } else if (m.kind === 'ack') {
            res();
          } else if (m.kind === 'bye') {
            this.peers.delete(m.from);
            this.cb.leave(role === 'host' ? m.from : 'host');
          } else if (m.kind === 'msg') {
            const from = role === 'host' ? m.from : 'host';
            const r = this.inbox.take(from, m.data);
            if (r) this.cb.message(from, r[0], r[1]);
          }
        };
        if (this.lag) setTimeout(deliver, this.lag); else deliver();
      };
      if (role === 'host') res();
      else {
        this.ch.postMessage({ from: this.id, to: 'host', kind: 'hello' });
        setTimeout(() => rej(new Error('No race found with that code')), 4000);
      }
    });
  }

  _post(to, data, fast) {
    if (fast) data.q = ++this.q;
    let frames;
    try { frames = toFrames(data); } catch (e) { this.cb.error(e); return; }
    if (fast && frames.length === 1 && Math.random() * 100 < this.loss) return;
    for (const s of frames) this._postFrame(to, s);
  }

  _postFrame(to, s) {
    if (s.length * 3 >= FRAME_LIMIT && new TextEncoder().encode(s).length >= FRAME_LIMIT) throw new Error(`Unchunked network message of ${s.length} characters`);
    this.ch.postMessage({ from: this.id, to, kind: 'msg', data: s });
  }

  send(to, data, fast = false) {
    this._post(to, data, fast);
  }

  broadcast(data, fast = false) {
    this._post(null, data, fast);
  }

  drop(id) {
    this.peers.delete(id);
    this.gone.add(id);
    this.inbox.forget(id);
    this.ch.postMessage({ from: this.id, to: id, kind: 'bye' });
  }

  close() {
    if (this.ch) {
      this.ch.postMessage({ from: this.id, to: null, kind: 'bye' });
      this.ch.close();
    }
  }
}

export class NetSession {
  constructor(app) {
    this.app = app;
    this.role = null;
    this.code = null;
    this.players = []; // [{ id, char, name }], host first
    this.race = null; // set while racing: receives race messages
    this.onLobby = null;
    this.onClosed = null;
    this.closed = false;
    const cb = {
      message: (from, msg, size) => this._message(from, msg, size),
      join: (id) => this._join(id),
      leave: (id) => this._leave(id),
      error: (e) => { if (this.onError) this.onError(e); },
    };
    this.transport = params.get('net') === 'local' ? new LocalTransport(cb) : new PeerTransport(cb);
    this.lobby = { track: 'sprout', reverse: false, speedClass: 'zoom', difficulty: 'normal', ai: true };
    this.inRace = false;
    this.cid = clientId();
    this.seen = new Map(); // peer id -> last time we heard from them
    this.rate = new Map(); // peer id -> { n: messages it may still send, t }
    this.hb = setInterval(() => this._heartbeat(), HEARTBEAT_MS);
  }

  // Keep-alive both ways. The host drops players it hasn't heard from (their
  // phone slept, lost signal or left without saying so); a guest gives up on
  // a host that went quiet.
  _heartbeat() {
    if (this.closed || !this.role) return;
    const now = performance.now();
    // If this phone itself was frozen (building a track, app switched away),
    // the silence was ours: give everyone a fresh grace period instead of
    // dropping them.
    const stalled = this._lastHb !== undefined && now - this._lastHb > HEARTBEAT_MS * 3;
    this._lastHb = now;
    if (stalled) for (const id of this.seen.keys()) this.seen.set(id, now);
    if (this.isHost) {
      this.transport.broadcast({ t: 'hb' });
      for (const p of this.players.slice(1)) {
        const t = this.seen.get(p.id);
        if (t !== undefined && now - t > PEER_TIMEOUT_MS) this._drop(p.id);
      }
    } else if (this.seen.has('host')) {
      this.transport.send('host', { t: 'hb' });
      if (now - this.seen.get('host') > PEER_TIMEOUT_MS + 3000) {
        this.closed = true;
        if (this.onClosed) this.onClosed('Lost the connection to the host.');
      }
    }
  }

  _drop(id) {
    this.seen.delete(id);
    this.rate.delete(id);
    if (this.transport.drop) this.transport.drop(id);
    this._leave(id);
  }

  get isHost() {
    return this.role === 'host';
  }

  get isGuest() {
    return this.role === 'guest';
  }

  static supported() {
    const framed = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
    return !framed && (typeof RTCPeerConnection !== 'undefined' || params.get('net') === 'local');
  }

  async host(char, nick, look = null) {
    this.role = 'host';
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      this.code = params.get('code') || makeCode();
      try {
        await this.transport.start('host', this.code);
        this.players = [{ id: 'host', char, name: 'P1', nick: cleanNick(nick), look: cleanLook(look) }];
        this.me = 'host';
        return this.code;
      } catch (e) {
        lastErr = e;
        if (!(e && e.type === 'unavailable-id')) break;
      }
    }
    throw lastErr || new Error('Could not create a race');
  }

  async join(code, char, nick, look = null) {
    this.role = 'guest';
    this.code = code.toUpperCase();
    await this.transport.start('guest', this.code);
    this.meId = this.transport.peer ? this.transport.peer.id : this.transport.id;
    this.seen.set('host', performance.now());
    this.transport.send('host', { t: 'hello', char, cid: this.cid, nick: cleanNick(nick), look: cleanLook(look) });
  }

  // fast: kart state the next message replaces (rides the unreliable channel).
  send(msg, fast = false) {
    if (this.closed) return;
    if (this.isHost) this.transport.broadcast(msg, fast);
    else this.transport.send('host', msg, fast);
  }

  sendTo(id, msg) {
    if (!this.closed) this.transport.send(id, msg);
  }

  // ---- lobby (host) ----
  broadcastLobby() {
    if (!this.isHost) return;
    // Each phone's private id (cid) stays with the host: anyone holding it could take that seat.
    this.send({ t: 'lobby', players: this.players.map(({ cid, ...p }) => p), cfg: this.lobby });
    if (this.onLobby) this.onLobby();
  }

  setLobby(patch) {
    Object.assign(this.lobby, patch);
    this.broadcastLobby();
  }

  pickChar(char) {
    if (this.isHost) {
      this.players[0].char = char;
      this.broadcastLobby();
    } else this.send({ t: 'pick', char });
  }

  _join(id) {
    if (!this.isHost) return;
    if (this.inRace || this.players.length >= MAX_PLAYERS) this._refuse(id);
    // player entry is created when their hello arrives
  }

  // Turn a phone away, then hang up on it once the message has had time to arrive.
  _refuse(id) {
    this.sendTo(id, { t: 'full', reason: this.inRace ? 'A race is already running. Try again in a moment.' : 'This race is full.' });
    setTimeout(() => { if (!this.players.some((p) => p.id === id)) this._drop(id); }, 1000);
  }

  // At most RATE messages a second from one phone (bursts of BURST): a flood is dropped.
  _allow(from) {
    const now = performance.now();
    let b = this.rate.get(from);
    if (!b) this.rate.set(from, (b = { n: BURST, t: now }));
    b.n = Math.min(BURST, b.n + ((now - b.t) * RATE) / 1000);
    b.t = now;
    if (b.n < 1) return false;
    b.n--;
    return true;
  }

  _leave(id) {
    if (this.isHost) {
      if (!this.players.some((p) => p.id === id)) return;
      this.players = this.players.filter((p) => p.id !== id);
      if (this.race) this.race.onPeerLeft(id);
      this.broadcastLobby();
    } else if (!this.closed) {
      this.closed = true;
      if (this.onClosed) this.onClosed('The host left the race.');
    }
  }

  _message(from, msg, size = 0) {
    if (!isObj(msg) || size > NET_MAX || !this._allow(from)) return;
    // The host listens only to its players; anyone else may only say hello.
    if (this.isHost && msg.t !== 'hello' && !this.players.some((p) => p.id === from)) return;
    this.seen.set(from, performance.now());
    if (msg.t === 'hb') return;
    if (this.isHost) {
      if (msg.t === 'hello') {
        if (this.inRace) { this._refuse(from); return; }
        // Same phone connecting again: forget its old connection first.
        const dup = typeof msg.cid === 'string' && msg.cid && this.players.find((p) => p.cid === msg.cid.slice(0, 16) && p.id !== from);
        if (dup) this._drop(dup.id);
        if (this.players.length >= MAX_PLAYERS && !this.players.some((p) => p.id === from)) { this._refuse(from); return; }
        if (!this.players.find((p) => p.id === from)) {
          const used = new Set(this.players.map((p) => p.name));
          let n = 2;
          while (used.has(`P${n}`)) n++;
          this.players.push({ id: from, cid: typeof msg.cid === 'string' ? msg.cid.slice(0, 16) : null, char: charId(msg.char), name: `P${n}`, nick: cleanNick(msg.nick), look: cleanLook(msg.look) });
        }
        this.broadcastLobby();
        return;
      }
      if (msg.t === 'pick') {
        const p = this.players.find((q) => q.id === from);
        if (p && charId(msg.char)) p.char = msg.char;
        this.broadcastLobby();
        return;
      }
      if (msg.t === 'ready' && this.onReady) { this.onReady(from); return; }
    } else {
      if (msg.t === 'lobby') {
        const players = cleanPlayers(msg.players), cfg = cleanLobby(msg.cfg);
        if (!players || !cfg) return;
        this.players = players;
        this.lobby = cfg;
        if (this.onLobby) this.onLobby();
        return;
      }
      if (msg.t === 'full') {
        this.closed = true;
        if (this.onClosed) this.onClosed(typeof msg.reason === 'string' ? msg.reason.slice(0, 200) : '');
        return;
      }
      if (msg.t === 'start') { if (this.onStart && validStart(msg.cfg)) this.onStart(msg.cfg); return; }
      if (msg.t === 'go') { if (this.race) this.race.netGo(); return; }
      if (msg.t === 'toLobby') { if (this.onToLobby) this.onToLobby(); return; }
    }
    if (this.race) this.race.onNet(msg, from);
  }

  close() {
    this.closed = true;
    clearInterval(this.hb);
    this.transport.close();
  }
}
