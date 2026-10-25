/* One universal drop surface: dropped files/folders, pasted images, pasted text, file pickers.
 * Files are PUT as raw streams (XHR sends the disk-backed File without loading it into memory). */
(function () {
  const MAX_PARALLEL = 3;
  const queue = [];
  let running = 0;
  let onError = (m) => console.error(m);

  async function createUpload(file, relPath) {
    const r = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, size: file.size, relative_path: relPath || null, mime: file.type || null }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `Upload refused (${r.status})`);
    return (await r.json()).upload_id;
  }

  function putFile(id, file) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/uploads/${id}`);
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`${file.name}: server said ${xhr.status}`)));
      xhr.onerror = () => reject(new Error(`${file.name}: connection lost`));
      xhr.send(file);
    });
  }

  async function runOne(job) {
    try {
      const id = await createUpload(job.file, job.relPath);
      await putFile(id, job.file);
    } catch (e) {
      onError(e.message);
    }
  }

  function pump() {
    while (running < MAX_PARALLEL && queue.length) {
      running++;
      runOne(queue.shift()).finally(() => { running--; pump(); });
    }
  }

  function enqueue(file, relPath) {
    queue.push({ file, relPath });
    pump();
  }

  async function sendText(body) {
    const r = await fetch('/api/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!r.ok) onError((await r.json().catch(() => ({}))).detail || `Could not send text (${r.status})`);
  }

  // --- folder traversal ---------------------------------------------------------------------
  const readAll = (reader) => new Promise((resolve, reject) => {
    const out = [];
    (function next() {
      reader.readEntries((batch) => (batch.length ? (out.push(...batch), next()) : resolve(out)), reject);
    })();
  });

  async function walk(entry) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      enqueue(file, entry.fullPath.replace(/^\//, ''));
    } else if (entry.isDirectory) {
      for (const child of await readAll(entry.createReader())) await walk(child);
    }
  }

  function extFor(type) {
    return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' })[type] || 'bin';
  }

  // --- global listeners ---------------------------------------------------------------------
  function init(opts) {
    onError = opts.onError;
    const overlay = document.getElementById('overlay');
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');

    window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; overlay.hidden = false; } });
    window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; overlay.hidden = true; } });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });

    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      // entries must be grabbed synchronously, before the first await
      const entries = [...e.dataTransfer.items].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
      if (entries.some(Boolean)) entries.filter(Boolean).forEach((en) => walk(en).catch((err) => onError(err.message)));
      else [...e.dataTransfer.files].forEach((f) => enqueue(f));
    });

    window.addEventListener('paste', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return; // let the text box behave normally
      const items = [...(e.clipboardData?.items || [])];
      const files = items.filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean);
      if (files.length) {
        e.preventDefault();
        files.forEach((f) => {
          const generic = !f.name || /^image\.\w+$/i.test(f.name);
          const name = generic ? `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.${extFor(f.type)}` : f.name;
          enqueue(new File([f], name, { type: f.type }));
        });
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) { e.preventDefault(); sendText(text); }
    });

    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    document.getElementById('pick-files').onclick = () => fileInput.click();
    document.getElementById('pick-folder').onclick = () => folderInput.click();
    fileInput.onchange = () => { [...fileInput.files].forEach((f) => enqueue(f)); fileInput.value = ''; };
    folderInput.onchange = () => { [...folderInput.files].forEach((f) => enqueue(f, f.webkitRelativePath)); folderInput.value = ''; };
  }

  window.QrDrop = { init, sendText };
})();
