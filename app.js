const STORAGE_KEY = "turnario-shifts-v1";
const WORK_WEEK = 44 * 60;
const DEFAULT_START = "09:00";
let activeMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let shifts = loadShifts();
let selectedDate = null;
const $ = (id) => document.getElementById(id);
const pad = (number) => String(number).padStart(2, "0");
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseMinutes = (time) => { const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes; };
const formatMinutes = (minutes) => { const sign = minutes < 0 ? "-" : ""; const absolute = Math.abs(Math.round(minutes)); return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`; };
const formatLongDate = (date) => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(date);
const monthName = (date) => new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date);
function loadShifts() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function saveShifts() { localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts)); }
function expectedForDate(date) { const day = date.getDay(); return day >= 1 && day <= 4 ? 540 : day === 5 ? 480 : 0; }
function shiftMinutes(shift) { if (!shift || shift.off || shift.holiday || shift.online || shift.commission || shift.leave) return 0; let result = parseMinutes(shift.end) - parseMinutes(shift.start); if (result < 0) result += 1440; return result; }
function creditedMinutes(date, shift) {
  const expected = expectedForDate(date);
  if (!shift) return 0;
  if (shift.off || shift.holiday || shift.online || shift.commission || shift.leave === "full" || shift.authorizedEarlyDeparture) return expected;
  if (shift.leave === "morning" || shift.leave === "afternoon") return Math.floor(expected / 2);
  return shiftMinutes(shift);
}
function statusLabel(date, shift, minutes) {
  if (!shift) return date.getDay() === 0 || date.getDay() === 6 ? "LIBRE" : "—";
  if (shift.off) return "LIBRE";
  if (shift.holiday) return "FERIADO";
  if (shift.online) return "ONLINE";
  if (shift.commission) return "COMISIÓN";
  if (shift.leave === "full") return "LICENCIA";
  if (shift.leave) return "MEDIA JORNADA";
  if (shift.authorizedEarlyDeparture) return "SALIDA AUTORIZADA";
  return formatMinutes(minutes);
}
function monthDates() { const first = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1); const count = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 0).getDate(); return Array.from({ length: count }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1)); }
function getWeekStart(date) { const day = date.getDay() || 7; const result = new Date(date); result.setDate(date.getDate() - day + 1); result.setHours(0, 0, 0, 0); return result; }
function weekDates(date) { const start = getWeekStart(date); return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)); }
function getMonthData() { return monthDates().reduce((data, date) => { const shift = shifts[dateKey(date)]; data.worked += shiftMinutes(shift); data.credited += creditedMinutes(date, shift); data.expected += expectedForDate(date); return data; }, { worked: 0, credited: 0, expected: 0 }); }
function render() { $("month-label").textContent = monthName(activeMonth); $("month-code").textContent = `${activeMonth.getFullYear()} / ${pad(activeMonth.getMonth() + 1)}`; renderCalendar(); renderStats(); renderWeek(); renderWeeksTable(); renderBackupReminder(); }
function monthCode(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`; }
function renderBackupReminder() {
  const now = new Date(); const isCurrentMonth = monthCode(activeMonth) === monthCode(now);
  const nearMonthEnd = now.getDate() >= 25 || (now.getDate() <= 3 && activeMonth.getMonth() === now.getMonth() - 1);
  const code = monthCode(activeMonth); const exported = localStorage.getItem(`turnario-exported-${code}`) === "true"; const dismissed = localStorage.getItem(`turnario-reminder-dismissed-${code}`) === "true";
  $("backup-reminder").hidden = !isCurrentMonth || !nearMonthEnd || exported || dismissed;
}
function renderCalendar() {
  const calendar = $("calendar"); calendar.innerHTML = "";
  const firstDay = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1).getDay() || 7;
  for (let blank = 1; blank < firstDay; blank += 1) { const cell = document.createElement("div"); cell.className = "calendar-cell blank"; calendar.appendChild(cell); }
  monthDates().forEach((date) => {
    const key = dateKey(date); const shift = shifts[key]; const minutes = shiftMinutes(shift); const expected = expectedForDate(date); const credited = creditedMinutes(date, shift);
    const cell = document.createElement("button"); cell.type = "button"; cell.className = "calendar-cell"; cell.dataset.date = key;
    if (dateKey(new Date()) === key) cell.classList.add("today"); if (date.getDay() === 0 || date.getDay() === 6) cell.classList.add("weekend");
    if (shift && credited >= expected && expected > 0) cell.classList.add("complete"); else if (shift && credited < expected && expected > 0) cell.classList.add("short");
    cell.innerHTML = `<span class="day-number">${date.getDate()}</span><span class="day-duration">${statusLabel(date, shift, minutes)}</span>`;
    cell.addEventListener("click", () => openDialog(date)); calendar.appendChild(cell);
  });
}
function renderStats() {
  const data = getMonthData(); const balance = data.credited - data.expected; const overtime = Math.max(0, data.worked - data.expected);
  $("worked-hours").textContent = formatMinutes(data.worked); $("worked-caption").textContent = `sobre ${formatMinutes(data.expected)} esperadas`;
  $("monthly-balance").textContent = formatMinutes(balance); $("monthly-balance").style.color = balance < -59 ? "#c87853" : "";
  $("balance-caption").textContent = balance >= 0 ? "objetivo mensual cumplido" : `${formatMinutes(Math.abs(balance))} por completar`;
  $("overtime-hours").textContent = formatMinutes(overtime);
  const deductionMinutes = monthDates().reduce((total, date) => { const shift = shifts[dateKey(date)]; const missing = expectedForDate(date) - creditedMinutes(date, shift); return total + (shift && missing >= 59 ? missing : 0); }, 0);
  $("deduction-days").textContent = `${deductionMinutes} min`; $("deduction-caption").textContent = deductionMinutes ? "minutos sujetos a descuento" : "a partir de 59 min faltantes";
}
function renderWeek() {
  const today = new Date(); const dates = weekDates(today); const worked = dates.reduce((sum, date) => sum + shiftMinutes(shifts[dateKey(date)]), 0); const credited = dates.reduce((sum, date) => sum + creditedMinutes(date, shifts[dateKey(date)]), 0); const balance = credited - WORK_WEEK;
  $("week-worked").textContent = formatMinutes(credited); $("week-progress").style.width = `${Math.min(100, (credited / WORK_WEEK) * 100)}%`;
  $("week-status").textContent = credited >= WORK_WEEK ? "Cumplida" : "Pendiente"; $("week-status").className = `status-pill ${credited >= WORK_WEEK ? "good" : "bad"}`;
  $("week-helper").textContent = credited >= WORK_WEEK ? "Objetivo semanal alcanzado. Las horas extra no son remuneradas." : `${formatMinutes(Math.abs(balance))} ${balance < 0 ? "restantes para completar la semana." : "por encima del objetivo."}`;
  $("week-days").innerHTML = dates.map((date) => { const shift = shifts[dateKey(date)]; const mins = shiftMinutes(shift); const creditedDay = creditedMinutes(date, shift); const expected = expectedForDate(date); const label = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(date).replace(".", "").slice(0, 3).toUpperCase(); return `<div class="week-day"><span class="weekday">${label}</span><span class="bar"><i style="width:${expected ? Math.min(100, creditedDay / expected * 100) : creditedDay ? 100 : 0}%"></i></span><span class="hours">${shift?.commission ? "COM" : shift?.holiday ? "FER" : shift?.online ? "ONL" : shift?.leave ? "LIC" : mins ? formatMinutes(mins) : "—"}</span></div>`; }).join("");
}
function renderWeeksTable() {
  const weeks = []; const seen = new Set();
  monthDates().forEach((date) => { const start = getWeekStart(date); const key = dateKey(start); if (!seen.has(key)) { seen.add(key); weeks.push(start); } });
  $("weeks-table").innerHTML = weeks.map((start, index) => { const dates = weekDates(start); const monthScopedDates = dates.filter((date) => date.getMonth() === activeMonth.getMonth() && date.getFullYear() === activeMonth.getFullYear()); const worked = monthScopedDates.reduce((sum, date) => sum + shiftMinutes(shifts[dateKey(date)]), 0); const credited = dates.reduce((sum, date) => sum + creditedMinutes(date, shifts[dateKey(date)]), 0); const balance = credited - WORK_WEEK; const status = credited >= WORK_WEEK ? ["Cumplida", ""] : credited === 0 ? ["Sin registrar", "neutral"] : [balance <= -59 ? "Descuento" : "En curso", "warning"]; return `<tr><td>Semana ${index + 1}</td><td>${start.getDate()} — ${dates[6].getDate()} ${new Intl.DateTimeFormat("es-AR", { month: "short" }).format(dates[6])}</td><td>${formatMinutes(worked)}</td><td>${formatMinutes(balance)}</td><td class="table-status ${status[1]}">${status[0]}</td></tr>`; }).join("");
}
function openDialog(date) {
  selectedDate = date; const key = dateKey(date); const shift = shifts[key]; const expected = expectedForDate(date); $("dialog-date").textContent = formatLongDate(date); $("dialog-date-value").value = key;
  $("dialog-schedule").textContent = expected ? `Jornada sugerida: ${DEFAULT_START} — ${expected === 540 ? "18:00" : "17:00"}` : "Fin de semana · sin jornada esperada";
  $("start-time").value = shift?.start || DEFAULT_START; $("end-time").value = shift?.end || (expected === 540 ? "18:00" : expected === 480 ? "17:00" : "18:00"); $("leave-type").value = shift?.leave || (shift?.off ? "full" : ""); $("commission").checked = Boolean(shift?.commission); $("holiday").checked = Boolean(shift?.holiday); $("online").checked = Boolean(shift?.online); $("authorized-early-departure").checked = Boolean(shift?.authorizedEarlyDeparture); $("shift-dialog").showModal();
}
function exportMonth() {
  const payload = { month: `${activeMonth.getFullYear()}-${pad(activeMonth.getMonth() + 1)}`, exportedAt: new Date().toISOString(), weeklyTargetMinutes: WORK_WEEK, shifts: monthDates().filter((date) => shifts[dateKey(date)]).map((date) => ({ date: dateKey(date), ...shifts[dateKey(date)] })) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `turnario-${payload.month}.json`; link.click(); URL.revokeObjectURL(link.href);
  const csv = ["Fecha,Ingreso,Salida,Horas,Estado,Observaciones", ...payload.shifts.map((shift) => `${shift.date},${shift.commission || shift.leave || shift.holiday || shift.online ? "" : shift.start},${shift.commission || shift.leave || shift.holiday || shift.online ? "" : shift.end},${formatMinutes(shiftMinutes(shift))},${shift.commission ? "Comisión de servicio" : shift.holiday ? "Feriado" : shift.online ? "Día online" : shift.leave ? `Licencia ${shift.leave}` : shift.authorizedEarlyDeparture ? "Salida anticipada autorizada" : "Trabajado"},"${(shift.note || "").replaceAll('"', '""')}"`)].join("\n"); const csvLink = document.createElement("a"); csvLink.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); csvLink.download = `turnario-${payload.month}.csv`; csvLink.click(); URL.revokeObjectURL(csvLink.href); showToast("Mes exportado en JSON y CSV");
  localStorage.setItem(`turnario-exported-${payload.month}`, "true"); renderBackupReminder();
}
function showToast(message) { const toast = $("toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2600); }
$("previous-month").addEventListener("click", () => { activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1); render(); });
$("next-month").addEventListener("click", () => { activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1); render(); });
$("today-button").addEventListener("click", () => { activeMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); render(); });
$("online-button").addEventListener("click", () => { const today = new Date(); activeMonth = new Date(today.getFullYear(), today.getMonth(), 1); shifts[dateKey(today)] = { start: "", end: "", leave: "", commission: false, holiday: false, online: true, authorizedEarlyDeparture: false }; saveShifts(); render(); showToast("Día online agregado"); });
$("export-button").addEventListener("click", exportMonth); $("import-button").addEventListener("click", () => $("import-input").click());
$("reminder-export").addEventListener("click", exportMonth); $("reminder-dismiss").addEventListener("click", () => { localStorage.setItem(`turnario-reminder-dismissed-${monthCode(activeMonth)}`, "true"); $("backup-reminder").hidden = true; });
$("import-input").addEventListener("change", (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result); (data.shifts || []).forEach((shift) => { shifts[shift.date] = { start: shift.start || "", end: shift.end || "", off: Boolean(shift.off), leave: shift.leave || "", commission: Boolean(shift.commission), holiday: Boolean(shift.holiday), online: Boolean(shift.online), authorizedEarlyDeparture: Boolean(shift.authorizedEarlyDeparture), note: shift.note || "" }; }); if (/^\d{4}-\d{2}$/.test(data.month)) { const [year, month] = data.month.split("-").map(Number); activeMonth = new Date(year, month - 1, 1); } saveShifts(); render(); showToast("Registros importados correctamente"); } catch { showToast("No se pudo leer el archivo JSON"); } }; reader.readAsText(file); event.target.value = ""; });
$("shift-form").addEventListener("submit", (event) => { event.preventDefault(); const key = $("dialog-date-value").value; const leave = $("leave-type").value; const commission = $("commission").checked; const holiday = $("holiday").checked; const online = $("online").checked; const authorizedEarlyDeparture = $("authorized-early-departure").checked; shifts[key] = { start: $("start-time").value, end: $("end-time").value, leave: commission || holiday || online ? "" : leave, commission: commission && !holiday && !online, holiday: holiday && !online, online, authorizedEarlyDeparture: commission || holiday || online || leave ? false : authorizedEarlyDeparture }; saveShifts(); $("shift-dialog").close(); render(); showToast("Turno guardado"); });
$("clear-shift").addEventListener("click", () => { if (selectedDate) delete shifts[dateKey(selectedDate)]; saveShifts(); $("shift-dialog").close(); render(); showToast("Registro borrado"); });
render();
