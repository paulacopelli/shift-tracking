const STORAGE_KEY = "turnario-shifts-v1";
const WEEK_MODES_KEY = `${STORAGE_KEY}-week-modes`;
const RECOVERY_GOAL_KEY = `${STORAGE_KEY}-recovery-goal`;
const WORK_WEEK = 44 * 60;
const RECOVERY_PER_DAY = 30;
const DEFAULT_START = "09:00";
let activeMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let shifts = loadShifts();
let weekModes = loadWeekModes();
let recoveryGoalMinutes = Number(localStorage.getItem(RECOVERY_GOAL_KEY)) === 480 ? 480 : 540;
let selectedWeek = new Date();
let selectedDate = null;
const $ = (id) => document.getElementById(id);
const pad = (number) => String(number).padStart(2, "0");
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseMinutes = (time) => { const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes; };
const formatMinutes = (minutes) => { const sign = minutes < 0 ? "-" : ""; const absolute = Math.abs(Math.round(minutes)); return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`; };
const formatLongDate = (date) => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(date);
const monthName = (date) => new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date);
function loadShifts() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function loadWeekModes() { try { const data = JSON.parse(localStorage.getItem(WEEK_MODES_KEY) || "{}"); return data && typeof data === "object" && !Array.isArray(data) ? data : {}; } catch { return {}; } }
function saveShifts() { localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts)); }
function saveWeekModes() { localStorage.setItem(WEEK_MODES_KEY, JSON.stringify(weekModes)); }
function expectedForDate(date) { const day = date.getDay(); return day >= 1 && day <= 4 ? 540 : day === 5 ? 480 : 0; }
function shiftMinutes(shift) { if (!shift || shift.off || shift.holiday || shift.online || shift.commission || shift.leave) return 0; let result = parseMinutes(shift.end) - parseMinutes(shift.start); if (result < 0) result += 1440; return result; }
function creditedMinutes(date, shift, expected = expectedForDate(date)) {
  if (!shift) return 0;
  if (shift.off || shift.holiday || shift.online || shift.commission || shift.leave === "full" || shift.authorizedEarlyDeparture) return expected;
  if (shift.leave === "morning" || shift.leave === "afternoon") return Math.floor(expected / 2);
  return shiftMinutes(shift);
}
function isRecoveryWeek(start) { return Boolean(weekModes[dateKey(start)]?.enabled ?? weekModes[dateKey(start)]); }
function getRecordedDayBalance(date, includeRecovery = false) {
  const shift = shifts[dateKey(date)];
  if (!shift) return null;
  const expected = expectedForDate(date) + (includeRecovery ? recoveryExtraForDate(date) : 0);
  return creditedMinutes(date, shift, expected) - expected;
}
function getRecoveryEarnedForWeek(start) {
  if (!isRecoveryWeek(start)) return 0;
  const net = weekDates(start).reduce((total, date) => {
    const balance = getRecordedDayBalance(date, false);
    return total + (balance ?? 0);
  }, 0);
  return Math.max(0, net);
}
function recoveryEarnedBefore(start) {
  return Object.keys(weekModes).filter((key) => key < dateKey(start) && isRecoveryWeek(parseDateKey(key))).sort()
    .reduce((total, key) => Math.min(recoveryGoalMinutes, total + getRecoveryEarnedForWeek(parseDateKey(key))), 0);
}
function recoveryExtraForDate(date) {
  const start = getWeekStart(date);
  if (!isRecoveryWeek(start) || expectedForDate(date) === 0) return 0;
  let remaining = recoveryGoalMinutes - recoveryEarnedBefore(start);
  if (remaining <= 0) return 0;
  for (const day of weekDates(start)) {
    if (expectedForDate(day) === 0) continue;
    const extra = Math.min(RECOVERY_PER_DAY, remaining);
    if (dateKey(day) === dateKey(date)) return extra;
    remaining -= extra;
    if (remaining <= 0) return 0;
  }
  return 0;
}
function getDailyExpected(date) { return expectedForDate(date) + recoveryExtraForDate(date); }
function getWeekTarget(start) { return weekDates(start).reduce((total, date) => total + getDailyExpected(date), 0); }
function getWeekCredited(start) {
  return weekDates(start).reduce((total, date) => total + creditedMinutes(date, shifts[dateKey(date)], getDailyExpected(date)), 0);
}
function getWeekBalance(start) { return getWeekCredited(start) - getWeekTarget(start); }
function parseDateKey(key) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); }
function getMonthWeeks() {
  const weeks = new Map();
  monthDates().forEach((date) => { const start = getWeekStart(date); weeks.set(dateKey(start), start); });
  return [...weeks.values()];
}
function getWeekSurplusByDate(start) {
  const balances = weekDates(start).map((date) => ({ date, balance: getRecordedDayBalance(date) })).filter((item) => item.balance !== null);
  const surplus = Math.max(0, balances.reduce((total, item) => total + item.balance, 0));
  const allocation = new Map();
  let remaining = surplus;
  balances.filter((item) => item.balance > 0).forEach(({ date, balance }) => {
    const amount = Math.min(balance, remaining);
    if (amount > 0) allocation.set(dateKey(date), amount);
    remaining -= amount;
  });
  return allocation;
}
function getMonthOvertime() {
  return getMonthWeeks().reduce((total, start) => {
    for (const [key, minutes] of getWeekSurplusByDate(start)) {
      const date = parseDateKey(key);
      if (date.getMonth() === activeMonth.getMonth() && date.getFullYear() === activeMonth.getFullYear()) total += minutes;
    }
    return total;
  }, 0);
}
function getMonthResidualDeficit() {
  return getMonthWeeks().reduce((total, start) => {
    const records = weekDates(start).map((date) => ({ date, balance: getRecordedDayBalance(date) })).filter((item) => item.balance !== null);
    let surplus = records.reduce((sum, item) => sum + Math.max(0, item.balance), 0);
    records.filter((item) => item.balance < 0).forEach(({ date, balance }) => {
      const missing = -balance;
      const offset = Math.min(missing, surplus);
      surplus -= offset;
      const remaining = missing - offset;
      if (date.getMonth() === activeMonth.getMonth() && date.getFullYear() === activeMonth.getFullYear()) total += remaining;
    });
    return total;
  }, 0);
}
function recoveryProgress() {
  return Object.keys(weekModes).filter((key) => isRecoveryWeek(parseDateKey(key))).sort()
    .reduce((total, key) => Math.min(recoveryGoalMinutes, total + getRecoveryEarnedForWeek(parseDateKey(key))), 0);
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
function getMonthData() { return monthDates().reduce((data, date) => { const shift = shifts[dateKey(date)]; const expected = getDailyExpected(date); data.worked += shiftMinutes(shift); data.credited += creditedMinutes(date, shift, expected); data.expected += expected; return data; }, { worked: 0, credited: 0, expected: 0 }); }
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
    const key = dateKey(date); const shift = shifts[key]; const minutes = shiftMinutes(shift); const expected = getDailyExpected(date); const credited = creditedMinutes(date, shift, expected);
    const cell = document.createElement("button"); cell.type = "button"; cell.className = "calendar-cell"; cell.dataset.date = key;
    if (dateKey(new Date()) === key) cell.classList.add("today"); if (date.getDay() === 0 || date.getDay() === 6) cell.classList.add("weekend");
    if (shift && credited >= expected && expected > 0) cell.classList.add("complete"); else if (shift && credited < expected && expected > 0) cell.classList.add("short");
    cell.innerHTML = `<span class="day-number">${date.getDate()}</span><span class="day-duration">${statusLabel(date, shift, minutes)}</span>`;
    cell.addEventListener("click", () => openDialog(date)); calendar.appendChild(cell);
  });
}
function renderStats() {
  const data = getMonthData(); const balance = data.credited - data.expected; const overtime = getMonthOvertime();
  $("worked-hours").textContent = formatMinutes(data.worked); $("worked-caption").textContent = `sobre ${formatMinutes(data.expected)} esperadas`;
  $("monthly-balance").textContent = formatMinutes(balance); $("monthly-balance").style.color = balance < -59 ? "#c87853" : "";
  $("balance-caption").textContent = balance >= 0 ? "objetivo mensual cumplido" : `${formatMinutes(Math.abs(balance))} por completar`;
  $("overtime-hours").textContent = formatMinutes(overtime);
  const deductionMinutes = getMonthResidualDeficit();
  $("deduction-days").textContent = `${deductionMinutes >= 59 ? deductionMinutes : 0} min`;
  $("deduction-caption").textContent = deductionMinutes >= 59 ? "faltantes netos del mes, tras compensar extras semanales" : `${deductionMinutes} min netos; se muestran desde 59 min`;
}
function renderWeek() {
  const start = getWeekStart(selectedWeek); selectedWeek = start; const dates = weekDates(start); const credited = getWeekCredited(start); const target = getWeekTarget(start); const balance = credited - target; const todayStart = getWeekStart(new Date());
  const end = dates[6]; const rangeLabel = `${dates[0].getDate()} — ${end.getDate()} ${new Intl.DateTimeFormat("es-AR", { month: "short" }).format(end)}`;
  $("week-title").textContent = dateKey(start) === dateKey(todayStart) ? "Esta semana" : "Balance semanal";
  $("week-range").textContent = rangeLabel;
  $("week-worked").textContent = formatMinutes(credited); $("week-target").textContent = `/ ${formatMinutes(target)} hs`; $("week-progress").style.width = `${Math.min(100, (credited / target) * 100)}%`;
  $("week-status").textContent = balance >= 0 ? "Cumplida" : "Pendiente"; $("week-status").className = `status-pill ${balance >= 0 ? "good" : "bad"}`;
  $("week-helper").textContent = balance >= 0 ? `${formatMinutes(balance)} por encima del objetivo. Las horas extra no son remuneradas.` : `${formatMinutes(Math.abs(balance))} restantes para completar la semana.`;
  $("toggle-recovery").textContent = isRecoveryWeek(start) ? "Desactivar recuperación" : "Activar recuperación";
  $("toggle-recovery").setAttribute("aria-pressed", String(isRecoveryWeek(start)));
  $("recovery-goal").value = String(recoveryGoalMinutes);
  const recovered = recoveryProgress();
  $("recovery-progress").textContent = recovered >= recoveryGoalMinutes ? "Objetivo de recuperación alcanzado." : `${formatMinutes(recovered)} recuperadas de ${formatMinutes(recoveryGoalMinutes)}.`;
  $("week-days").innerHTML = dates.map((date) => { const shift = shifts[dateKey(date)]; const mins = shiftMinutes(shift); const creditedDay = creditedMinutes(date, shift, getDailyExpected(date)); const expected = getDailyExpected(date); const label = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(date).replace(".", "").slice(0, 3).toUpperCase(); return `<div class="week-day"><span class="weekday">${label}</span><span class="bar"><i style="width:${expected ? Math.min(100, creditedDay / expected * 100) : creditedDay ? 100 : 0}%"></i></span><span class="hours">${shift?.commission ? "COM" : shift?.holiday ? "FER" : shift?.online ? "ONL" : shift?.leave ? "LIC" : mins ? formatMinutes(mins) : "—"}</span></div>`; }).join("");
}
function renderWeeksTable() {
  const weeks = getMonthWeeks();
  $("weeks-table").innerHTML = weeks.map((start, index) => { const dates = weekDates(start); const monthScopedDates = dates.filter((date) => date.getMonth() === activeMonth.getMonth() && date.getFullYear() === activeMonth.getFullYear()); const worked = monthScopedDates.reduce((sum, date) => sum + shiftMinutes(shifts[dateKey(date)]), 0); const credited = getWeekCredited(start); const target = getWeekTarget(start); const balance = credited - target; const status = credited >= target ? ["Cumplida", ""] : credited === 0 ? ["Sin registrar", "neutral"] : [balance <= -59 ? "Descuento" : "En curso", "warning"]; return `<tr><td><button class="week-link" type="button" data-week="${dateKey(start)}">${dateKey(start) === dateKey(getWeekStart(selectedWeek)) ? "● " : ""}Semana ${index + 1}</button></td><td>${start.getDate()} — ${dates[6].getDate()} ${new Intl.DateTimeFormat("es-AR", { month: "short" }).format(dates[6])}</td><td>${formatMinutes(worked)}</td><td>${formatMinutes(balance)}</td><td class="table-status ${status[1]}">${status[0]}</td></tr>`; }).join("");
}
function openDialog(date) {
  selectedDate = date; const key = dateKey(date); const shift = shifts[key]; const expected = expectedForDate(date); $("dialog-date").textContent = formatLongDate(date); $("dialog-date-value").value = key;
  $("dialog-schedule").textContent = expected ? `Jornada sugerida: ${DEFAULT_START} — ${expected === 540 ? "18:00" : "17:00"}` : "Fin de semana · sin jornada esperada";
  $("start-time").value = shift?.start || DEFAULT_START; $("end-time").value = shift?.end || (expected === 540 ? "18:00" : expected === 480 ? "17:00" : "18:00"); $("leave-type").value = shift?.leave || (shift?.off ? "full" : ""); $("commission").checked = Boolean(shift?.commission); $("holiday").checked = Boolean(shift?.holiday); $("online").checked = Boolean(shift?.online); $("authorized-early-departure").checked = Boolean(shift?.authorizedEarlyDeparture); $("shift-dialog").showModal();
}
function exportMonth() {
  const payload = { month: `${activeMonth.getFullYear()}-${pad(activeMonth.getMonth() + 1)}`, exportedAt: new Date().toISOString(), weeklyTargetMinutes: WORK_WEEK, recoveryGoalMinutes, weekModes: Object.fromEntries(getMonthWeeks().filter(isRecoveryWeek).map((start) => [dateKey(start), weekModes[dateKey(start)]])), shifts: monthDates().filter((date) => shifts[dateKey(date)]).map((date) => ({ date: dateKey(date), ...shifts[dateKey(date)] })) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `turnario-${payload.month}.json`; link.click(); URL.revokeObjectURL(link.href);
  const csv = ["Fecha,Ingreso,Salida,Horas,Estado,Observaciones", ...payload.shifts.map((shift) => `${shift.date},${shift.commission || shift.leave || shift.holiday || shift.online ? "" : shift.start},${shift.commission || shift.leave || shift.holiday || shift.online ? "" : shift.end},${formatMinutes(shiftMinutes(shift))},${shift.commission ? "Comisión de servicio" : shift.holiday ? "Feriado" : shift.online ? "Día online" : shift.leave ? `Licencia ${shift.leave}` : shift.authorizedEarlyDeparture ? "Salida anticipada autorizada" : "Trabajado"},"${(shift.note || "").replaceAll('"', '""')}"`)].join("\n"); const csvLink = document.createElement("a"); csvLink.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); csvLink.download = `turnario-${payload.month}.csv`; csvLink.click(); URL.revokeObjectURL(csvLink.href); showToast("Mes exportado en JSON y CSV");
  localStorage.setItem(`turnario-exported-${payload.month}`, "true"); renderBackupReminder();
}
function showToast(message) { const toast = $("toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2600); }
$("previous-month").addEventListener("click", () => { activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1); render(); });
$("next-month").addEventListener("click", () => { activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1); render(); });
$("today-button").addEventListener("click", () => { const today = new Date(); activeMonth = new Date(today.getFullYear(), today.getMonth(), 1); selectedWeek = today; render(); });
$("previous-week").addEventListener("click", () => { selectedWeek = new Date(getWeekStart(selectedWeek).getFullYear(), getWeekStart(selectedWeek).getMonth(), getWeekStart(selectedWeek).getDate() - 7); renderWeek(); renderWeeksTable(); });
$("next-week").addEventListener("click", () => { selectedWeek = new Date(getWeekStart(selectedWeek).getFullYear(), getWeekStart(selectedWeek).getMonth(), getWeekStart(selectedWeek).getDate() + 7); renderWeek(); renderWeeksTable(); });
$("current-week").addEventListener("click", () => { selectedWeek = new Date(); renderWeek(); renderWeeksTable(); });
$("weeks-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-week]");
  if (!button) return;
  selectedWeek = parseDateKey(button.dataset.week);
  renderWeek();
  renderWeeksTable();
});
$("toggle-recovery").addEventListener("click", () => {
  const key = dateKey(getWeekStart(selectedWeek));
  if (isRecoveryWeek(selectedWeek)) delete weekModes[key];
  else weekModes[key] = { enabled: true };
  saveWeekModes();
  render();
});
$("recovery-goal").addEventListener("change", (event) => {
  recoveryGoalMinutes = Number(event.target.value) === 480 ? 480 : 540;
  localStorage.setItem(RECOVERY_GOAL_KEY, String(recoveryGoalMinutes));
  render();
});
$("online-button").addEventListener("click", () => { const today = new Date(); activeMonth = new Date(today.getFullYear(), today.getMonth(), 1); shifts[dateKey(today)] = { start: "", end: "", leave: "", commission: false, holiday: false, online: true, authorizedEarlyDeparture: false }; saveShifts(); render(); showToast("Día online agregado"); });
$("export-button").addEventListener("click", exportMonth); $("import-button").addEventListener("click", () => $("import-input").click());
$("reminder-export").addEventListener("click", exportMonth); $("reminder-dismiss").addEventListener("click", () => { localStorage.setItem(`turnario-reminder-dismissed-${monthCode(activeMonth)}`, "true"); $("backup-reminder").hidden = true; });
$("import-input").addEventListener("change", (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result); (data.shifts || []).forEach((shift) => { shifts[shift.date] = { start: shift.start || "", end: shift.end || "", off: Boolean(shift.off), leave: shift.leave || "", commission: Boolean(shift.commission), holiday: Boolean(shift.holiday), online: Boolean(shift.online), authorizedEarlyDeparture: Boolean(shift.authorizedEarlyDeparture), note: shift.note || "" }; }); if (data.weekModes && typeof data.weekModes === "object" && !Array.isArray(data.weekModes)) Object.entries(data.weekModes).forEach(([key, mode]) => { if (/^\d{4}-\d{2}-\d{2}$/.test(key) && (mode === true || mode?.enabled)) weekModes[key] = { enabled: true }; }); if (data.recoveryGoalMinutes === 480 || data.recoveryGoalMinutes === 540) { recoveryGoalMinutes = data.recoveryGoalMinutes; localStorage.setItem(RECOVERY_GOAL_KEY, String(recoveryGoalMinutes)); } if (/^\d{4}-\d{2}$/.test(data.month)) { const [year, month] = data.month.split("-").map(Number); activeMonth = new Date(year, month - 1, 1); } saveShifts(); saveWeekModes(); render(); showToast("Registros importados correctamente"); } catch { showToast("No se pudo leer el archivo JSON"); } }; reader.readAsText(file); event.target.value = ""; });
$("shift-form").addEventListener("submit", (event) => { event.preventDefault(); const key = $("dialog-date-value").value; const leave = $("leave-type").value; const commission = $("commission").checked; const holiday = $("holiday").checked; const online = $("online").checked; const authorizedEarlyDeparture = $("authorized-early-departure").checked; shifts[key] = { start: $("start-time").value, end: $("end-time").value, leave: commission || holiday || online ? "" : leave, commission: commission && !holiday && !online, holiday: holiday && !online, online, authorizedEarlyDeparture: commission || holiday || online || leave ? false : authorizedEarlyDeparture }; saveShifts(); $("shift-dialog").close(); render(); showToast("Turno guardado"); });
$("clear-shift").addEventListener("click", () => { if (selectedDate) delete shifts[dateKey(selectedDate)]; saveShifts(); $("shift-dialog").close(); render(); showToast("Registro borrado"); });
render();
