const TARGET = 360;
let entries = [];
let current = new Date();
const $ = s => document.querySelector(s);

console.log("Supabase:", supabaseClient);

const fmtDate = d => d.toISOString().slice(0, 10);
const today = fmtDate(new Date());

/* ---------- Base de datos local (IndexedDB) ---------- */
const DB_NAME = "pasantia360-db", DB_VERSION = 1, STORE = "entries";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly"), r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function dbPut(entry) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function dbPutMany(list) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite"), s = tx.objectStore(STORE);
    list.forEach(e => s.put(e));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}


/* ---------- Supabase ---------- */

async function supabaseGetAll() {
  const { data, error } = await supabaseClient
    .from("entries")
    .select("*")
    .order("date", { ascending: true });

  if (error) {
    console.error("Error cargando Supabase:", error);
    throw error;
  }

  return data.map(e => ({
    id: e.id,
    date: e.date,
    start: e.start,
    startAmpm: e.start_ampm,
    end: e.end,
    endAmpm: e.end_ampm,
    minutes: e.minutes,
    note: e.note || ""
  }));
}


async function supabaseInsertMany(list) {
  if (!list.length) return;

  const rows = list.map(e => ({
    id: e.id,
    date: e.date,
    start: e.start,
    start_ampm: e.startAmpm,
    end: e.end,
    end_ampm: e.endAmpm,
    minutes: e.minutes,
    note: e.note || ""
  }));

  const { error } = await supabaseClient
    .from("entries")
    .upsert(rows);

  if (error) {
    console.error("Error migrando datos:", error);
    throw error;
  }
}


async function supabaseDelete(id) {
  const { error } = await supabaseClient
    .from("entries")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error eliminando de Supabase:", error);
    throw error;
  }
}


async function dbClear() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function migrateFromLocalStorageIfNeeded() {
  const legacy = localStorage.getItem("pasantia360");
  if (!legacy) return;
  try {
    const old = JSON.parse(legacy);
    if (Array.isArray(old) && old.length) { await dbPutMany(old); }
  } catch (e) { }
  localStorage.removeItem("pasantia360");
}

/* ---------- Control del Menú Hamburguesa ---------- */
function toggleSidebar(open) {
  const sidebar = $("#sidebar");
  const overlay = $("#sidebarOverlay");
  const shouldOpen = open !== undefined ? open : !sidebar.classList.contains("open");
  
  sidebar.classList.toggle("open", shouldOpen);
  overlay.classList.toggle("active", shouldOpen);
  document.body.classList.toggle("menu-open", shouldOpen);
}

$("#menuToggle").onclick = () => toggleSidebar(true);
$("#closeSidebar").onclick = () => toggleSidebar(false);
$("#sidebarOverlay").onclick = () => toggleSidebar(false);

function parseTimeToMinutes(timeStr, ampm) {
  if (!timeStr) return 0;
  let [h, m] = timeStr.split(":").map(Number);
  
  if (ampm) {
    // Si es 12 AM pasa a 0; de 1 a 11 AM se mantiene igual
    h = h % 12; 
    // Si es PM (y no es 12 PM), se le suman 12 horas
    if (ampm === "PM") h += 12;
  }
  return h * 60 + (m || 0);
}

function calculateMinutes(startStr, startAmpm, endStr, endAmpm) {
  let startMins = parseTimeToMinutes(startStr, startAmpm);
  let endMins = parseTimeToMinutes(endStr, endAmpm);
  
  if (endMins < startMins) {
    endMins += 1440; // Cruza la medianoche (24h = 1440 mins)
  }
  return endMins - startMins;
}

// Formatea minutos exactos a HH:MM sin segundos
function hm(totalMinutes) {
  totalMinutes = Math.max(0, Math.round(totalMinutes));
  let h = Math.floor(totalMinutes / 60);
  let m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function total() {
  return entries.reduce((a, e) => a + e.minutes, 0);
}

function pad3(n) {
  return String(Math.max(0, Math.round(n))).padStart(3, "0");
}

function updateCalculatedTime() {
  const start = $("#start").value;
  const startAmpm = $("#startAmpm").value;
  const end = $("#end").value;
  const endAmpm = $("#endAmpm").value;

  if (start && end) {
    const mins = calculateMinutes(start, startAmpm, end, endAmpm);
    $("#calculated").value = hm(mins) + " hrs";
  } else {
    $("#calculated").value = "";
  }
}

$("#start").oninput = $("#end").oninput = $("#startAmpm").onchange = $("#endAmpm").onchange = updateCalculatedTime;

/* ---------- Estrellas ---------- */
function renderStars() {
  const box = $("#heroStars");
  if (box.childElementCount) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 40; i++) {
    const s = document.createElement("i");
    s.style.left = Math.random() * 100 + "%";
    s.style.top = (40 + Math.random() * 55) + "%";
    s.style.animationDelay = (Math.random() * 4) + "s";
    s.style.animationDuration = (2.5 + Math.random() * 3) + "s";
    frag.appendChild(s);
  }
  box.appendChild(frag);
}

/* ---------- Render Dashboard ---------- */
function updateDashboard() {
  let t = total(), remain = Math.max(0, TARGET * 60 - t), pct = Math.min(100, t / (TARGET * 60) * 100), hours = t / 60;
  $("#completed").textContent = hm(t);
  $("#completedDecimal").textContent = hours.toFixed(2) + " horas";
  $("#remaining").textContent = hm(remain);
  $("#days").textContent = entries.length;
  $("#progressText").textContent = pct.toFixed(pct < 10 ? 1 : 0) + "%";
  $("#fraction").textContent = hm(t) + " / 360:00 h";
  $("#progressBar").style.width = pct + "%";
  $("#heroCompleted").textContent = pad3(Math.min(hours, TARGET));
  $("#heroPct").textContent = pct.toFixed(0) + "%";
  $("#heroDaysCaption").textContent = entries.length + (entries.length === 1 ? " jornada" : " jornadas");
  
  renderStars();
  renderRecent();
  renderHistory();
  renderCalendar();
}

function renderRecent() {
  let data = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  let body = $("#recentBody");
  body.innerHTML = data.length ? data.map(e => row(e, false)).join("") : `<tr><td colspan="4" class="empty">Todavía no has registrado jornadas.</td></tr>`;
}

function row(e, full) {
  const startDisp = `${e.start} ${e.startAmpm || ""}`;
  const endDisp = `${e.end} ${e.endAmpm || ""}`;
  return `<tr><td>${new Date(e.date + "T12:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" })}</td><td>${startDisp}</td><td>${endDisp}</td><td class="hours">${hm(e.minutes)}</td>${full ? `<td>${e.note || "—"}</td><td><button class="delete-btn" onclick="removeEntry('${e.id}')">Eliminar</button></td>` : ""}</tr>`;
}

function renderHistory() {
  let body = $("#historyBody"), data = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  body.innerHTML = data.length ? data.map(e => row(e, true)).join("") : `<tr><td colspan="6" class="empty">No hay jornadas registradas.</td></tr>`;
}

function renderCalendar() {
  let y = current.getFullYear(), m = current.getMonth(), first = new Date(y, m, 1), last = new Date(y, m + 1, 0), offset = (first.getDay() + 6) % 7;
  $("#monthTitle").textContent = first.toLocaleDateString("es-DO", { month: "long", year: "numeric" });
  let cal = $("#calendar"), out = "";
  for (let i = 0; i < offset; i++) out += `<div class="day muted"></div>`;
  for (let d = 1; d <= last.getDate(); d++) {
    let date = fmtDate(new Date(y, m, d)), es = entries.filter(e => e.date === date), mins = es.reduce((a, e) => a + e.minutes, 0), cl = "day" + (date === today ? " today" : "") + (es.length ? " has-entry" : "");
    out += `<div class="${cl}" data-date="${date}"><div class="day-num">${d}</div>${es.length ? `<div class="day-hours">${hm(mins)} · pasantía</div>` : ""}</div>`;
  }
  cal.innerHTML = out;
  cal.querySelectorAll(".day[data-date]").forEach(el => el.onclick = () => showDay(el.dataset.date));
}

function showDay(date) {
  let es = entries.filter(e => e.date === date);
  $("#modalContent").innerHTML = `<h2>${new Date(date + "T12:00:00").toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>` + (es.length ? es.map(e => `<div class="detail"><div><span>Inicio</span><b>${e.start} ${e.startAmpm || ""}</b></div><div><span>Final</span><b>${e.end} ${e.endAmpm || ""}</b></div><div><span>Horas</span><b>${hm(e.minutes)}</b></div><div><span>Nota</span><b>${e.note || "—"}</b></div></div>`).join("") : `<p>No hay una jornada registrada para este día.</p>`);
  $("#modal").classList.remove("hidden");
}

async function removeEntry(id) {
  if (!confirm("¿Eliminar esta jornada?")) return;

  try {
    await supabaseDelete(id);
    await dbDelete(id);

    entries = entries.filter(e => e.id !== id);

    updateDashboard();

    console.log("Jornada eliminada correctamente:", id);

  } catch (error) {
    console.error("Error eliminando jornada:", error);
    alert("No se pudo eliminar la jornada.");
  }
}

window.removeEntry = removeEntry;

/* Navegación */
function navigate(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === view));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  
  $("#pageTitle").textContent = { inicio: "Resumen", registro: "Registrar jornada", calendario: "Calendario", historial: "Historial" }[view];
  if (view === "calendario") renderCalendar();
  toggleSidebar(false);
}

document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => navigate(b.dataset.view));
document.querySelectorAll("[data-view-link]").forEach(b => b.onclick = () => navigate(b.dataset.viewLink));
$("#quickAdd").onclick = () => navigate("registro");
$("#backFromForm").onclick = $("#cancelForm").onclick = () => navigate("inicio");

$("#prevMonth").onclick = () => { current.setMonth(current.getMonth() - 1); renderCalendar(); };
$("#nextMonth").onclick = () => { current.setMonth(current.getMonth() + 1); renderCalendar(); };

/* Guardar jornada */
$("#entryForm").onsubmit = async e => {
  e.preventDefault();
  let date = $("#date").value, start = $("#start").value, startAmpm = $("#startAmpm").value, end = $("#end").value, endAmpm = $("#endAmpm").value;
  
  if (!date || !start || !end) return;
  
  let mins = calculateMinutes(start, startAmpm, end, endAmpm);
  
  let existing = entries.find(x => x.date === date && x.start === start && x.end === end);
  if (existing) { alert("Ya existe una jornada igual."); return; }
  
  const entry = {
    id: Date.now().toString(),
    date,
    start,
    startAmpm,
    end,
    endAmpm,
    minutes: mins,
    note: $("#note").value.trim()
  };

try {
  // Guardar en Supabase
  await supabaseInsertMany([entry]);

  // Guardar también localmente
  await dbPut(entry);

  // Actualizar la aplicación
  entries.push(entry);
  entries.sort((a, b) => a.date.localeCompare(b.date));

  updateDashboard();

  e.target.reset();
  $("#calculated").value = "";

  navigate("historial");

  console.log("Jornada guardada en Supabase:", entry);

} catch (error) {
  console.error("Error guardando jornada:", error);
  alert("No se pudo guardar la jornada en Supabase.");
}
};

$("#clearForm").onclick = () => { $("#entryForm").reset(); $("#calculated").value = ""; };

$("#clearAll").onclick = async () => {
  if (entries.length && !confirm("¿Seguro que quieres borrar todas las jornadas?")) return;
  await dbClear();
  entries = [];
  updateDashboard();
};

/* Exportar/Importar */
$("#exportDb").onclick = () => {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `pasantia360-backup-${today}.json`; a.click();
  URL.revokeObjectURL(url);
};

$("#importDb").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const incoming = JSON.parse(text);
    if (!Array.isArray(incoming)) throw new Error("Formato inválido");
    await dbPutMany(incoming);
    entries = await dbGetAll();
    entries.sort((a, b) => a.date.localeCompare(b.date));
    updateDashboard();
    alert("Base de datos importada correctamente.");
  } catch (err) {
    alert("No se pudo leer el archivo. Asegúrate de que sea un respaldo exportado desde esta app.");
  }
  e.target.value = "";
};

$("#closeModal").onclick = () => $("#modal").classList.add("hidden");
$("#modal").onclick = e => { if (e.target.id === "modal") $("#modal").classList.add("hidden"); };

/* Arranque */
(async function init() {
  $("#date").value = today;
  await migrateFromLocalStorageIfNeeded();

  try {
    // Primero obtenemos los datos que ya tienes en IndexedDB
    const localEntries = await dbGetAll();

    // Los subimos a Supabase
    if (localEntries.length > 0) {
      await supabaseInsertMany(localEntries);
      console.log("Datos locales migrados a Supabase:", localEntries.length);
    }

    // Ahora cargamos desde Supabase
    entries = await supabaseGetAll();

    console.log("Datos actuales de Supabase:", entries);

  } catch (error) {
    console.error("Error con Supabase:", error);

    // Si Supabase falla, seguimos usando los datos locales
    entries = await dbGetAll();
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  updateDashboard();
})();

// ===============================
// SINCRONIZACIÓN EN TIEMPO REAL
// ===============================

supabaseClient
  .channel("entries-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "entries"
    },
    async (payload) => {

      console.log("Cambio detectado en Supabase:", payload);

      // Volver a cargar todos los datos
      try {
        entries = await supabaseGetAll();

        entries.sort((a, b) => a.date.localeCompare(b.date));

        // Actualizar toda la interfaz
        updateDashboard();

        console.log("Datos sincronizados correctamente.");

      } catch (error) {
        console.error("Error sincronizando datos:", error);
      }
    }
  )
  .subscribe((status) => {
    console.log("Estado Realtime:", status);
  });
