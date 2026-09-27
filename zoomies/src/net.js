// Phone-to-phone multiplayer. One phone hosts (and simulates the AI racers,
// items and positions); up to three friends join with a 4-letter room code.
// Connections are WebRTC data channels set up through PeerJS's free public
// broker, so no game server is needed. A BroadcastChannel transport
// (?net=local) lets two tabs in one browser play together for testing.

import { cleanNick } from './nametags.js';

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

const HEARTBEAT_MS = 1500;
const PEER_TIMEOUT_MS = 9000;

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

function peerOptions() {
  const o = {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
    },
  };
  // Optional self-hosted broker: ?peerhost=example.com&peerport=443&peerpath=/
  if (params.get('peerhost')) {
    o.host = params.get('peerhost');
    o.port = +(params.get('peerport') || 443);
    o.path = params.get('peerpath') || '/';
    o.secure = o.port === 443;
  }
  return o;
}

class PeerTransport {
  constructor(cb) {
    this.cb = cb;
    this.conns = new Map();
  }

  async start(role, code) {
    const Peer = await loadPeerJS();
    const id = `zoomies-kart-${code.toLowerCase()}`;
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
      const conn = this.peer.connect(id, { reliable: true, serialization: 'json' });
      await new Promise((res, rej) => {
        conn.once('open', res);
        this.peer.once('error', (e) => rej(e.type === 'peer-unavailable' ? new Error('No race found with that code') : e));
        setTimeout(() => rej(new Error('Could not connect. Check the code and try again.')), 15000);
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
    conn.on('data', (d) => this.cb.message(id, d));
    conn.on('close', () => {
      this.conns.delete(id);
      this.cb.leave(id);
    });
    conn.on('error', () => {});
  }

  send(to, data) {
    const c = this.conns.get(to);
    if (c && c.open) c.send(data);
  }

  broadcast(data) {
    for (const c of this.conns.values()) if (c.open) c.send(data);
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

// Same-browser transport for testing two tabs side by side.
class LocalTransport {
  constructor(cb) {
    this.cb = cb;
    this.lag = +(params.get('lag') || 0);
    this.peers = new Set();
  }

  start(role, code) {
    this.role = role;
    this.id = role === 'host' ? 'host' : `g${Math.random().toString(36).slice(2, 8)}`;
    this.ch = new BroadcastChannel(`zoomies-${code}`);
    return new Promise((res, rej) => {
      this.ch.onmessage = (e) => {
        const m = e.data;
        if (m.from === this.id || (m.to && m.to !== this.id)) return;
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
            this.cb.message(role === 'host' ? m.from : 'host', m.data);
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

  send(to, data) {
    this.ch.postMessage({ from: this.id, to, kind: 'msg', data });
  }

  broadcast(data) {
    this.ch.postMessage({ from: this.id, to: null, kind: 'msg', data });
  }

  drop(id) {
    this.peers.delete(id);
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
      message: (from, msg) => this._message(from, msg),
      join: (id) => this._join(id),
      leave: (id) => this._leave(id),
      error: (e) => { if (this.onError) this.onError(e); },
    };
    this.transport = params.get('net') === 'local' ? new LocalTransport(cb) : new PeerTransport(cb);
    this.lobby = { track: 'sprout', reverse: false, speedClass: 'zoom', difficulty: 'normal', ai: true };
    this.inRace = false;
    this.cid = clientId();
    this.seen = new Map(); // peer id -> last time we heard from them
    this.hb = setInterval(() => this._heartbeat(), HEARTBEAT_MS);
  }

  // Keep-alive both ways. The host drops players it hasn't heard from (their
  // phone slept, lost signal or left without saying so); a guest gives up on
  // a host that went quiet.
  _heartbeat() {
    if (this.closed || !this.role) return;
    const now = performance.now();
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

  async host(char, nick) {
    this.role = 'host';
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      this.code = params.get('code') || makeCode();
      try {
        await this.transport.start('host', this.code);
        this.players = [{ id: 'host', char, name: 'P1', nick: cleanNick(nick) }];
        this.me = 'host';
        return this.code;
      } catch (e) {
        lastErr = e;
        if (!(e && e.type === 'unavailable-id')) break;
      }
    }
    throw lastErr || new Error('Could not create a race');
  }

  async join(code, char, nick) {
    this.role = 'guest';
    this.code = code.toUpperCase();
    await this.transport.start('guest', this.code);
    this.meId = this.transport.peer ? this.transport.peer.id : this.transport.id;
    this.seen.set('host', performance.now());
    this.transport.send('host', { t: 'hello', char, cid: this.cid, nick: cleanNick(nick) });
  }

  send(msg) {
    if (this.closed) return;
    if (this.isHost) this.transport.broadcast(msg);
    else this.transport.send('host', msg);
  }

  sendTo(id, msg) {
    if (!this.closed) this.transport.send(id, msg);
  }

  // ---- lobby (host) ----
  broadcastLobby() {
    if (!this.isHost) return;
    this.send({ t: 'lobby', players: this.players, cfg: this.lobby });
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
    if (this.inRace || this.players.length >= MAX_PLAYERS) {
      this.sendTo(id, { t: 'full', reason: this.inRace ? 'A race is already running. Try again in a moment.' : 'This race is full.' });
      return;
    }
    // player entry is created when their hello arrives
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

  _message(from, msg) {
    if (!msg || typeof msg !== 'object') return;
    this.seen.set(from, performance.now());
    if (msg.t === 'hb') return;
    if (this.isHost) {
      if (msg.t === 'hello') {
        // Same phone connecting again: forget its old connection first.
        const dup = msg.cid && this.players.find((p) => p.cid === msg.cid && p.id !== from);
        if (dup) this._drop(dup.id);
        if (this.inRace || this.players.length >= MAX_PLAYERS) {
          this.sendTo(from, { t: 'full', reason: this.inRace ? 'A race is already running. Try again in a moment.' : 'This race is full.' });
          return;
        }
        if (!this.players.find((p) => p.id === from)) {
          const used = new Set(this.players.map((p) => p.name));
          let n = 2;
          while (used.has(`P${n}`)) n++;
          this.players.push({ id: from, cid: msg.cid, char: msg.char, name: `P${n}`, nick: cleanNick(msg.nick) });
        }
        this.broadcastLobby();
        return;
      }
      if (msg.t === 'pick') {
        const p = this.players.find((q) => q.id === from);
        if (p) p.char = msg.char;
        this.broadcastLobby();
        return;
      }
      if (msg.t === 'ready' && this.onReady) { this.onReady(from); return; }
    } else {
      if (msg.t === 'lobby') {
        this.players = msg.players;
        this.lobby = msg.cfg;
        if (this.onLobby) this.onLobby();
        return;
      }
      if (msg.t === 'full') {
        this.closed = true;
        if (this.onClosed) this.onClosed(msg.reason);
        return;
      }
      if (msg.t === 'start') { if (this.onStart) this.onStart(msg.cfg); return; }
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
