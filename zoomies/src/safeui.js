import { buildBackup, readBackup, describeBackup, applyBackup } from './backup.js';
import { saveSettings } from './settings.js';

// The Backup and About screens (reached from Settings, the title screen's
// version label and the "back up" reminder).

const $ = (id) => document.getElementById(id);

export class SafeUI {
  constructor(app, version) {
    this.app = app;
    this.version = version;
    this.parent = null; // the screen to go back to
    this.read = null; // the backup being previewed
    this.confirmT = 0;
    $('bk-build').addEventListener('click', () => this._build());
    $('bk-copy').addEventListener('click', () => this._copy());
    $('bk-share').hidden = typeof navigator.share !== 'function';
    $('bk-share').addEventListener('click', () => navigator.share({ title: 'Zoomies backup', text: $('bk-code').value }).catch(() => {}));
    $('bk-check').addEventListener('click', () => this._check());
    $('bk-paste').addEventListener('input', () => this._clearPreview());
    $('bk-merge').addEventListener('click', () => this._apply('merge'));
    $('bk-replace').addEventListener('click', () => this._replace());
    $('ver-label').textContent = `About · v${version}`;
    $('ab-version').textContent = `Version ${version}`;
  }

  // Open 'backup', 'restore' (the same screen, aimed at the paste box), 'about' or run 'repair'.
  open(what) {
    const ui = this.app.ui;
    if (what === 'repair') {
      if (confirm('Clear the downloaded game files and reload? Your progress stays.')) this.app.pwa.repair();
      return;
    }
    if (ui.current !== 'backup' && ui.current !== 'about') this.parent = { name: ui.current, back: ui.returnTo };
    ui.returnTo = null;
    if (what === 'about') ui.show('about');
    else {
      this._clearPreview();
      $('bk-msg').textContent = '';
      ui.show('backup');
      if (what === 'restore') $('bk-restore').scrollIntoView({ block: 'nearest' });
    }
  }

  action(screen, action) {
    if (action === 'close') this.close();
    else this.open(action);
  }

  close() {
    const p = this.parent || { name: 'title' };
    this.parent = null;
    const ui = this.app.ui;
    if (p.name === 'settings') ui.overlay('settings', p.back || 'title');
    else if (p.name === 'title') ui.title();
    else ui.show(p.name);
  }

  async _build() {
    const app = this.app;
    $('bk-build').disabled = true;
    try {
      const { code, ghosts } = await buildBackup(app, { ghosts: $('bk-ghosts').checked });
      $('bk-code').value = code;
      $('bk-out').hidden = false;
      $('bk-size').textContent = `${(code.length / 1000).toFixed(code.length < 10000 ? 1 : 0)}k characters${ghosts ? `, ${ghosts} ghosts` : ''}`;
      $('bk-code').focus();
      $('bk-code').select();
      app.settings.backupAt = Date.now();
      saveSettings(app.settings);
    } catch (e) {
      $('bk-msg').textContent = 'Could not make a backup on this browser.';
    }
    $('bk-build').disabled = false;
  }

  async _copy() {
    const t = $('bk-code'), b = $('bk-copy');
    let ok = false;
    try { await navigator.clipboard.writeText(t.value); ok = true; } catch (e) {
      try { t.focus(); t.select(); ok = document.execCommand('copy'); } catch (e2) { /* select it for a manual copy */ }
    }
    b.textContent = ok ? 'Copied!' : 'Press and hold to copy';
    setTimeout(() => { b.textContent = 'Copy'; }, 2000);
  }

  _clearPreview() {
    this.read = null;
    $('bk-preview').hidden = true;
    this._resetReplace();
  }

  async _check() {
    this._clearPreview();
    const msg = $('bk-msg');
    msg.className = 'bk-msg';
    msg.textContent = 'Checking…';
    const r = await readBackup($('bk-paste').value);
    if (r.error) { msg.textContent = r.error; return; }
    this.read = r;
    const d = describeBackup(r);
    msg.className = 'bk-msg ok';
    msg.textContent = `That is a good backup${d.at ? ` from ${new Date(d.at).toLocaleDateString()}` : ''}.`;
    $('bk-facts').innerHTML = `<span>Level <b>${d.level}</b></span><span>Coins <b>${d.coins.toLocaleString('en-US')}</b></span><span>Chapters <b>${d.chapters}/${d.chaptersTotal}</b></span><span>League rank <b>${d.rank}</b></span>${d.ghosts ? `<span>Ghosts <b>${d.ghosts}</b></span>` : ''}`;
    $('bk-preview').hidden = false;
  }

  _resetReplace() {
    clearTimeout(this.confirmT);
    $('bk-replace').textContent = 'Replace this device';
  }

  // Replace throws away what is on this device, so it asks twice.
  _replace() {
    const b = $('bk-replace');
    if (b.dataset.sure) { delete b.dataset.sure; this._apply('replace'); return; }
    b.dataset.sure = '1';
    b.textContent = 'Sure? Tap again';
    clearTimeout(this.confirmT);
    this.confirmT = setTimeout(() => { delete b.dataset.sure; this._resetReplace(); }, 4000);
  }

  _apply(mode) {
    if (!this.read) return;
    applyBackup(this.app, this.read, mode);
    $('bk-msg').className = 'bk-msg ok';
    $('bk-msg').textContent = 'Restored! Restarting…';
    $('bk-preview').hidden = true;
    setTimeout(() => location.reload(), 700);
  }
}
