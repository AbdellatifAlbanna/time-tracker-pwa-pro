/* Time Tracker PWA Pro
   - Personal use, localStorage
   - One open shift
   - Cross-midnight supported (work_date = clock-in date)
   - Manual add/edit/delete
   - Monthly totals + search
   - Backup/restore JSON + Export CSV
   - Notifications & reminders (every day)
*/

const STANDARD_HOURS = 8.5;
const STORAGE_KEY = "tt_logs_v2";
const OPEN_KEY = "tt_open_v2";
const SETTINGS_KEY = "tt_settings_v2";

const els = {
  statusPill: document.getElementById("statusPill"),
  statusIcon: document.getElementById("statusIcon"),
  statusHeadline: document.getElementById("statusHeadline"),
  statusSub: document.getElementById("statusSub"),
  openWarning: document.getElementById("openWarning"),

  clockInBtn: document.getElementById("clockInBtn"),
  clockOutBtn: document.getElementById("clockOutBtn"),
  manualBtn: document.getElementById("manualBtn"),

  backupBtn: document.getElementById("backupBtn"),
  restoreBtn: document.getElementById("restoreBtn"),
  restoreInput: document.getElementById("restoreInput"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  wipeBtn: document.getElementById("wipeBtn"),

  monthPicker: document.getElementById("monthPicker"),
  searchInput: document.getElementById("searchInput"),

  monthHours: document.getElementById("monthHours"),
  monthOT: document.getElementById("monthOT"),
  monthDays: document.getElementById("monthDays"),

  logTable: document.getElementById("logTable"),

  // Modals
  modalTitle: document.getElementById("modalTitle"),
  shiftModal: document.getElementById("shiftModal"),
  mDate: document.getElementById("mDate"),
  mIn: document.getElementById("mIn"),
  mOut: document.getElementById("mOut"),
  mNotes: document.getElementById("mNotes"),
  mWarn: document.getElementById("mWarn"),
  mCancel: document.getElementById("mCancel"),
  mDelete: document.getElementById("mDelete"),
  mSave: document.getElementById("mSave"),

  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  sStandard: document.getElementById("sStandard"),
  sNoInTime: document.getElementById("sNoInTime"),
  sTooLongHours: document.getElementById("sTooLongHours"),
  sIntervalMin: document.getElementById("sIntervalMin"),
  sBackupDays: document.getElementById("sBackupDays"),

  notifyBtn: document.getElementById("notifyBtn"),
  installBtn: document.getElementById("installBtn"),
};

let logs = loadLogs();
let openShift = loadOpenShift();
let settings = loadSettings();
let editingId = null;

// PWA install prompt
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (els.installBtn) els.installBtn.style.display = "inline-flex";
});
if (els.installBtn){
  els.installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installBtn.style.display = "none";
  });
}

// Service worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
}

/* ===== Storage ===== */
function loadLogs(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function saveLogs(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(logs)); }
function loadOpenShift(){
  try{
    const raw = localStorage.getItem(OPEN_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}
function saveOpenShift(){ localStorage.setItem(OPEN_KEY, JSON.stringify(openShift)); }

function loadSettings(){
  const defaults = {
    noInTime: "09:15",
    tooLongHours: 10,
    intervalMin: 5,
    backupDays: 7,
    lastBackupISO: null,
    notificationsEnabled: false
  };
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const obj = JSON.parse(raw);
    return { ...defaults, ...obj };
  }catch{
    return defaults;
  }
}
function saveSettings(){
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* ===== Time helpers ===== */
function pad2(n){ return String(n).padStart(2,"0"); }
function fmtDateISO(d){
  // local date -> YYYY-MM-DD
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth()+1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}
function fmtTime(d){
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDatePretty(iso){
  // iso YYYY-MM-DD -> keep iso (simple & clear)
  return iso;
}
function toLocalDatetimeInput(ms){
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth()+1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function fromDatetimeInput(val){
  // val: YYYY-MM-DDTHH:mm (local)
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? ms : null;
}
function hoursBetween(inMs, outMs){
  return (outMs - inMs) / 3600000;
}
function round2(x){ return Math.round(x * 100) / 100; }

/* ===== Log record schema =====
{
  id: string,
  workDate: 'YYYY-MM-DD' (based on clock-in date)
  inMs: number,
  outMs: number,
  totalH: number,
  otH: number,
  notes: string,
  createdAt: ISO,
  updatedAt: ISO,
  isManual: boolean
}
*/
function makeId(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function computeTotals(inMs, outMs){
  const total = Math.max(0, hoursBetween(inMs, outMs));
  const ot = Math.max(0, total - STANDARD_HOURS);
  return { totalH: round2(total), otH: round2(ot) };
}
function sortLogs(){
  logs.sort((a,b) => (b.inMs - a.inMs));
}

/* ===== UI ===== */
function setPill(type, text){
  els.statusPill.textContent = text;
  els.statusPill.classList.remove("pill--muted","pill--red");
  if (type === "in") {
    // default green pill
  } else if (type === "out") {
    els.statusPill.classList.add("pill--muted");
  } else if (type === "warn") {
    els.statusPill.classList.add("pill--red");
  }
}
function refreshStatus(){
  if (openShift){
    const inD = new Date(openShift.inMs);
    const duration = round2(hoursBetween(openShift.inMs, Date.now()));
    els.statusIcon.textContent = "🟢";
    els.statusHeadline.textContent = `Clocked IN since ${fmtTime(inD)}`;
    els.statusSub.textContent = `Work date: ${openShift.workDate} • Running: ${duration}h`;
    setPill("in", "Clocked IN");
    els.openWarning.style.display = "inline";
    els.openWarning.textContent = `Open shift started ${openShift.workDate} at ${fmtTime(inD)} — clock out when done.`;
  } else {
    els.statusIcon.textContent = "⚪";
    els.statusHeadline.textContent = "Not clocked in";
    els.statusSub.textContent = "Ready when you are.";
    setPill("out", "Clocked OUT");
    els.openWarning.style.display = "none";
  }
}
function currentMonthISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
}
function monthFromPicker(){
  return els.monthPicker.value || currentMonthISO();
}
function inMonth(log, monthISO){
  return log.workDate.startsWith(monthISO);
}
function refreshSummary(){
  const m = monthFromPicker();
  const filtered = logs.filter(l => inMonth(l, m));
  const total = filtered.reduce((s,l)=> s + (l.totalH||0), 0);
  const ot = filtered.reduce((s,l)=> s + (l.otH||0), 0);
  els.monthHours.textContent = `${round2(total).toFixed(2)}h`;
  els.monthOT.textContent = `${round2(ot).toFixed(2)}h`;
  els.monthDays.textContent = String(filtered.length);
}
function matchesSearch(log, q){
  if (!q) return true;
  const s = q.toLowerCase().trim();
  return (
    log.workDate.includes(s) ||
    (log.notes||"").toLowerCase().includes(s)
  );
}
function badgeOT(ot){
  if (ot > 0) return `<span class="badge badge--ot">${ot.toFixed(2)}h</span>`;
  return `<span class="badge">${ot.toFixed(2)}h</span>`;
}
function renderTable(){
  const m = monthFromPicker();
  const q = els.searchInput.value || "";
  const rows = logs
    .filter(l => inMonth(l, m))
    .filter(l => matchesSearch(l, q));

  els.logTable.innerHTML = rows.map(l => {
    const inT = fmtTime(new Date(l.inMs));
    const outT = l.outMs ? fmtTime(new Date(l.outMs)) : "—";
    const total = (l.totalH ?? 0);
    const ot = (l.otH ?? 0);
    const note = (l.notes || "");
    const manual = l.isManual ? " <span class=\"badge\">manual</span>" : "";
    return `
      <tr data-id="${l.id}">
        <td><b>${fmtDatePretty(l.workDate)}</b>${manual}<div class="tiny muted">${new Date(l.inMs).toLocaleDateString()}</div></td>
        <td>${inT}</td>
        <td>${outT}</td>
        <td><b>${total.toFixed(2)}h</b></td>
        <td>${badgeOT(ot)}</td>
        <td>${escapeHtml(note)}</td>
        <td style="text-align:right;">
          <button class="rowbtn" data-edit="1">Edit</button>
        </td>
      </tr>
    `;
  }).join("");

  // bind edit buttons
  els.logTable.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      const id = tr?.dataset?.id;
      if (id) openEditModal(id);
    });
  });
}
function escapeHtml(str){
  return String(str || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function refreshAll(){
  sortLogs();
  refreshStatus();
  refreshSummary();
  renderTable();
}

/* ===== Clock In/Out ===== */
function clockIn(){
  if (openShift){
    toast("Already clocked in.");
    return;
  }
  const now = Date.now();
  const d = new Date(now);
  openShift = {
    inMs: now,
    workDate: fmtDateISO(d)
  };
  saveOpenShift();
  refreshAll();
  toast("Clocked in.");
}
function clockOut(){
  if (!openShift){
    toast("No open shift to clock out.");
    return;
  }
  const out = Date.now();
  if (out <= openShift.inMs){
    toast("Clock out time is invalid.");
    return;
  }
  const totals = computeTotals(openShift.inMs, out);
  const rec = {
    id: makeId(),
    workDate: openShift.workDate,
    inMs: openShift.inMs,
    outMs: out,
    totalH: totals.totalH,
    otH: totals.otH,
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isManual: false
  };
  logs.unshift(rec);
  openShift = null;
  saveOpenShift();
  saveLogs();
  refreshAll();
  toast("Clocked out.");
}

/* ===== Modal handling ===== */
function openModal(modalEl){
  modalEl.classList.add("is-open");
  modalEl.setAttribute("aria-hidden","false");
}
function closeModal(modalEl){
  modalEl.classList.remove("is-open");
  modalEl.setAttribute("aria-hidden","true");
}
document.querySelectorAll("[data-close]").forEach(el => {
  el.addEventListener("click", () => {
    closeModal(els.shiftModal);
    closeModal(els.settingsModal);
  });
});

function openAddModal(){
  editingId = null;
  els.modalTitle.textContent = "Add / Fix Shift";
  els.mDelete.style.display = "none";
  els.mWarn.style.display = "none";

  const now = new Date();
  const workDate = fmtDateISO(now);
  els.mDate.value = workDate;

  // default in = today 09:00, out empty
  els.mIn.value = `${workDate}T09:00`;
  els.mOut.value = "";
  els.mNotes.value = "Forgot to punch";
  openModal(els.shiftModal);
}
function openEditModal(id){
  const rec = logs.find(l => l.id === id);
  if (!rec) return;
  editingId = id;
  els.modalTitle.textContent = "Edit Shift";
  els.mDelete.style.display = "inline-flex";
  els.mWarn.style.display = "none";

  els.mDate.value = rec.workDate;
  els.mIn.value = toLocalDatetimeInput(rec.inMs);
  els.mOut.value = rec.outMs ? toLocalDatetimeInput(rec.outMs) : "";
  els.mNotes.value = rec.notes || "";

  openModal(els.shiftModal);
}
function validateShiftInputs(workDate, inMs, outMs){
  if (!workDate) return "Work date is required.";
  if (!Number.isFinite(inMs)) return "Time In is required.";
  if (!Number.isFinite(outMs)) return "Time Out is required.";
  if (outMs <= inMs) return "Time Out must be after Time In.";
  // Ensure workDate equals clock-in local date (best practice)
  const inDate = fmtDateISO(new Date(inMs));
  if (inDate !== workDate){
    return "Work date must match the local date of Time In (the day you clocked in).";
  }
  // One shift per work_date
  const existing = logs.find(l => l.workDate === workDate && l.id !== editingId);
  if (existing) return "A shift already exists for this work date. Edit it instead (one shift per day).";
  return null;
}
function saveShiftFromModal(){
  const workDate = els.mDate.value;
  const inMs = fromDatetimeInput(els.mIn.value);
  const outMs = fromDatetimeInput(els.mOut.value);
  const notes = els.mNotes.value || "";

  const err = validateShiftInputs(workDate, inMs, outMs);
  if (err){
    els.mWarn.textContent = err;
    els.mWarn.style.display = "block";
    return;
  }

  const totals = computeTotals(inMs, outMs);
  const nowISO = new Date().toISOString();

  if (editingId){
    const idx = logs.findIndex(l => l.id === editingId);
    if (idx >= 0){
      logs[idx] = {
        ...logs[idx],
        workDate, inMs, outMs,
        totalH: totals.totalH,
        otH: totals.otH,
        notes,
        updatedAt: nowISO,
        isManual: true
      };
    }
  } else {
    logs.unshift({
      id: makeId(),
      workDate, inMs, outMs,
      totalH: totals.totalH,
      otH: totals.otH,
      notes,
      createdAt: nowISO,
      updatedAt: nowISO,
      isManual: true
    });
  }

  saveLogs();
  refreshAll();
  closeModal(els.shiftModal);
  toast("Saved.");
}
function deleteShift(){
  if (!editingId) return;
  logs = logs.filter(l => l.id !== editingId);
  saveLogs();
  refreshAll();
  closeModal(els.shiftModal);
  toast("Deleted.");
}

/* ===== Backup / Restore ===== */
function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function backupJSON(){
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    standardHours: STANDARD_HOURS,
    logs
  };
  const stamp = fmtDateISO(new Date()).replaceAll("-","");
  downloadFile(`time-tracker-backup-${stamp}.json`, JSON.stringify(payload, null, 2), "application/json");
  settings.lastBackupISO = new Date().toISOString();
  saveSettings();
  toast("Backup exported.");
}
function restoreJSON(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      const restored = Array.isArray(data.logs) ? data.logs : [];
      // basic sanitize
      logs = restored
        .filter(x => x && typeof x.workDate === "string" && Number.isFinite(x.inMs) && Number.isFinite(x.outMs))
        .map(x => {
          const totals = computeTotals(x.inMs, x.outMs);
          return {
            id: x.id || makeId(),
            workDate: x.workDate,
            inMs: x.inMs,
            outMs: x.outMs,
            totalH: Number.isFinite(x.totalH) ? x.totalH : totals.totalH,
            otH: Number.isFinite(x.otH) ? x.otH : totals.otH,
            notes: x.notes || "",
            createdAt: x.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isManual: Boolean(x.isManual)
          };
        });
      saveLogs();
      refreshAll();
      toast("Restore complete.");
    }catch{
      toast("Restore failed (invalid file).");
    }finally{
      els.restoreInput.value = "";
    }
  };
  reader.readAsText(file);
}
function exportCSV(){
  // Export selected month only (what table shows)
  const m = monthFromPicker();
  const q = els.searchInput.value || "";
  const rows = logs
    .filter(l => inMonth(l, m))
    .filter(l => matchesSearch(l, q))
    .map(l => ({
      Date: l.workDate,
      TimeIn: fmtTime(new Date(l.inMs)),
      TimeOut: fmtTime(new Date(l.outMs)),
      TotalHours: (l.totalH ?? 0).toFixed(2),
      OvertimeHours: (l.otH ?? 0).toFixed(2),
      Notes: (l.notes || "")
    }));

  const header = Object.keys(rows[0] || {Date:"",TimeIn:"",TimeOut:"",TotalHours:"",OvertimeHours:"",Notes:""});
  const lines = [header.join(",")];
  rows.forEach(r => {
    const line = header.map(k => csvEscape(r[k])).join(",");
    lines.push(line);
  });

  const stamp = `${m.replace("-","")}`;
  downloadFile(`time-tracker-${stamp}.csv`, lines.join("\n"), "text/csv");
  toast("CSV exported.");
}
function csvEscape(val){
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}
function wipeData(){
  const ok = confirm("Reset all logs? This cannot be undone.");
  if (!ok) return;
  logs = [];
  openShift = null;
  saveLogs();
  saveOpenShift();
  refreshAll();
  toast("Data reset.");
}

/* ===== Notifications ===== */
async function ensureNotificationPermission(){
  if (!("Notification" in window)){
    toast("Notifications not supported here.");
    return false;
  }
  if (Notification.permission === "granted") return true;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}
function notify(title, body){
  try{
    if (Notification.permission !== "granted") return;
    new Notification(title, { body });
  }catch{ /* ignore */ }
}
function minutesSinceMidnight(d){
  return d.getHours()*60 + d.getMinutes();
}
function parseTimeToMinutes(hhmm){
  const m = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm || "");
  if (!m) return null;
  return Number(m[1])*60 + Number(m[2]);
}
function todayISO(){ return fmtDateISO(new Date()); }

function reminderTick(){
  // 1) No clock-in reminder
  const now = new Date();
  const targetMin = parseTimeToMinutes(settings.noInTime);
  if (targetMin !== null){
    const nowMin = minutesSinceMidnight(now);
    // Notify only once per day (store stamp)
    const stampKey = "tt_noin_stamp";
    const stamp = localStorage.getItem(stampKey);
    const today = todayISO();
    const already = (stamp === today);

    const hasTodayShift = Boolean(
      openShift?.workDate === today ||
      logs.some(l => l.workDate === today)
    );

    if (!already && nowMin >= targetMin && !hasTodayShift && settings.notificationsEnabled){
      notify("Time Tracker", "No clock-in recorded today. Did you forget to clock in?");
      localStorage.setItem(stampKey, today);
    }
  }

  // 2) Clocked-in too long
  if (openShift && settings.notificationsEnabled){
    const runH = hoursBetween(openShift.inMs, Date.now());
    const limit = Number(settings.tooLongHours) || 10;
    const tooLongKey = "tt_toolong_stamp";
    const stamp = localStorage.getItem(tooLongKey);
    const today = todayISO();
    // allow once per day per open shift start date
    const stampVal = `${openShift.workDate}:${today}`;
    if (runH >= limit && stamp !== stampVal){
      notify("Time Tracker", `You are still clocked in for ${round2(runH)}h. Consider clocking out.`);
      localStorage.setItem(tooLongKey, stampVal);
    }
  }

  // 3) Backup reminder
  const days = Number(settings.backupDays) || 0;
  if (days > 0 && settings.notificationsEnabled){
    const last = settings.lastBackupISO ? Date.parse(settings.lastBackupISO) : null;
    if (last){
      const diffDays = (Date.now() - last) / 86400000;
      const key = "tt_backup_stamp";
      const stamp = localStorage.getItem(key);
      const today = todayISO();
      if (diffDays >= days && stamp !== today){
        notify("Time Tracker", "Reminder: consider making an iCloud backup (Backup JSON).");
        localStorage.setItem(key, today);
      }
    }
  }
}

/* ===== Toast (simple) ===== */
let toastTimer = null;
function toast(msg){
  // Minimal toast using status pill tooltip-like behavior
  clearTimeout(toastTimer);
  const old = els.statusPill.textContent;
  els.statusPill.textContent = msg;
  els.statusPill.classList.add("pill--muted");
  toastTimer = setTimeout(() => {
    refreshStatus();
  }, 1600);
}

/* ===== Settings modal ===== */
function openSettings(){
  els.sStandard.value = STANDARD_HOURS;
  els.sNoInTime.value = settings.noInTime;
  els.sTooLongHours.value = settings.tooLongHours;
  els.sIntervalMin.value = settings.intervalMin;
  els.sBackupDays.value = settings.backupDays;
  openModal(els.settingsModal);
}
function saveSettingsFromModal(){
  settings.noInTime = els.sNoInTime.value || "09:15";
  settings.tooLongHours = Number(els.sTooLongHours.value) || 10;
  settings.intervalMin = Math.max(1, Number(els.sIntervalMin.value) || 5);
  settings.backupDays = Math.max(0, Number(els.sBackupDays.value) || 0);
  saveSettings();
  scheduleReminderTimer();
  closeModal(els.settingsModal);
  toast("Settings saved.");
}

/* ===== Bind events ===== */
els.clockInBtn.addEventListener("click", clockIn);
els.clockOutBtn.addEventListener("click", clockOut);
els.manualBtn.addEventListener("click", openAddModal);

els.backupBtn.addEventListener("click", backupJSON);
els.restoreBtn.addEventListener("click", () => els.restoreInput.click());
els.restoreInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) restoreJSON(file);
});
els.exportCsvBtn.addEventListener("click", exportCSV);
els.wipeBtn.addEventListener("click", wipeData);

els.mSave.addEventListener("click", saveShiftFromModal);
els.mDelete.addEventListener("click", deleteShift);

els.settingsBtn.addEventListener("click", openSettings);
els.saveSettingsBtn.addEventListener("click", saveSettingsFromModal);

els.monthPicker.addEventListener("change", () => { refreshSummary(); renderTable(); });
els.searchInput.addEventListener("input", () => { renderTable(); });

els.notifyBtn.addEventListener("click", async () => {
  const ok = await ensureNotificationPermission();
  if (ok){
    settings.notificationsEnabled = true;
    saveSettings();
    notify("Time Tracker", "Notifications enabled.");
    toast("Notifications enabled.");
  } else {
    toast("Notifications not enabled.");
  }
});

/* Click outside to close modals */
[els.shiftModal, els.settingsModal].forEach(modal => {
  modal.addEventListener("click", (e) => {
    const target = e.target;
    if (target?.dataset?.close) closeModal(modal);
  });
});

/* ===== Initialize ===== */
function init(){
  // set month picker to current month
  els.monthPicker.value = currentMonthISO();
  refreshAll();
  scheduleReminderTimer();
  // If user already granted permission, keep enabled state
  if ("Notification" in window && Notification.permission === "granted" && settings.notificationsEnabled){
    // no-op
  }
}
init();

/* ===== Reminders timer ===== */
let reminderTimer = null;
function scheduleReminderTimer(){
  if (reminderTimer) clearInterval(reminderTimer);
  const min = Math.max(1, Number(settings.intervalMin) || 5);
  reminderTimer = setInterval(reminderTick, min * 60000);
  // also tick shortly after load
  setTimeout(reminderTick, 2000);
}
