const projectId = "sketchtiler-dev";

// ------- Markdown setup & chat helpers (same as before) -------
const elText   = document.getElementById("text");
const elImg    = document.getElementById("img");
const elSend   = document.getElementById("send");
const elSendImg= document.getElementById("sendImg");
const elPreview= document.getElementById("preview");
const elRaw    = document.getElementById("raw");
const elTabPrev= document.getElementById("tabPreview");
const elTabRaw = document.getElementById("tabRaw");
const elCopy   = document.getElementById("copyBtn");
const elStatus = document.getElementById("status");
const elNote   = document.getElementById("note");
const elAddNote= document.getElementById("addNote");
const elMemlog = document.getElementById("memlog");
const elFiles  = document.getElementById("files");
const elUploadNote = document.getElementById("uploadNote");
const elUploadBtn  = document.getElementById("uploadBtn");

marked.setOptions({
  breaks: true, gfm: true,
  highlight: (code, lang) => { try { return hljs.highlight(code, {language: lang}).value; } catch { return hljs.highlightAuto(code).value; } }
});
function renderResponse(text) {
  const clean = DOMPurify.sanitize(text ?? "");
  elPreview.innerHTML = marked.parse(clean);
  elRaw.value = text ?? "";
  document.querySelectorAll("pre code").forEach(b => hljs.highlightElement(b));
}
function setTab(which) {
  if (which === "raw") { elRaw.style.display="block"; elPreview.style.display="none"; elTabRaw.classList.add("active"); elTabPrev.classList.remove("active"); }
  else { elRaw.style.display="none"; elPreview.style.display="block"; elTabPrev.classList.add("active"); elTabRaw.classList.remove("active"); }
}
elTabPrev.onclick = () => setTab("preview");
elTabRaw.onclick  = () => setTab("raw");
elCopy.onclick    = async () => { try { await navigator.clipboard.writeText(elRaw.value || elPreview.innerText || ""); elStatus.textContent="Copied!"; } catch { elStatus.textContent="Copy failed"; } setTimeout(()=>elStatus.textContent="Ready.", 1200); };

elSend.onclick = async () => {
  const text = elText.value.trim(); if (!text) return;
  elStatus.textContent = "Sending…";
  elText.value = "";
  try {
    const r = await fetch("/api/chat",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ projectId, userText:text })});
    const data = await r.json(); renderResponse(data.text || "(no response)"); elStatus.textContent="Done.";
  } catch(e){ renderResponse("**Error:** "+e); elStatus.textContent="Error."; }
};
elSendImg.onclick = async () => {
  const text = elText.value.trim(); if (!text && (!elImg.files || elImg.files.length===0)) return;
  elStatus.textContent = "Uploading…";
  const form = new FormData(); form.append("projectId", projectId); form.append("userText", text || ""); if (elImg.files[0]) form.append("image", elImg.files[0]);
  elText.value = ""; elImg.value = "";
  try { const r = await fetch("/api/chat-with-image",{ method:"POST", body: form }); const data = await r.json(); renderResponse(data.text || "(no response)"); elStatus.textContent="Done."; }
  catch(e){ renderResponse("**Error:** "+e); elStatus.textContent="Error."; }
};
elAddNote.onclick = async () => { const note = elNote.value.trim(); if (!note) return; await fetch("/api/memory/add",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ projectId, note })}); elNote.value=""; await refreshMemory(); };
async function refreshMemory(){ const r = await fetch(`/api/memory?projectId=${encodeURIComponent(projectId)}`); const data = await r.json(); elMemlog.textContent = data.memory || "(no memory yet)"; }
elUploadBtn.onclick = async () => {
  const form = new FormData(); form.append("projectId", projectId);
  const note = elUploadNote.value.trim(); if (note) form.append("note", note);
  for (const f of elFiles.files) form.append("files", f);
  elStatus.textContent = "Uploading files…";
  try { const r = await fetch("/api/memory/upload",{ method:"POST", body: form }); const data = await r.json(); if (!data.ok) throw new Error(data.error||"upload failed"); elUploadNote.value=""; elFiles.value=""; await refreshFileList(); await refreshMemory(); elStatus.textContent="Files saved."; }
  catch(e){ renderResponse("**Upload error:** "+e.message); elStatus.textContent="Error."; }
};
async function refreshFileList(){ const r = await fetch(`/api/memory/files?projectId=${encodeURIComponent(projectId)}`); const data = await r.json(); document.getElementById("filelog").textContent = (data.files||[]).map(f=>`- ${f.originalName} (${f.mimetype}, ${f.size} bytes) stored: ${f.storedName} @${f.uploadedAt}`).join("\n") || "(no files yet)"; }

// ------- MAP GENERATOR -------
const elMapPrompt = document.getElementById("mapPrompt");
const elLoadTs    = document.getElementById("loadTileset");
const elGenMap    = document.getElementById("genMap");
const elCanvas    = document.getElementById("mapCanvas");
const elMapInfo   = document.getElementById("mapInfo");
const ctx         = elCanvas.getContext("2d");

let tilesetImg = null;
let meta = { tilesetUrl:null, tileWidth:16, tileHeight:16, spaceX:1, spaceY:1 };

elLoadTs.onclick = async () => {
  try {
    const r = await fetch(`/api/memory/tileset-meta?projectId=${encodeURIComponent(projectId)}`);
    const data = await r.json();
    if (!data.ok || !data.tilesetUrl) { elMapInfo.textContent = "No tileset found. Ingest or upload one first."; return; }
    meta = data;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { tilesetImg = img; elMapInfo.textContent = `Tileset loaded: ${meta.tilesetUrl} | tile ${meta.tileWidth}x${meta.tileHeight} spacing ${meta.spaceX}x${meta.spaceY}`; };
    img.onerror = () => { elMapInfo.textContent = "Failed to load tileset image."; };
    img.src = data.tilesetUrl;
  } catch (e) {
    elMapInfo.textContent = "Error loading tileset: " + e.message;
  }
};

elGenMap.onclick = async () => {
  const prompt = elMapPrompt.value.trim();
  if (!prompt) { elMapInfo.textContent = "Enter a prompt."; return; }
  try {
    const r = await fetch("/api/map/generate", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ projectId, prompt })
    });
    const data = await r.json();
    if (!data.ok) { elMapInfo.textContent = data.error || "Failed to generate map."; return; }
    drawMap(data.map);
  } catch (e) {
    elMapInfo.textContent = "Error: " + e.message;
  }
};

function drawMap(map) {
  // Resize canvas to map size in pixels
  const pxW = map.width * meta.tileWidth + (map.width - 1) * 0; // no gaps in final map
  const pxH = map.height * meta.tileHeight + (map.height - 1) * 0;
  elCanvas.width = pxW; elCanvas.height = pxH;

  // clear
  ctx.fillStyle = "#f8fafc"; ctx.fillRect(0,0,pxW,pxH);

  // simple checker background to see empties
  for (let y=0;y<map.height;y++){
    for (let x=0;x<map.width;x++){
      if ((x+y)%2===0) { ctx.fillStyle="#ffffff"; } else { ctx.fillStyle="#f4f4f5"; }
      ctx.fillRect(x*meta.tileWidth, y*meta.tileHeight, meta.tileWidth, meta.tileHeight);
    }
  }

  if (!tilesetImg) { elMapInfo.textContent = "Tileset not loaded. Click 'Load Tileset' first."; return; }

  // draw each tile: (col,row) indexes into atlas with spacing
  for (const t of map.tiles) {
    const sx = t.col * (meta.tileWidth + meta.spaceX) + 0; // assume 1px outer margin = 0 here
    const sy = t.row * (meta.tileHeight + meta.spaceY) + 0;
    const dx = t.x * meta.tileWidth;
    const dy = t.y * meta.tileHeight;
    ctx.drawImage(tilesetImg, sx, sy, meta.tileWidth, meta.tileHeight, dx, dy, meta.tileWidth, meta.tileHeight);
  }

  elMapInfo.textContent = `Rendered ${map.tiles.length} tiles on ${map.width}×${map.height} grid.`;
}

// initial
setTab("preview");
renderResponse("👋 Ready. Markdown responses will render here.");
refreshMemory();
refreshFileList();
