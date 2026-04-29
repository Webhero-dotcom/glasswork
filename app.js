/* GLASSWORK v3 — Daily Planner */

const STORE_KEY = "glasswork.v3";
const THEME_KEY = "glasswork.theme";
const NAME_KEY = "glasswork.name";
const CUSTOM_KEY = "glasswork.custom";

let state = loadState();
let currentView = "todo";
let editingId = null;
let expandedWorkId = null;
let saveTimer = null;

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){
      const s = JSON.parse(raw);
      s.tasks = s.tasks || [];
      s.workingId = s.workingId || null;
      s.notes = s.notes || [];
      s.activeNoteId = s.activeNoteId || null;
      return s;
    }
  }catch(e){}
  return { tasks:[], workingId:null, notes:[], activeNoteId:null };
}
function saveState(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }catch(e){} }
function saveSoon(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 250); }

const savedTheme = localStorage.getItem(THEME_KEY) || "iridescent";
document.documentElement.setAttribute("data-theme", savedTheme);
let userName = localStorage.getItem(NAME_KEY) || "Priyanshu";
let custom = {};
try{ custom = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "{}"); }catch(e){ custom = {}; }

function applyCustom(){
  const bg = document.getElementById("bgEl");
  if(custom.wallpaper){
    bg.style.setProperty("--custom-bg", `url("${custom.wallpaper}")`);
    bg.classList.add("has-custom");
    document.getElementById("wallpaperReset")?.classList.remove("hidden");
  } else {
    bg.classList.remove("has-custom");
    bg.style.removeProperty("--custom-bg");
    document.getElementById("wallpaperReset")?.classList.add("hidden");
  }
  if(custom.accent){
    document.documentElement.style.setProperty("--accent", custom.accent);
    document.documentElement.style.setProperty("--accent-soft", hexA(custom.accent, 0.35));
    document.documentElement.style.setProperty("--accent-glow", hexA(custom.accent, 0.55));
    document.getElementById("accentReset")?.classList.remove("hidden");
    const ai = document.getElementById("accentInput");
    if(ai) ai.value = custom.accent;
  } else {
    document.documentElement.style.removeProperty("--accent");
    document.documentElement.style.removeProperty("--accent-soft");
    document.documentElement.style.removeProperty("--accent-glow");
    document.getElementById("accentReset")?.classList.add("hidden");
  }
}
function hexA(hex, a){
  const m = hex.replace('#','').match(/.{2}/g);
  if(!m || m.length<3) return hex;
  const [r,g,b] = m.map(x=>parseInt(x,16));
  return `rgba(${r},${g},${b},${a})`;
}
applyCustom();

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const uid = ()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const escapeHTML = s=>!s?"":String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function formatDate(iso){ if(!iso)return""; return new Date(iso).toLocaleDateString(undefined,{month:"short",day:"numeric"}); }

document.getElementById("todayDate").textContent =
  new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});

function toast(msg, withCheck=true){
  const t = $("#toast");
  t.innerHTML = (withCheck?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ':"") + escapeHTML(msg);
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.classList.remove("show"), 2000);
}

function refreshTopbar(){
  const titleEl = $("#topTitle");
  const subEl = $("#topSub");
  subEl.style.display = "none";
  if(currentView === "todo"){
    const n = state.tasks.filter(t=>t.status==="pending").length;
    titleEl.innerHTML = `To-Do <span class="count">${n}</span>`;
  } else if(currentView === "working"){
    const w = state.tasks.find(t=>t.id===state.workingId && t.status==="working");
    if(w){
      titleEl.innerHTML = `Yay! <span class="name">${escapeHTML(userName)}</span> is doing <span class="arrow">→</span> <span class="task">${escapeHTML(w.title)}</span>`;
      subEl.style.display = "block";
      subEl.innerHTML = "Proud of you ✨";
    } else {
      const q = state.tasks.filter(t=>t.status==="queued"||t.status==="working").length;
      titleEl.innerHTML = `Working <span class="count">${q}</span>`;
      if(q>0){ subEl.style.display="block"; subEl.innerHTML = "Click any card to start working on it."; }
    }
  } else if(currentView === "brainstorm"){
    titleEl.innerHTML = `Brainstorm <span class="count">${state.notes.length}</span>`;
  } else if(currentView === "completed"){
    const n = state.tasks.filter(t=>t.status==="completed"||t.status==="completing").length;
    titleEl.innerHTML = `Completed <span class="count">${n}</span>`;
  }
}

function setView(v){
  currentView = v;
  expandedWorkId = null;
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===v));
  renderView();
  refreshTopbar();
}
function renderView(){
  const v = $("#view");
  v.innerHTML = "";
  const inner = document.createElement("div");
  inner.className = "view-inner";
  if(currentView==="todo") inner.appendChild(renderTodo());
  else if(currentView==="working") inner.appendChild(renderWorking());
  else if(currentView==="brainstorm") inner.appendChild(renderBrainstorm());
  else if(currentView==="completed") inner.appendChild(renderCompleted());
  v.appendChild(inner);
}

/* ===== TODO ===== */
function renderTodo(){
  const wrap = document.createElement("div");
  const addBar = document.createElement("form");
  addBar.className = "add-bar glass";
  addBar.innerHTML = `
    <input id="quickAdd" placeholder="Add a task — enter to save, or + for details" autocomplete="off" />
    <button type="button" class="add" id="quickDetails"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`;
  addBar.addEventListener("submit", e=>{
    e.preventDefault();
    const inp = addBar.querySelector("#quickAdd");
    const title = inp.value.trim();
    if(!title) return;
    addTask({ title });
    inp.value = "";
    toast("Task added");
  });
  addBar.querySelector("#quickDetails").addEventListener("click", ()=>{
    const v = addBar.querySelector("#quickAdd").value.trim();
    openSheet(null, v);
  });
  wrap.appendChild(addBar);

  const pending = state.tasks.filter(t=>t.status==="pending");
  if(pending.length === 0){
    wrap.appendChild(makeEmpty("Nothing on your list yet.", "Add one above. Drag to reorder. Double-click to start working on it."));
    return wrap;
  }
  const grid = document.createElement("div");
  grid.className = "task-grid";
  pending.forEach((t,i)=>{
    const c = makeTodoCard(t);
    c.style.animationDelay = (i*30)+"ms";
    grid.appendChild(c);
  });
  wrap.appendChild(grid);
  return wrap;
}
function makeTodoCard(t){
  const c = document.createElement("div");
  c.className = "task-card glass";
  c.dataset.id = t.id;
  c.dataset.pri = t.priority || "medium";
  c.draggable = true;
  c.innerHTML = `
    <h3>${escapeHTML(t.title)}</h3>
    ${t.desc?`<p>${escapeHTML(t.desc)}</p>`:""}
    <div class="meta">
      ${t.tag?`<span class="tag">${escapeHTML(t.tag)}</span>`:""}
      ${t.due?`<span>📅 ${formatDate(t.due)}</span>`:""}
    </div>
    <button class="start-btn">Start <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>`;
  c.querySelector(".start-btn").addEventListener("click", e=>{ e.stopPropagation(); startTask(t.id); });
  c.addEventListener("dblclick", e=>{ if(e.target.closest("button")) return; startTask(t.id); });
  attachDrag(c, t.id);
  attachLongPress(c, t.id, "todo");
  return c;
}
function attachDrag(card, id){
  card.addEventListener("dragstart", e=>{
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setTimeout(()=>card.classList.add("dragging"), 0);
  });
  card.addEventListener("dragend", ()=>{
    card.classList.remove("dragging");
    $$(".task-card").forEach(c=>c.classList.remove("drag-above","drag-below"));
  });
  card.addEventListener("dragover", e=>{
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const dragging = document.querySelector(".task-card.dragging");
    if(!dragging || dragging===card) return;
    const r = card.getBoundingClientRect();
    const above = e.clientY < r.top + r.height/2;
    card.classList.toggle("drag-above", above);
    card.classList.toggle("drag-below", !above);
  });
  card.addEventListener("dragleave", ()=>{ card.classList.remove("drag-above","drag-below"); });
  card.addEventListener("drop", e=>{
    e.preventDefault();
    const dragId = e.dataTransfer.getData("text/plain");
    const above = card.classList.contains("drag-above");
    card.classList.remove("drag-above","drag-below");
    if(dragId === id) return;
    reorderTodo(dragId, id, above);
  });
}
function reorderTodo(dragId, targetId, above){
  const idxFrom = state.tasks.findIndex(t=>t.id===dragId);
  if(idxFrom < 0) return;
  const [item] = state.tasks.splice(idxFrom, 1);
  let idxTo = state.tasks.findIndex(t=>t.id===targetId);
  if(idxTo < 0){ state.tasks.unshift(item); }
  else { state.tasks.splice(above ? idxTo : idxTo+1, 0, item); }
  saveState();
  renderView();
}

/* ===== WORKING ===== */
function renderWorking(){
  const wrap = document.createElement("div");
  const items = state.tasks.filter(t=>t.status==="queued"||t.status==="working");
  if(items.length === 0){
    wrap.appendChild(makeEmpty("No tasks queued up yet.", "Open <strong>To-Do</strong>, double-click any task — it lands here as <em>Queued Up</em>. Click one to make it <em>Working On</em>."));
    return wrap;
  }
  items.sort((a,b)=>{
    if(a.status==="working" && b.status!=="working") return -1;
    if(b.status==="working" && a.status!=="working") return 1;
    return (a.startedAt||0) - (b.startedAt||0);
  });
  const grid = document.createElement("div");
  grid.className = "work-grid";
  items.forEach((t,i)=>{
    const c = makeWorkCard(t);
    c.style.animationDelay = (i*30)+"ms";
    grid.appendChild(c);
  });
  wrap.appendChild(grid);
  return wrap;
}
function makeWorkCard(t){
  const c = document.createElement("div");
  const isWorking = t.status === "working";
  const isExpanded = expandedWorkId === t.id;
  c.className = "work-card glass " + (isWorking ? "working" : "queued") + (isExpanded ? " expanded" : "");
  c.dataset.id = t.id;
  const subN = (t.subtasks||[]).length;
  const subDone = (t.subtasks||[]).filter(s=>s.done).length;
  c.innerHTML = `
    <span class="status"><span class="dot"></span>${isWorking ? "Working On" : "Queued Up"}</span>
    <h3>${escapeHTML(t.title)}</h3>
    ${t.desc?`<p>${escapeHTML(t.desc)}</p>`:""}
    <div class="expanded">
      <div class="ex-divider"></div>
      <div class="ex-section-title">Subtasks${subN?` · ${subDone}/${subN}`:""}</div>
      <div class="sub-list" data-tid="${t.id}"></div>
      <div class="add-subtask">
        <input class="sub-add" placeholder="Break it down..." />
        <button class="sub-add-btn">Add</button>
      </div>
      <div class="work-actions">
        <button class="complete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Mark complete</button>
        <button class="secondary edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>Edit</button>
        <button class="secondary back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>Back to list</button>
      </div>
    </div>`;
  let clickT = null;
  c.addEventListener("click", e=>{
    if(e.target.closest(".expanded")) return;
    if(clickT) return;
    clickT = setTimeout(()=>{ clickT = null; setWorking(t.id); }, 230);
  });
  c.addEventListener("dblclick", e=>{
    if(e.target.closest(".expanded")) return;
    clearTimeout(clickT); clickT = null;
    setWorking(t.id);
    expandedWorkId = (expandedWorkId === t.id) ? null : t.id;
    renderView();
  });
  if(isExpanded){
    setTimeout(()=>{
      renderSubtasks(t);
      const sa = c.querySelector(".sub-add");
      const sab = c.querySelector(".sub-add-btn");
      const addSub = ()=>{
        const v = sa.value.trim(); if(!v) return;
        t.subtasks = t.subtasks || [];
        t.subtasks.push({ id: uid(), text: v, done: false });
        sa.value = ""; saveState(); renderSubtasks(t);
      };
      sab.addEventListener("click", addSub);
      sa.addEventListener("keydown", e=>{ if(e.key==="Enter") addSub(); });
      c.querySelector(".complete").addEventListener("click", ev=>{ ev.stopPropagation(); completeTask(t.id, c); });
      c.querySelector(".edit").addEventListener("click", ev=>{ ev.stopPropagation(); openSheet(t.id); });
      c.querySelector(".back").addEventListener("click", ev=>{ ev.stopPropagation(); backToList(t.id); });
    }, 0);
  }
  attachLongPress(c, t.id, "working");
  return c;
}
function renderSubtasks(t){
  const list = document.querySelector(`.sub-list[data-tid="${t.id}"]`);
  if(!list) return;
  list.innerHTML = "";
  (t.subtasks||[]).forEach(s=>{
    const row = document.createElement("div");
    row.className = "subtask-item" + (s.done ? " done" : "");
    row.innerHTML = `
      <div class="checkbox ${s.done?"checked":""}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
      <span>${escapeHTML(s.text)}</span>
      <button class="del"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    row.querySelector(".checkbox").addEventListener("click", ()=>{ s.done = !s.done; saveState(); renderSubtasks(t); });
    row.querySelector(".del").addEventListener("click", ()=>{ t.subtasks = t.subtasks.filter(x=>x.id!==s.id); saveState(); renderSubtasks(t); });
    list.appendChild(row);
  });
}

/* ===== BRAINSTORM ===== */
function renderBrainstorm(){
  const wrap = document.createElement("div");
  wrap.className = "notes-wrap";
  const list = document.createElement("aside");
  list.className = "notes-list glass";
  list.innerHTML = `<div class="notes-list-header"><span>Notes · ${state.notes.length}</span><button id="newNote"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button></div><div id="noteListItems"></div>`;
  wrap.appendChild(list);
  const editor = document.createElement("section");
  editor.className = "notes-editor glass";
  editor.id = "noteEditor";
  wrap.appendChild(editor);
  setTimeout(()=>{
    list.querySelector("#newNote").addEventListener("click", ()=>{
      const n = { id: uid(), title: "", content: "", createdAt: Date.now(), updatedAt: Date.now() };
      state.notes.unshift(n);
      state.activeNoteId = n.id;
      saveState();
      renderView();
      refreshTopbar();
      setTimeout(()=>{ const ti = document.querySelector(".note-title"); if(ti) ti.focus(); }, 100);
    });
    paintNotesList();
    paintNoteEditor();
  }, 0);
  return wrap;
}
function paintNotesList(){
  const items = document.getElementById("noteListItems");
  if(!items) return;
  items.innerHTML = "";
  if(state.notes.length === 0){
    items.innerHTML = `<div style="font-size:12px;color:var(--text-faint);padding:12px;text-align:center">No notes yet — tap +</div>`;
    return;
  }
  state.notes.forEach(n=>{
    const it = document.createElement("div");
    it.className = "note-item" + (n.id === state.activeNoteId ? " active" : "");
    const title = (n.title || "").trim() || "Untitled";
    const preview = (n.content || "").trim().split("\n")[0].slice(0,40) || "Empty note";
    it.innerHTML = `<div class="nt">${escapeHTML(title)}</div><div class="np">${escapeHTML(preview)}</div>`;
    it.addEventListener("click", ()=>{ state.activeNoteId = n.id; saveState(); paintNotesList(); paintNoteEditor(); });
    items.appendChild(it);
  });
}
function paintNoteEditor(){
  const e = document.getElementById("noteEditor");
  if(!e) return;
  const n = state.notes.find(x=>x.id===state.activeNoteId);
  if(!n){
    e.innerHTML = `<div class="notes-empty">Pick a note from the left, or tap <strong>+</strong> to start a new one.</div>`;
    return;
  }
  e.innerHTML = `
    <input type="text" class="note-title" placeholder="Untitled" maxlength="80" />
    <textarea class="note-body" placeholder="Type freely. Anything goes — ideas, scratch, lists, links, brain dumps. Saves as you type."></textarea>
    <div class="note-meta"><button class="delete-note">Delete note</button><span class="save-status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved</span></div>`;
  const ti = e.querySelector(".note-title");
  const bo = e.querySelector(".note-body");
  const stat = e.querySelector(".save-status");
  ti.value = n.title || "";
  bo.value = n.content || "";
  let dt = null;
  const flag = ()=>{ stat.classList.add("visible"); clearTimeout(dt); dt = setTimeout(()=>stat.classList.remove("visible"), 900); };
  ti.addEventListener("input", ()=>{ n.title = ti.value; n.updatedAt = Date.now(); saveSoon(); flag(); paintNotesList(); });
  bo.addEventListener("input", ()=>{ n.content = bo.value; n.updatedAt = Date.now(); saveSoon(); flag(); paintNotesList(); });
  e.querySelector(".delete-note").addEventListener("click", ()=>{
    if(!confirm("Delete this note?")) return;
    state.notes = state.notes.filter(x=>x.id!==n.id);
    state.activeNoteId = state.notes[0]?.id || null;
    saveState(); renderView(); refreshTopbar();
    toast("Note deleted");
  });
}

/* ===== COMPLETED ===== */
function renderCompleted(){
  const wrap = document.createElement("div");
  const completed = state.tasks.filter(t=>t.status==="completed"||t.status==="completing");
  const today = completed.filter(t=>t.completedAt && new Date(t.completedAt).toDateString()===new Date().toDateString()).length;
  const week = completed.filter(t=>t.completedAt && (Date.now()-t.completedAt)<7*24*3600*1000).length;
  const stats = document.createElement("div");
  stats.className = "stats";
  stats.innerHTML = `<div class="stat-card glass"><div class="num">${today}</div><div class="lbl">Today</div></div><div class="stat-card glass"><div class="num">${week}</div><div class="lbl">This week</div></div><div class="stat-card glass"><div class="num">${completed.length}</div><div class="lbl">All time</div></div>`;
  wrap.appendChild(stats);
  if(completed.length === 0){
    wrap.appendChild(makeEmpty("Nothing finished yet.", "Mark tasks done in the Working tab — they'll quietly land here."));
    return wrap;
  }
  const grid = document.createElement("div");
  grid.className = "task-grid";
  completed.sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
  completed.forEach((t,i)=>{
    const c = document.createElement("div");
    c.className = "task-card glass completed-style";
    c.dataset.id = t.id;
    c.dataset.pri = t.priority || "medium";
    c.innerHTML = `
      <h3>${escapeHTML(t.title)}</h3>
      ${t.desc?`<p>${escapeHTML(t.desc)}</p>`:""}
      <div class="meta">${t.tag?`<span class="tag">${escapeHTML(t.tag)}</span>`:""}<span>✓ ${formatDate(new Date(t.completedAt).toISOString())}</span></div>
      <div class="row-actions">
        <button data-act="restore"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/></svg>Restore</button>
        <button data-act="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>Delete</button>
      </div>`;
    c.style.animationDelay = (i*25)+"ms";
    c.querySelector('[data-act="restore"]').addEventListener("click", e=>{
      e.stopPropagation();
      t.status = "pending"; delete t.completedAt; delete t.autoMoveAt; delete t.startedAt;
      saveState(); renderView(); refreshTopbar(); toast("Restored to To-Do");
    });
    c.querySelector('[data-act="delete"]').addEventListener("click", e=>{
      e.stopPropagation();
      state.tasks = state.tasks.filter(x=>x.id!==t.id);
      saveState(); renderView(); refreshTopbar(); toast("Deleted");
    });
    grid.appendChild(c);
  });
  wrap.appendChild(grid);
  return wrap;
}

function makeEmpty(title, msg){
  const e = document.createElement("div");
  e.className = "empty";
  e.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M4 9h16"/><path d="M9 14l2 2 4-4"/></svg><h2>${title}</h2><p>${msg}</p>`;
  return e;
}

/* ===== TASK ACTIONS ===== */
function addTask(p){
  const t = { id: uid(), title: p.title || "Untitled", desc: p.desc || "", priority: p.priority || "medium", tag: p.tag || "", due: p.due || "", status: "pending", createdAt: Date.now(), subtasks: [] };
  state.tasks.unshift(t);
  saveState();
  if(currentView === "todo") renderView();
  refreshTopbar();
  return t;
}
function startTask(id){
  const t = state.tasks.find(x=>x.id===id);
  if(!t) return;
  t.status = "queued";
  t.startedAt = Date.now();
  saveState();
  setView("working");
  toast("Moved to Working — Queued Up");
}
function setWorking(id){
  const t = state.tasks.find(x=>x.id===id);
  if(!t) return;
  state.tasks.forEach(x=>{ if(x.status === "working" && x.id !== id) x.status = "queued"; });
  t.status = "working";
  state.workingId = id;
  saveState();
  renderView();
  refreshTopbar();
}
function backToList(id){
  const t = state.tasks.find(x=>x.id===id);
  if(!t) return;
  t.status = "pending";
  delete t.startedAt;
  if(state.workingId === id) state.workingId = null;
  expandedWorkId = null;
  saveState();
  renderView();
  refreshTopbar();
  toast("Moved back to To-Do");
}
function completeTask(id, cardEl){
  const t = state.tasks.find(x=>x.id===id);
  if(!t || t.status === "completed" || t.status === "completing") return;
  t.status = "completing";
  t.completedAt = Date.now();
  t.autoMoveAt = Date.now() + 5*60*1000;
  if(state.workingId === id) state.workingId = null;
  expandedWorkId = null;
  saveState();
  burst();
  toast("Nice! Moves to ✓ in 5 min");
  if(cardEl){
    cardEl.classList.add("completing");
    setTimeout(()=>{ renderView(); refreshTopbar(); }, 1000);
  } else {
    setTimeout(()=>{ renderView(); refreshTopbar(); }, 50);
  }
}
function autoMoveSweep(){
  const now = Date.now(); let changed = false;
  state.tasks.forEach(t=>{ if(t.status==="completing" && t.autoMoveAt && now>=t.autoMoveAt){ t.status="completed"; changed=true; } });
  if(changed){ saveState(); if(currentView==="completed") renderView(); refreshTopbar(); }
}
setInterval(autoMoveSweep, 30*1000);
autoMoveSweep();

/* ===== SHEET ===== */
const sheet = $("#sheet");
const scrim = $("#scrim");
function openSheet(id, prefillTitle=""){
  editingId = id;
  const t = id ? state.tasks.find(x=>x.id===id) : null;
  $("#sheetTitle").textContent = id ? "Edit task" : "New task";
  $("#sheetDelete").classList.toggle("hidden", !id);
  $("#f-title").value = t ? t.title : (prefillTitle || "");
  $("#f-desc").value = t ? (t.desc||"") : "";
  $("#f-tag").value = t ? (t.tag||"") : "";
  $("#f-due").value = t ? (t.due||"") : "";
  const pri = t ? (t.priority||"medium") : "medium";
  $$(".pri-btn").forEach(b=>b.classList.toggle("active", b.dataset.pri===pri));
  scrim.classList.add("open"); sheet.classList.add("open");
  setTimeout(()=>$("#f-title").focus(), 200);
}
function closeSheet(){ scrim.classList.remove("open"); sheet.classList.remove("open"); editingId = null; }
$("#sheetCancel").addEventListener("click", closeSheet);
scrim.addEventListener("click", closeSheet);
$("#sheetDelete").addEventListener("click", ()=>{
  if(!editingId) return;
  state.tasks = state.tasks.filter(x=>x.id!==editingId);
  if(state.workingId===editingId) state.workingId = null;
  saveState(); closeSheet(); renderView(); refreshTopbar();
  toast("Deleted");
});
$("#sheetSave").addEventListener("click", ()=>{
  const title = $("#f-title").value.trim();
  if(!title){ $("#f-title").focus(); return; }
  const data = { title, desc: $("#f-desc").value.trim(), tag: $("#f-tag").value.trim(), due: $("#f-due").value, priority: $$(".pri-btn").find(b=>b.classList.contains("active"))?.dataset.pri || "medium" };
  if(editingId){ const t = state.tasks.find(x=>x.id===editingId); if(t) Object.assign(t, data); }
  else { addTask(data); }
  saveState(); closeSheet(); renderView(); refreshTopbar();
  toast(editingId ? "Saved" : "Task added");
});
$$(".pri-btn").forEach(b=>b.addEventListener("click", ()=>{ $$(".pri-btn").forEach(x=>x.classList.remove("active")); b.classList.add("active"); }));

/* ===== CONTEXT MENU ===== */
const ctx = $("#ctxMenu");
let ctxTaskId = null;
function buildCtxMenu(context, task){
  const items = [];
  if(context === "todo"){
    items.push({ act:"start", label:"Start working", icon:'<polyline points="9 18 15 12 9 6"/>' });
    items.push({ act:"edit", label:"Edit", icon:'<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>' });
    items.push({ act:"duplicate", label:"Duplicate", icon:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' });
    items.push({ act:"delete", label:"Delete", icon:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>', danger:true });
  } else if(context === "working"){
    if(task && task.status === "queued"){
      items.push({ act:"setWorking", label:"Set as Working On", icon:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/>' });
    }
    items.push({ act:"complete", label:"Mark complete", icon:'<polyline points="20 6 9 17 4 12"/>' });
    items.push({ act:"edit", label:"Edit", icon:'<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>' });
    items.push({ act:"back", label:"Back to list", icon:'<polyline points="15 18 9 12 15 6"/>' });
    items.push({ act:"delete", label:"Delete", icon:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>', danger:true });
  }
  ctx.innerHTML = items.map(it=>`<button data-act="${it.act}"${it.danger?' class="danger"':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${it.icon}</svg>${it.label}</button>`).join("");
}
function attachLongPress(el, id, context){
  let timer = null, started = false, sx = 0, sy = 0;
  const begin = e=>{
    if(e.button === 2) return;
    if(e.target.closest("button.start-btn")) return;
    started = true;
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY;
    timer = setTimeout(()=>{
      if(!started) return;
      e.preventDefault?.();
      const t = state.tasks.find(x=>x.id===id);
      buildCtxMenu(context, t);
      showCtx(id, sx, sy);
      el.style.transform = "scale(.98)";
      setTimeout(()=>{ el.style.transform = ""; }, 150);
    }, 480);
  };
  const move = e=>{
    if(!started) return;
    const p = e.touches ? e.touches[0] : e;
    if(Math.abs(p.clientX-sx)>8 || Math.abs(p.clientY-sy)>8){ clearTimeout(timer); started = false; }
  };
  const end = ()=>{ clearTimeout(timer); started = false; };
  el.addEventListener("mousedown", begin);
  el.addEventListener("mousemove", move);
  el.addEventListener("mouseup", end);
  el.addEventListener("mouseleave", end);
  el.addEventListener("touchstart", begin, { passive:true });
  el.addEventListener("touchmove", move, { passive:true });
  el.addEventListener("touchend", end);
  el.addEventListener("contextmenu", e=>{
    e.preventDefault();
    const t = state.tasks.find(x=>x.id===id);
    buildCtxMenu(context, t);
    showCtx(id, e.clientX, e.clientY);
  });
}
function showCtx(id, x, y){
  ctxTaskId = id;
  ctx.style.left = Math.min(x, window.innerWidth-200)+"px";
  ctx.style.top = Math.min(y, window.innerHeight-280)+"px";
  ctx.classList.add("open");
}
function hideCtx(){ ctx.classList.remove("open"); ctxTaskId = null; }
document.addEventListener("click", e=>{ if(!e.target.closest("#ctxMenu")) hideCtx(); });
ctx.addEventListener("click", e=>{
  const btn = e.target.closest("button");
  if(!btn || !ctxTaskId) return;
  const act = btn.dataset.act;
  const id = ctxTaskId;
  const t = state.tasks.find(x=>x.id===id);
  if(!t){ hideCtx(); return; }
  if(act === "start") startTask(id);
  else if(act === "setWorking") setWorking(id);
  else if(act === "complete") completeTask(id, document.querySelector(`.work-card[data-id="${id}"], .task-card[data-id="${id}"]`));
  else if(act === "edit") openSheet(id);
  else if(act === "back") backToList(id);
  else if(act === "delete"){
    state.tasks = state.tasks.filter(x=>x.id!==id);
    if(state.workingId===id) state.workingId = null;
    saveState(); renderView(); refreshTopbar(); toast("Deleted");
  } else if(act === "duplicate"){
    addTask({ title: t.title+" (copy)", desc: t.desc, priority: t.priority, tag: t.tag, due: t.due });
    toast("Duplicated");
  }
  hideCtx();
});

/* ===== THEME PANEL ===== */
const themePanel = $("#themePanel");
$("#themeToggle").addEventListener("click", e=>{ e.stopPropagation(); themePanel.classList.toggle("open"); });
document.addEventListener("click", e=>{ if(!e.target.closest("#themePanel") && !e.target.closest("#themeToggle")){ themePanel.classList.remove("open"); } });
$$(".theme-swatch").forEach(s=>{
  s.classList.toggle("active", s.dataset.t === savedTheme);
  s.addEventListener("click", ()=>{
    const t = s.dataset.t;
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(THEME_KEY, t);
    $$(".theme-swatch").forEach(x=>x.classList.toggle("active", x===s));
  });
});
const wallpaperInput = $("#wallpaperInput");
$("#wallpaperBtn").addEventListener("click", ()=>wallpaperInput.click());
wallpaperInput.addEventListener("change", e=>{
  const f = e.target.files?.[0]; if(!f) return;
  if(!f.type.startsWith("image/")){ toast("Pick an image file", false); return; }
  const reader = new FileReader();
  reader.onload = ev=>{
    const img = new Image();
    img.onload = ()=>{
      const max = 2400;
      const r = Math.min(1, max/Math.max(img.width, img.height));
      const w = Math.round(img.width*r), h = Math.round(img.height*r);
      const can = document.createElement("canvas"); can.width = w; can.height = h;
      can.getContext("2d").drawImage(img, 0, 0, w, h);
      try{
        const dataURL = can.toDataURL("image/jpeg", 0.85);
        custom.wallpaper = dataURL;
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
        applyCustom();
        toast("Wallpaper applied");
      }catch(err){ toast("Image too large — try smaller", false); }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(f);
  e.target.value = "";
});
$("#wallpaperReset").addEventListener("click", ()=>{
  custom.wallpaper = null;
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
  applyCustom();
  toast("Wallpaper reset");
});
const accentInput = $("#accentInput");
accentInput.addEventListener("input", ()=>{
  custom.accent = accentInput.value;
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
  applyCustom();
});
$("#accentReset").addEventListener("click", ()=>{
  custom.accent = null;
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
  applyCustom();
});
const nameInput = $("#nameInput");
nameInput.value = userName;
nameInput.addEventListener("input", ()=>{
  userName = nameInput.value.trim() || "you";
  localStorage.setItem(NAME_KEY, userName);
  refreshTopbar();
});

/* ===== NAV + KEYBOARD ===== */
$$(".nav-btn").forEach(b=>{ b.addEventListener("click", ()=>setView(b.dataset.view)); });
document.addEventListener("keydown", e=>{
  if(e.target.matches("input, textarea")){ if(e.key === "Escape") e.target.blur(); return; }
  if(e.key === "n" || e.key === "N"){ e.preventDefault(); openSheet(null); }
  if(e.key === "Escape"){ closeSheet(); hideCtx(); themePanel.classList.remove("open"); }
  if(e.key === "1") setView("todo");
  if(e.key === "2") setView("working");
  if(e.key === "3") setView("brainstorm");
  if(e.key === "4") setView("completed");
  if(e.key === "t" || e.key === "T") themePanel.classList.toggle("open");
});

/* ===== CONFETTI ===== */
function burst(){
  const root = $("#confetti");
  const colors = ["#fb7185","#fbbf24","#34d399","#60a5fa","#a78bfa","#f472b6","#5eead4"];
  for(let i=0;i<28;i++){
    const s = document.createElement("span");
    s.style.left = Math.random()*100+"vw";
    s.style.background = colors[Math.floor(Math.random()*colors.length)];
    s.style.animationDelay = (Math.random()*0.4)+"s";
    s.style.transform = `rotate(${Math.random()*360}deg)`;
    s.style.borderRadius = Math.random()<0.5 ? "2px" : "50%";
    root.appendChild(s);
    setTimeout(()=>s.remove(), 2200);
  }
}

setView("todo");
window.addEventListener("beforeunload", saveState);
