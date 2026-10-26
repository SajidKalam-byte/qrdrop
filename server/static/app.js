(function () {
  const $ = (id) => document.getElementById(id);
  const items = new Map();
  let info = null;

  // --- helpers ------------------------------------------------------------------------------
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.hidden = true), 5000);
  }

  function fmtSize(n) {
    if (n < 1024) return `${n} B`;
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
  }

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // --- item list ----------------------------------------------------------------------------
  function render() {
    const list = [...items.values()].sort((a, b) => b.created_at - a.created_at);
    $('empty').hidden = list.length > 0;
    const ul = $('items');
    ul.replaceChildren(...list.map(renderItem));
  }

  function renderItem(it) {
    const li = el('li');
    const label = it.type === 'folder' ? `${it.name}/  (${it.count} files)` : it.name;
    li.append(el('div', 'name', label));

    const uploading = it.status === 'uploading';
    const where = it.source === 'phone' ? 'from phone' : 'from computer';
    const sub = it.type === 'text' ? `text · ${fmtSize(it.size)} · ${where}` : `${fmtSize(it.size)} · ${where}`;
    li.append(el('div', 'sub', uploading ? `uploading ${fmtSize(it.received || 0)} of ${it.size ? fmtSize(it.size) : '?'}` : sub));

    const acts = el('div', 'acts');
    if (it.type === 'text') {
      const copy = el('button', null, 'Copy');
      copy.onclick = async () => { try { await navigator.clipboard.writeText(it.body); copy.textContent = 'Copied'; } catch { toast('Clipboard blocked by the browser'); } };
      acts.append(copy);
    }
    if (!uploading && it.preview) {
      const view = el('button', null, 'Preview');
      view.onclick = () => openPreview(it);
      acts.append(view);
    }
    if (!uploading) {
      const a = el('a', null, 'Download');
      a.href = `/api/items/${encodeURIComponent(it.id)}/download`;
      if (it.type !== 'text') a.setAttribute('download', '');
      acts.append(a);
    }
    const del = el('button', null, 'Delete');
    del.onclick = () => fetch(`/api/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' }).then((r) => { if (!r.ok) toast('Delete failed'); });
    acts.append(del);
    li.append(acts);

    if (it.type === 'text') li.append(el('pre', 'text', it.body));
    if (uploading && it.size) {
      const bar = el('div', 'bar');
      const fill = el('i');
      fill.style.width = `${Math.min(100, ((it.received || 0) / it.size) * 100)}%`;
      bar.append(fill);
      li.append(bar);
    }
    return li;
  }

  function onEvent(m) {
    switch (m.type) {
      case 'snapshot':
        items.clear();
        m.items.forEach((i) => items.set(i.id, i));
        $('session').textContent = `session ${m.session_id}`;
        refreshInfo();
        break;
      case 'item_added':
      case 'item_updated':
      case 'text_added':
        items.set(m.item.id, m.item);
        break;
      case 'item_removed':
        items.delete(m.id);
        break;
      case 'qr_rotated':
        refreshInfo();
        return;
      case 'wiped':
        items.clear();
        break;
    }
    render();
  }

  // --- preview (images, video, audio, PDF) ----------------------------------------------------
  const pv = $('preview-dialog');
  function openPreview(it) {
    const src = `/api/items/${encodeURIComponent(it.id)}/download?inline=1`;
    const kind = it.preview.split('/')[0];
    const node = kind === 'image' ? el('img') : kind === 'video' ? el('video') : kind === 'audio' ? el('audio') : el('iframe');
    node.src = src;
    if (kind === 'video' || kind === 'audio') { node.controls = true; node.autoplay = false; }
    if (kind === 'image') node.alt = it.name;
    $('pv-title').textContent = it.name;
    $('pv-download').href = src.replace('?inline=1', '');
    $('pv-body').replaceChildren(node);
    pv.showModal();
  }
  const closePreview = () => pv.close();
  // stops video/audio and frees the file (skip if another preview was opened before this event fired)
  pv.addEventListener('close', () => { if (!pv.open) $('pv-body').replaceChildren(); });
  $('pv-close').onclick = closePreview;
  pv.addEventListener('click', (e) => { if (e.target === pv) closePreview(); });

  // --- pairing panel (host only) -------------------------------------------------------------
  async function refreshInfo() {
    const r = await fetch('/api/info');
    if (!r.ok) return;
    info = await r.json();
    if (info.role !== 'host') return;
    $('pairing').hidden = false;
    $('pair-url').textContent = info.pair_url || 'No network detected - connect to Wi-Fi';
    $('qr').hidden = !info.pair_url;
    $('manual-pair').hidden = !info.address;
    $('pair-addr').textContent = info.address || '';
    $('pair-code').textContent = (info.pair_code || '').replace(/(\d{3})(\d{3})/, '$1 $2');
    if (info.pair_url) $('qr').src = `/api/qr.svg?t=${Date.now()}`;
    $('storage').textContent = `Files saved to ${info.storage_dir}`;
    $('fw-cmd').textContent = `netsh advfirewall firewall add rule name="qrdrop" dir=in action=allow protocol=TCP localport=${info.port}`;
    const alts = $('alts');
    alts.hidden = !info.alt_urls.length;
    alts.textContent = info.alt_urls.length ? `Other addresses (VPN/multiple adapters): ${info.alt_urls.join('  ')}` : '';
    updateFirewall();
  }

  function updateFirewall() {
    // no remote device has even knocked after 20s -> likely firewall / client isolation
    if (info && info.role === 'host') $('firewall').hidden = info.remote_seen || info.uptime + (Date.now() - fetchedAt) / 1000 < 20;
  }
  let fetchedAt = Date.now();

  setInterval(() => {
    if (!info || info.role !== 'host') return;
    const left = Math.max(0, Math.round(info.pair_expires_at - Date.now() / 1000));
    $('qr-timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  }, 1000);

  setInterval(async () => {
    if (!info || info.role !== 'host' || info.remote_seen) return;
    const r = await fetch('/api/info');
    if (r.ok) { info = await r.json(); fetchedAt = Date.now(); updateFirewall(); }
  }, 5000);

  // --- wiring -------------------------------------------------------------------------------
  // click the QR to blow it up (much easier for a phone camera to read from a screen); Esc/click closes
  $('qr-box').onclick = () => $('qr-box').classList.toggle('big');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('qr-box').classList.remove('big'); });

  $('open-folder').onclick = async () => {
    const r = await fetch('/api/open-folder', { method: 'POST' });
    if (!r.ok) toast('Could not open the folder');
  };

  const wipeDialog = $('wipe-dialog');
  $('wipe').onclick = () => {
    const n = items.size;
    $('wipe-text').textContent = n ? `${n} received ${n === 1 ? 'item' : 'items'} will be permanently removed.` : 'Nothing has been received yet.';
    wipeDialog.showModal();
  };
  wipeDialog.addEventListener('close', async () => {
    if (wipeDialog.returnValue !== 'wipe') return;
    const r = await fetch('/api/wipe', { method: 'POST' });
    if (!r.ok) toast('Wipe failed');
  });
  wipeDialog.addEventListener('click', (e) => { if (e.target === wipeDialog) wipeDialog.close('cancel'); }); // click outside = cancel

  $('text-form').onsubmit = async (e) => {
    e.preventDefault();
    const box = $('text-input');
    if (!box.value.trim()) return;
    await QrDrop.sendText(box.value);
    box.value = '';
  };
  // Enter sends (like pasting); Shift+Enter inserts a newline. Skip while an IME is composing.
  $('text-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $('text-form').requestSubmit();
    }
  });

  $('paste-btn').onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) await QrDrop.sendText(text);
      else toast('Clipboard is empty');
    } catch {
      toast('Browser blocked clipboard access here - press Ctrl+V instead');
    }
  };

  QrDrop.init({ onError: toast });
  QrWs.connect(onEvent, (up) => {
    const s = $('status');
    s.textContent = up ? 'live' : 'reconnecting';
    s.classList.toggle('off', !up);
  });
})();
