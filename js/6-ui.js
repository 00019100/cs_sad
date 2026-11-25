"use strict";
/* ================================================================== 5. UI
   Screens only read the form, call a service and draw the result. No business rule lives here. */
const app = new Application();
seed(app);
const store = app.store;
const ui = { user: null, route: "login", params: {}, form: {}, errors: {}, modal: "", flashes: [] };

const h = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const attr = obj => h(JSON.stringify(obj || {}));
const flash = (text, kind = "ok") => ui.flashes.push({ text, kind });
function go(route, params = {}) {
  if (route === "followups") { if (params.task || params.student) followFilter.jumpToSelected = true; else followFilter.page = 1; }   // show the page that holds the chosen task
  Object.assign(ui, { route, params, form: {}, errors: {}, modal: "" }); render(); window.scrollTo(0, 0);
}

/* ---- building blocks */
const link = (label, route, params, cls = "") => `<a href="#" class="${cls}" data-go="${route}" data-params="${attr(params)}">${label}</a>`;
const actBtn = (label, act, args, cls = "btn", extra = "") => `<button type="button" class="${cls}" data-act="${act}" data-args="${attr(args)}" ${extra}>${h(label)}</button>`;
const badge = (text, kind = "") => `<span class="badge ${kind}">${h(text)}</span>`;
const statusBadge = s => badge(s, { [StudentStatus.ACTIVE]: "ok", [StudentStatus.ARCHIVED]: "muted", [StudentStatus.READY]: "warn" }[s] || "info");
const payBadge = s => badge(s, { [PaymentStatus.PAID]: "ok", [PaymentStatus.PARTIAL]: "warn", [PaymentStatus.OUTSTANDING]: "bad" }[s]);
const card = (title, body, cls = "") => `<section class="card ${cls}">${title ? `<h3>${title}</h3>` : ""}${body}</section>`;
const studentLink = s => link(h(s.fullName), "profile", { id: s.id });
const courseName = s => store.courses.get(s.courseId).name;
const branchName = id => store.branches.get(id).name;
const branchLabel = id => { const n = branchName(id); return /branch/i.test(n) ? n : `${n} branch`; };
const val = name => ui.form[name] ?? "";
function table(headers, rows, empty = "Nothing to show.") {
  if (!rows.length) return `<p class="empty">${h(empty)}</p>`;
  return `<div class="scroll"><table class="grid"><thead><tr>${headers.map(x => `<th>${h(x)}</th>`).join("")}</tr></thead><tbody>${
    rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const PAGE_SIZE = 10;
/** Cuts a list into pages. The page number lives in the screen's parameters, so filters reset it. */
function pagerHtml(page, pages, first, shownCount, total, noun, to) {
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  let numbers = "", last = 0;
  for (const n of shown) { if (n - last > 1) numbers += `<span class="muted">…</span>`; numbers += to(n, n, n === page); last = n; }
  return `<nav class="pager" aria-label="Pages"><span class="muted">Showing ${first + 1}–${first + shownCount} of ${total} ${noun}</span>
    <span class="row tight">${to(page - 1, "‹ Previous")}${numbers}${to(page + 1, "Next ›")}</span></nav>`;
}
function paginate(items, noun = "entries", size = PAGE_SIZE, key = "page") {
  const pages = Math.max(1, Math.ceil(items.length / size)), page = Math.min(Math.max(1, Number(ui.params[key]) || 1), pages);
  const first = (page - 1) * size, slice = items.slice(first, first + size);
  if (pages === 1) return { slice, pager: "" };
  const to = (n, label, on) => n < 1 || n > pages ? `<span class="btn small disabled">${label}</span>`
    : `<a href="#" class="btn small${on ? " primary" : ""}" data-go="${ui.route}" data-params="${attr({ ...ui.params, [key]: n })}" data-keep="1"${on ? ' aria-current="page"' : ""}>${label}</a>`;
  return { slice, pager: pagerHtml(page, pages, first, slice.length, items.length, noun, to) };
}
const errorLine = name => ui.errors[name] ? `<em>! ${h(ui.errors[name])}</em>` : "";
const star = required => required ? ` <span class="req">*</span>` : "";
function field(label, name, o = {}) {
  const value = o.value ?? val(name);
  return `<label class="field${ui.errors[name] ? " bad" : ""}"><span>${h(label)}${star(o.required)}</span>
    <input id="f-${name}" type="${o.type || "text"}" name="${name}" value="${h(value)}" placeholder="${h(o.placeholder || "")}" ${o.extra || ""}>${errorLine(name)}${
    o.hint && !ui.errors[name] ? `<small class="hint">${h(o.hint)}</small>` : ""}</label>`;
}
function select(label, name, options, o = {}) {
  const value = String(o.value ?? val(name));
  const opts = (o.blank ? `<option value="">${h(o.blank)}</option>` : "") + options.map(op => {
    const [v, t] = Array.isArray(op) ? op : [op, op];
    return `<option value="${h(v)}"${String(v) === value ? " selected" : ""}>${h(t)}</option>`; }).join("");
  return `<label class="field${ui.errors[name] ? " bad" : ""}">${label ? `<span>${h(label)}${star(o.required)}</span>` : ""}<select id="f-${name}" name="${name}">${opts}</select>${errorLine(name)}</label>`;
}
function radios(label, name, options, o = {}) {
  const value = o.value ?? val(name);
  return `<div class="field${ui.errors[name] ? " bad" : ""}"><span>${h(label)}${star(o.required)}</span><div class="radios">${options.map((op, i) =>
    `<label class="radio"><input type="radio" id="f-${name}-${i}" name="${name}" value="${h(op)}"${op === value ? " checked" : ""}> ${h(op)}</label>`).join("")}</div>${errorLine(name)}</div>`;
}
function textarea(label, name, o = {}) {
  return `<label class="field${ui.errors[name] ? " bad" : ""}"><span>${h(label)}${star(o.required)}</span><textarea id="f-${name}" name="${name}" rows="${o.rows || 2}" placeholder="${h(o.placeholder || "")}">${h(o.value ?? val(name))}</textarea>${errorLine(name)}</label>`;
}
const checkbox = (label, name) => `<label class="check"><input type="checkbox" id="f-${name}" name="${name}" value="1"${val(name) ? " checked" : ""}> ${h(label)}</label>`;
const modal = (title, body) => `<div class="overlay" role="dialog" aria-modal="true"><div class="modal"><h2>⚠ ${h(title)}</h2>${body}</div></div>`;
const STEPS = [StudentStatus.REGISTERED, StudentStatus.PLACED, StudentStatus.GROUP_ASSIGNED, StudentStatus.READY, StudentStatus.ACTIVE];
function statusBar(status) {
  if (status === StudentStatus.ARCHIVED) return `<div class="steps"><div class="step archived"><b>Archived</b></div></div>`;
  const current = STEPS.indexOf(status);
  return `<div class="steps">${STEPS.map((s, i) => { const [name, sub] = s.split(": ");
    return `<div class="step ${i < current ? "done" : i === current ? "now" : ""}"><b>${h(name)}</b><small>${h(sub || "")}</small></div>`; }).join("")}</div>`;
}
function searchStudents(q) {
  const t = q.trim().toLowerCase();
  return store.students.find(s => s.branchId === ui.user.branchId && (s.fullName.toLowerCase().includes(t) || s.phone.includes(t.replace(/\s/g, "")) || s.code.toLowerCase().includes(t)));
}

const icon = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  tasks: icon('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
  register: icon('<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.4 3.2-5.5 6.5-5.5 1.2 0 2.300.3 3.200.8M18 14v6M15 17h6"/>'),
  students: icon('<circle cx="9" cy="8" r="3.5"/><path d="M2.500 20c.6-3.400 3.200-5.500 6.500-5.500s5.900 2.100 6.500 5.500M16 4.800a3.500 3.500 0 010 6.400M18.500 14.800c1.600.9 2.700 2.600 3 5.200"/>'),
  payments: icon('<rect x="3" y="5.500" width="18" height="13" rx="2.500"/><path d="M3 10h18M7 15h4"/>'),
  overdue: icon('<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>'),
  followups: icon('<path d="M4 5.500h16v10.500H10l-4.500 3.500V16H4z"/><path d="M8 9.500h8M8 12.500h5"/>'),
  mock: icon('<rect x="4" y="5" width="16" height="15" rx="2.500"/><path d="M8 3v4M16 3v4M4 10h16M8.500 14.500l2 2 4-4"/>'),
  report: icon('<path d="M4 20h16M7 20v-7M12 20V5M17 20v-10"/>'),
  activity: icon('<path d="M5 4h10l4 4v12H5z"/><path d="M14.500 4v4.500H19M8.500 12h7M8.500 15.500h7"/>'),
  alert: icon('<path d="M12 4l9 15.500H3z"/><path d="M12 10v4.500M12 17.200v.1"/>'),
  phone: icon('<path d="M6 3.500h3l1.500 4.500-2 1.500a11 11 0 005.500 5.500l1.500-2 4.500 1.500v3c0 1-1 2-2 2C10 19.500 4.500 14 4 5.500c0-1 1-2 2-2z"/>'),
  up: icon('<path d="M12 19V5M6 11l6-6 6 6"/>'), down: icon('<path d="M12 5v14M6 13l6 6 6-6"/>'),
};
const MENU = [
  ["Today", [["tasks", "Daily tasks", P.VIEW_TASKS], ["followups", "Follow-ups", P.FOLLOW_UP]]],
  ["Enrolment", [["register", "Register student", P.REGISTER], ["students", "Students", P.VIEW_STUDENTS], ["mock", "Mock test booking", P.MOCK_BOOKING]]],
  ["Finance", [["payments", "Payments", P.TAKE_PAYMENT], ["overdue", "Overdue payments", P.VIEW_OVERDUE]]],
  ["Oversight", [["report", "Monthly report", P.VIEW_REPORT], ["activity", "Activity log", P.VIEW_LOG]]],
];
const tile = (value, label, iconName, tone = "") => `<div class="tile ${tone}"><b>${value}</b><span class="chipicon">${ICON[iconName]}</span><span class="label">${label}</span></div>`;
const meter = (left, capacity) => `<span class="meter${left / capacity <= 0.2 ? " low" : ""}" title="${capacity - left} of ${capacity} taken"><i style="width:${Math.round((capacity - left) / capacity * 100)}%"></i></span>`;

/* ---- screens: each returns { title, body, active, needs } */
const SCREENS = {};

SCREENS.tasks = () => {
  const user = ui.user, day = today(), c = app.followups.counters(user.branchId);
  const ACTION = { [TaskType.PLACEMENT]: ["Open test", "placement", P.PLACEMENT], [TaskType.ASSIGN_GROUP]: ["Assign group", "group", P.ASSIGN_GROUP],
    [TaskType.ACTIVATE]: ["Open profile", "profile", P.ACTIVATE], [TaskType.ABSENT]: ["Log call", "followups", P.FOLLOW_UP],
    [TaskType.PAYMENT_OVERDUE]: ["View overdue", "overdue", P.VIEW_OVERDUE], [TaskType.MONTHLY_CHECKIN]: ["Log call", "followups", P.FOLLOW_UP],
    [TaskType.WAITING_LIST]: ["Assign group", "group", P.ASSIGN_GROUP] };
  const { tq = "", ttype = "", towner = "" } = ui.params, needle = tq.trim().toLowerCase();
  const allTasks = app.followups.openTasks(user.branchId);
  const shownTasks = allTasks.filter(t => (!ttype || t.type === ttype) && (!towner || t.ownerRole === towner)
    && (!needle || (store.students.get(t.studentId).fullName + " " + t.detail + " " + t.type).toLowerCase().includes(needle)));
  const taskPage = paginate(shownTasks, "tasks", 8);
  const taskOpts = (list, chosen, blank) => `<option value="">${blank}</option>` + list.map(v => `<option value="${h(v)}"${v === chosen ? " selected" : ""}>${h(v)}</option>`).join("");
  const taskFiltered = tq || ttype || towner;
  const taskTools = allTasks.length ? `<div class="row filters tools">
    <input type="search" id="live-tq" data-live="tq" value="${h(tq)}" placeholder="Search by student or detail" aria-label="Search tasks">
    <select id="live-ttype" data-live="ttype" aria-label="Task type">${taskOpts([...new Set(allTasks.map(t => t.type))], ttype, "All task types")}</select>
    <select id="live-towner" data-live="towner" aria-label="Responsible role">${taskOpts([...new Set(allTasks.map(t => t.ownerRole))], towner, "All staff roles")}</select>
    <span class="muted">${taskFiltered ? `${shownTasks.length} of ${allTasks.length}` : `${allTasks.length} tasks`}</span>
    ${taskFiltered ? `<a href="#" class="btn small ghost" data-go="tasks" data-keep="1" data-params="{}">Clear</a>` : ""}</div>` : "";
  const rows = taskPage.slice.map(t => {
    const s = store.students.get(t.studentId), [label, route, permission] = ACTION[t.type];
    const params = route === "followups" ? { task: t.id } : { id: s.id };
    return [badge(t.type, [TaskType.ABSENT, TaskType.PAYMENT_OVERDUE].includes(t.type) ? "bad" : "info"), studentLink(s), h(t.detail), h(t.dueLabel(day)),
      user.can(permission) ? link(label, route, params, "btn small") : `<span class="muted">${h(t.ownerRole)}</span>`];
  });
  let refunds = "";
  if (user.can(P.APPROVE_REFUND)) {
    const pending = store.refunds.find(r => r.isPending()).map(r => [studentLink(store.students.get(r.studentId)), `<span class="num">${money(r.amount)}</span>`, h(r.centreError),
      actBtn("Approve", "decideRefund", { id: r.id, approve: true }, "btn small primary") + " " + actBtn("Reject", "decideRefund", { id: r.id, approve: false }, "btn small")]);
    refunds = card("Refund requests waiting for approval <small>UC18</small>", table(["Student", "Amount", "Centre error", ""], pending, "No refund requests."));
  }
  const tiles = tile(c.fresh, "New students to test", "register") + tile(c.absent, "Absent today", "alert", c.absent ? "bad" : "")
    + tile(c.payments, "Payment tasks", "payments", "warn") + tile(c.followups, "Open follow-ups", "phone", "info");
  return { title: "Daily task list", active: "tasks", needs: P.VIEW_TASKS,
    headerAction: user.can(P.REGISTER) ? link("+ Register new student", "register", {}, "btn primary") : "", body: `
    <p class="lead">What needs doing today, created by the system from registrations, absences and due dates.</p>
    <div class="tiles">${tiles}</div>${refunds}
    ${card("Tasks created by the system", taskTools + table(["Task", "Student", "Detail", "Due", "Action"], rows, taskFiltered ? "No task matches the search." : "No open tasks.") + taskPage.pager)}
    ${card("Notes for the end-of-day meeting with the Coordinator", `<form data-act="saveNotes">
      <textarea class="wide" id="f-notes" name="notes" rows="3" placeholder="e.g. Parent asked to move the student to the evening group.">${h(app.followups.meetingNotes(user))}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn">Save notes</button>${actBtn("Copy daily summary", "copySummary", {}, "btn ghost")}
      <span class="muted">The face-to-face meeting stays; this only prepares it.</span></div></form>`)}` };
};

SCREENS.students = () => {
  const q = ui.params.q || "", status = ui.params.status || "";
  const found = (q ? searchStudents(q) : store.students.find(s => s.branchId === ui.user.branchId)).filter(s => !status || s.status === status).sort((a, b) => b.id - a.id);
  const { slice, pager } = paginate(found, "students");
  const rows = slice.map(s => [`<span class="mono">${h(s.code)}</span>`, studentLink(s), h(courseName(s)) + (s.level ? ` · ${h(s.level)}` : ""), h(showPhone(s.phone)), statusBadge(s.status)]);
  return { title: "Students", active: "students", needs: P.VIEW_STUDENTS, body: `
    <form class="row filters" data-act="filter" data-route="students"><input type="search" id="f-q" name="q" value="${h(q)}" placeholder="Search by name, phone number or student ID" aria-label="Search students">
    ${select("", "status", Object.values(StudentStatus), { value: status, blank: "All statuses" })}<button class="btn">Search</button></form>
    ${card(`${found.length} students`, table(["ID", "Name", "Course", "Phone", "Status"], rows, "No student matches the search.") + pager)}` };
};

SCREENS.register = () => {
  const courses = store.courses.find().map(c => [c.id, c.name]);
  if (ui.form.channel === undefined) ui.form.channel = ContactChannel.WALK_IN;
  return { title: "Register new student", active: "register", needs: P.REGISTER, body: `
    <form data-act="register" class="card">
    <div class="cols">${field("Branch", "branch", { value: `${branchName(ui.user.branchId)} (chosen at sign-in)`, extra: "disabled" })}
    ${radios("How did the student contact us?", "channel", Object.values(ContactChannel), { required: true })}</div>
    <div class="cols three">${field("Full name", "fullName", { placeholder: "Surname and first name", required: true })}
    ${field("Date of birth", "dateOfBirth", { type: "date", required: true })}${select("Course", "courseId", courses, { required: true, blank: "Choose a course" })}</div>
    <h3>Contact details <small>UC04</small></h3>
    <div class="cols three">${field("Student phone", "phone", { placeholder: "+998 90 123 45 67", required: true })}
    ${field("Parent phone", "parentPhone", { placeholder: "+998 90 123 45 67", required: true, hint: "Required for students under 18" })}
    <div>${checkbox("Not applicable (adult student)", "parentNa")}${field("Reason", "parentNaReason", { placeholder: "e.g. adult, lives alone" })}</div></div>
    <div class="cols three">${field("Telegram username", "telegram", { placeholder: "@username", hint: "Main channel for messages" })}
    <div>${checkbox("No Telegram on this number", "noTelegram")}${radios("Backup contact", "backupContact", ["SMS", "Phone call"])}</div><div></div></div>
    ${textarea("Comment", "comment", { placeholder: "Optional note, e.g. wants evening classes" })}
    <div class="row between">${link("Cancel", "tasks", {}, "btn ghost")}<button class="btn primary">Save student</button></div>
    <p class="muted">On save the student gets a unique ID and the status “${StudentStatus.REGISTERED}”. Cancel discards the draft.</p></form>
    <p class="muted">Demo tip: the parent phone ${h(showPhone(store.settings.demoParentPhone))} is already on record, so using it shows the duplicate check.</p>` };
};

SCREENS.profile = () => {
  const user = ui.user, s = store.students.get(ui.params.id), day = today();
  const enrolment = app.groups.currentEnrolment(s), group = enrolment ? store.groups.get(enrolment.groupId) : null;
  const payables = app.payments.payablesFor(s), archived = s.isArchived(), age = s.ageOn(day);
  const contact = `<dl><dt>Student phone</dt><dd>${h(showPhone(s.phone))}</dd>
    <dt>Parent phone</dt><dd>${s.parentPhone ? h(showPhone(s.parentPhone)) : "not applicable: " + h(s.parentNaReason)}</dd>
    <dt>Telegram</dt><dd>${s.telegram ? h(s.telegram) : badge("No Telegram", "warn") + " backup: " + h(s.backupContact)}</dd>
    <dt>Reminders</dt><dd>${s.remindersOn ? badge("ON", "ok") : badge("OFF", "muted")} <span class="muted">the student's own choice</span></dd>
    <dt>Age</dt><dd>${age} ${age < 18 ? badge("under 18", "info") : ""}</dd></dl>`;
  const study = `<dl><dt>Course</dt><dd>${h(courseName(s))}</dd><dt>Level</dt><dd>${h(s.level) || "not placed yet"}</dd>
    <dt>Group</dt><dd>${group ? `${h(group.code)} · ${h(group.slot)} · ${h(group.teacher)}` : "none"}</dd>
    <dt>Fee / paid</dt><dd class="num">${enrolment ? `${money(enrolment.fee)} / ${money(enrolment.paid)}` : "set when the group is assigned"}</dd>
    <dt>Payment</dt><dd>${enrolment ? `${payBadge(enrolment.paymentStatus)} due ${fmtDate(enrolment.dueDate)}` : "—"}</dd></dl>`;
  const action = (label, route, params, permission, enabled, primary, why) => !user.can(permission) ? "" :
    enabled ? link(label, route, params, "btn" + (primary ? " primary" : "")) : `<span class="btn disabled" title="${h(why || "")}">${label}</span>`;
  const actions = [
    action("Conduct placement test", "placement", { id: s.id }, P.PLACEMENT, s.canTakePlacement(), s.status === StudentStatus.REGISTERED, "Already placed in a group"),
    action(enrolment ? "Move group" : "Assign to group", "group", { id: s.id }, P.ASSIGN_GROUP, s.canBeAssigned(), s.status === StudentStatus.PLACED, "Needs a confirmed level first"),
    action("Take payment", "payments", { student: s.id }, P.TAKE_PAYMENT, payables.length > 0 && !archived, s.status === StudentStatus.GROUP_ASSIGNED, "No group or mock exam booking yet"),
    user.can(P.ACTIVATE) ? actBtn("Activate", "activate", { id: s.id }, "btn" + (s.canBeActivated() ? " primary" : ""), s.canBeActivated() ? "" : `disabled title="Available after the first payment"`) : "",
    action("Book mock exam", "mock", { student: s.id }, P.MOCK_BOOKING, !archived),
    action("Log contact", "followups", { student: s.id }, P.FOLLOW_UP, !archived),
    user.can(P.FOLLOW_UP) && s.status === StudentStatus.ACTIVE ? actBtn("Record absence today", "markAbsent", { id: s.id }, "btn ghost") : "",
    action("Archive", "archive", { id: s.id }, P.ARCHIVE, !archived)].join("");
  const history = [];
  store.activity.find(a => a.studentId === s.id).forEach(a => history.push({ at: a.at, row: [fmtDT(a.at), h(a.staffName), `<b>${h(a.action)}</b>`,
    [a.oldValue && a.newValue ? `${h(a.oldValue)} → ${h(a.newValue)}` : h(a.newValue), h(a.comment)].filter(Boolean).join(" · ")] }));
  app.followups.history(s).forEach(c => history.push({ at: c.at, row: [fmtDT(c.at), h(c.automatic ? "System" : c.staffName),
    `<b>${h(c.channel)}</b> to ${h(c.contacted.toLowerCase())}`, `${badge(c.result, [ContactResult.ANSWERED, ContactResult.SENT].includes(c.result) ? "ok" : "warn")} ${h(c.comment)}`] }));
  history.sort((a, b) => b.at - a.at);
  const historyPage = paginate(history, "history entries");
  const bookings = store.bookings.find(b => b.studentId === s.id && !b.cancelled).sort((a, b) => b.id - a.id)
    .map(b => [h(b.sessionLabel), b.confirmed ? badge("Confirmed", "ok") : badge("Booked, unpaid", "warn"), h(b.band) || "—", h(b.scores) || "—"]);
  const edit = user.can(P.REGISTER) && !archived ? `<details${ui.params.edit ? " open" : ""}><summary>Correct contact details</summary><form data-act="editContact" data-args="${attr({ id: s.id })}" class="cols three">
    ${field("Student phone", "phone", { value: ui.form.phone ?? showPhone(s.phone), required: true })}${field("Telegram username", "telegram", { value: ui.form.telegram ?? s.telegram })}
    <label class="check"><input type="checkbox" id="f-remindersOn" name="remindersOn" value="1"${s.remindersOn ? " checked" : ""}> Send reminders</label>
    ${field("Reason for the correction", "comment", { required: true, placeholder: "Old and new values are kept" })}<div><button class="btn">Save correction</button></div></form></details>` : "";
  return { title: h(s.fullName), active: "students", needs: P.VIEW_STUDENTS, body: `
    <p class="lead"><span class="mono">${h(s.code)}</span> · ${h(courseName(s))} · registered ${fmtDate(s.registeredOn)} · channel: ${h(s.channel)}</p>
    ${archived ? `<div class="flash warn">Archived on ${fmtDate(s.archivedOn)} · reason: ${h(s.archiveReason)}</div>` : ""}${statusBar(s.status)}
    <div class="cols">${card("Contact", contact + edit)}${card("Study and payment", study)}</div><div class="actions">${actions}</div>
    ${bookings.length ? card("Mock exams", table(["Session", "Status", "Overall band", "Section scores"], bookings)) : ""}
    ${card("History and comments <small>one record: replaces the Excel sheet</small>", `<form data-act="addComment" data-args="${attr({ id: s.id })}" class="row" style="margin-bottom:10px">
      <input id="f-text" name="text" placeholder="Add a comment…" aria-label="Comment" style="flex:1;min-width:200px"><button class="btn">Add comment</button></form>` +
      table(["When", "Who", "Action", "Detail"], historyPage.slice.map(x => x.row), "No history yet.") + historyPage.pager)}` };
};

SCREENS.placement = () => {
  const s = store.students.get(ui.params.id), preview = ui.params.preview;
  const suggestion = preview ? `<div class="suggest">Suggested level: <b>${h(preview.suggestLevel())}</b> <small>(${preview.overallPercent()}% from the written and speaking scores)</small>
    ${preview.isBorderline() ? badge("Borderline: discuss with the Coordinator", "warn") : ""}</div>` : "";
  return { title: `Placement test · ${h(s.fullName)}`, active: "students", needs: P.PLACEMENT, body: `
    <p class="lead"><span class="mono">${h(s.code)}</span> · ${h(courseName(s))} · ${statusBadge(s.status)}</p>
    <form data-act="placement" data-args="${attr({ id: s.id })}" class="card">
    <div class="cols three">${select("Test version", "version", app.placement.versionsFor(s), { required: true, blank: "Choose a version" })}
    ${field("Date and time", "when", { value: `${fmtDT(now())} (automatic)`, extra: "disabled" })}${field("Examiner", "examiner", { value: `${ui.user.fullName} (automatic)`, extra: "disabled" })}</div>
    <h3>Written test <small>score for each section, 0–40</small></h3>
    <div class="cols three">${field("Listening", "listening", { type: "number", required: true })}${field("Reading", "reading", { type: "number", required: true })}
    ${field("Grammar and writing", "grammar", { type: "number", required: true })}</div>
    <h3>Speaking check <small>UC06, score 0–9</small></h3>
    <div class="cols narrow-wide">${field("Speaking score", "speakingScore", { type: "number", required: true, extra: 'step="0.5"' })}
    ${field("Examiner comment", "speakingComment", { placeholder: "e.g. fluent, limited vocabulary on abstract topics" })}</div>${suggestion}
    <div class="cols narrow-wide">${select("Override level (optional)", "overrideLevel", LEVELS, { blank: "Keep suggested level" })}
    ${field("Comment", "overrideComment", { placeholder: "Required if the level is changed or the result is borderline" })}</div>
    <div class="row between"><span class="row">${link("Cancel", "profile", { id: s.id }, "btn ghost")}<button class="btn" name="do" value="suggest">Calculate suggested level</button></span>
    <button class="btn primary" name="do" value="confirm">Confirm level</button></div>
    <p class="muted">Confirm sets the status to “${StudentStatus.PLACED}” and opens group assignment.</p></form>
    ${card("The student cannot finish today", `<form data-act="placementOther" data-args="${attr({ id: s.id })}" class="row">
      <input type="date" id="f-newDate" name="newDate" value="${iso(addDays(today(), 1))}" aria-label="New test date"><button class="btn" name="do" value="reschedule">Reschedule</button>
      <input id="f-why" name="why" placeholder="Why is the test incomplete?" aria-label="Reason"><button class="btn" name="do" value="incomplete">Mark incomplete</button>
      ${link("Mock exam only: skip placement", "mock", { student: s.id }, "btn ghost")}</form>`)}` };
};

SCREENS.group = () => {
  const s = store.students.get(ui.params.id), { others, days = "", period = "" } = ui.params;
  const current = app.groups.currentEnrolment(s);
  const groupPage = paginate(app.groups.candidates(s, !!others, days, period), "groups", 6);
  const rows = groupPage.slice.map(({ group, enrolled }) => {
    const seats = group.seatsLeft(enrolled);
    const button = current && current.groupId === group.id ? badge("Current group", "ok")
      : actBtn(seats ? "Select" : "Full", "assign", { id: s.id, groupId: group.id }, seats ? "btn small primary" : "btn small full");
    return [`<b class="mono">${h(group.code)}</b>`, h(group.teacher), h(group.slot), h(branchName(group.branchId)),
      seats ? `${meter(seats, group.capacity)}<span class="num">${seats} of ${group.capacity}</span>` : badge("FULL", "bad"), fmtDate(group.startDate), `<span class="num">${money(group.monthlyFee)}</span>`, button];
  });
  return { title: `Assign to group · ${h(s.fullName)}`, active: "students", needs: P.ASSIGN_GROUP, body: `
    <p class="lead"><span class="mono">${h(s.code)}</span> · ${h(courseName(s))} · level: <b>${h(s.level) || "—"}</b> · ${statusBadge(s.status)}</p>
    ${current ? `<div class="flash warn">The student is in group ${h(current.groupCode)}. Selecting another group moves the student, releases the old seat and needs a reason.</div>` : ""}
    <form class="row filters" data-act="filter" data-route="group" data-args="${attr({ id: s.id })}">
    ${select("", "days", ["Mon/Wed/Fri", "Tue/Thu/Sat", "Sat"], { value: days, blank: "Any days" })}${select("", "period", ["Morning", "Afternoon", "Evening"], { value: period, blank: "Any time" })}
    <label class="check"><input type="checkbox" id="f-others" name="others" value="1"${others ? " checked" : ""}> Show other branches</label><button class="btn">Filter</button></form>
    ${card("Groups matching the student's course and level", table(["Group", "Teacher", "Days and time", "Branch", "Seats left", "Starts", "Monthly fee", ""], rows, "No suitable group. Show other branches or use the waiting list.") + groupPage.pager)}
    <div class="card"><label class="field"><span>${current ? `Reason for moving group <span class="req">*</span>` : "Comment (optional)"}</span>
      <input id="assign-comment" placeholder="${current ? "e.g. parent asked for evening classes" : ""}"></label>
    <form data-act="waitingList" data-args="${attr({ id: s.id })}" class="row"><input id="f-preference" name="preference" placeholder="Preferred days and time for the waiting list" aria-label="Waiting list preference" style="flex:1;min-width:220px">
    <button class="btn">Add to waiting list</button>${link("Cancel", "profile", { id: s.id }, "btn ghost")}</form>
    <p class="muted">Select reserves one seat and sets the status to “${StudentStatus.GROUP_ASSIGNED}”. The clash check runs automatically (UC08).</p></div>` };
};

SCREENS.payments = () => {
  const q = ui.params.q || "", s = ui.params.student ? store.students.get(ui.params.student) : null;
  let results = "", detail = "";
  if (q && !s) { const found = paginate(searchStudents(q).filter(x => !x.isArchived()), "students", 8);
    results = card("Search results", table(["ID", "Name", "Status", ""], found.slice
      .map(x => [`<span class="mono">${h(x.code)}</span>`, h(x.fullName), statusBadge(x.status), link("Select", "payments", { student: x.id }, "btn small")]), "No student found.") + found.pager); }
  if (s) {
    const payables = app.payments.payablesFor(s);
    if (!payables.length) detail = `<div class="flash bad">Payment is blocked: ${h(s.fullName)} has no group and no mock exam booking. Send the student to an Administrator first (UC09 ext. 2a).</div>`;
    else {
      const chosen = val("payable") || `${payables[0].kind}:${payables[0].id}`;
      const options = payables.map((p, i) => `<label class="payable"><input type="radio" id="f-payable-${i}" name="payable" value="${p.kind}:${p.id}"${chosen === `${p.kind}:${p.id}` ? " checked" : ""}>
        <b>${h(p.describe())}</b><span class="detail num">Fee ${money(p.fee)} · Paid ${money(p.paid)} · <b>Balance ${money(Math.max(p.balance, 0))}</b> · Due ${fmtDate(p.dueDate)}</span>${payBadge(p.paymentStatus)}</label>`).join("");
      const earlierPage = paginate(store.payments.find(p => p.studentId === s.id).sort((a, b) => b.id - a.id), "payments", 5);
      const earlier = earlierPage.slice.map(p => [fmtDT(p.paidAt), `<span class="num">${money(p.amount)}</span>`, h(p.method),
        link(`<span class="mono">${h(p.receipt.number)}</span>`, "receipt", { id: p.id }),
        p.reversed ? `${badge("Reversed", "bad")} ${h(p.reversalComment)}` : `<form data-act="reverse" data-args="${attr({ id: p.id })}" class="row tight">
          <input name="comment" id="rev-${p.id}" placeholder="Reason" aria-label="Reason for reversal"><button class="btn small">Reverse</button></form>`]);
      detail = `<form data-act="pay" data-args="${attr({ id: s.id })}" class="card">
        <h3>${h(s.fullName)} · <span class="mono">${h(s.code)}</span> ${statusBadge(s.status)}</h3><div class="payables">${options}</div>
        ${radios("Payment method", "method", Object.values(PaymentMethod), { required: true })}
        <div class="note">Click and Payme are saved only after the payment gateway confirms the transaction (UC11). Cash and desk card skip this step.
        ${checkbox("Demo: make the gateway fail", "simulateFailure")}</div>
        <div class="cols narrow-wide" style="grid-template-columns:1fr 2fr">${field("Amount received (UZS)", "amount", { placeholder: "e.g. 600,000", required: true, extra: 'inputmode="numeric"' })}
        ${field("Comment", "comment", { placeholder: "Required for an advance payment" })}</div>
        <div class="row between">${link("Cancel", "payments", {}, "btn ghost")}<button class="btn primary">Record payment</button></div>
        <p class="muted">Less than the balance is saved as a partial payment with a new due date. A receipt is issued for every payment.</p></form>
        ${card("Earlier payments", table(["When", "Amount", "Method", "Receipt", "Correction"], earlier, "No payments yet.") + earlierPage.pager)}`;
    }
  }
  return { title: "Process payment", active: "payments", needs: P.TAKE_PAYMENT, body: `
    <form class="row filters" data-act="filter" data-route="payments"><input type="search" id="f-q" name="q" value="${h(q)}" placeholder="Search by name, phone number or student ID" aria-label="Search students">
    <button class="btn">Search</button></form>${results}${detail || (q ? "" : `<p class="muted">Search for the student who is paying.</p>`)}` };
};

SCREENS.receipt = () => {
  const p = store.payments.get(ui.params.id), s = store.students.get(p.studentId), payable = store.payable(p.payableKind, p.payableId), r = p.receipt;
  const rows = [["Student", `${h(s.fullName)} · ${h(s.code)}`], ["For", h(payable.describe())], ["Branch", h(branchName(s.branchId))],
    ["Method", h(r.method) + (p.gatewayRef ? ` · confirmed, ref ${h(p.gatewayRef)}` : "")], ["Amount paid", `<b>${money(r.amount)}</b>`],
    ["Remaining balance", money(r.remainingBalance)], ["Next due date", r.nextDueDate ? fmtDate(r.nextDueDate) : "—"],
    ["Payment status", payBadge(r.remainingBalance <= 0 ? PaymentStatus.PAID : PaymentStatus.PARTIAL)], ["Cashier", h(store.staff.get(p.cashierId).fullName)]];
  return { title: "Payment recorded", active: "payments", needs: P.VIEW_STUDENTS, body: `
    ${s.status === StudentStatus.READY ? `<div class="flash">First payment: the student is now “Ready for activation”. A task was added for the Administrator.</div>` : ""}
    ${p.reversed ? `<div class="flash bad">This payment was reversed: ${h(p.reversalComment)}</div>` : ""}
    <div class="receipt"><div class="mark">IZ</div><h2 style="margin-top:8px">IELTS ZONE · RECEIPT</h2><p class="muted mono">No. ${h(r.number)} · ${fmtDT(r.issuedAt)}</p>
    <table class="num">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table><p class="fine">No refunds, except where the centre made the error.</p></div>
    <div class="row center">${actBtn("Copy receipt text", "copyReceipt", { id: p.id })}${ui.user.can(P.TAKE_PAYMENT) ? actBtn(`Send by ${s.preferredChannel()}`, "sendReceipt", { id: p.id }) : ""}
    ${link("Done", ui.user.can(P.TAKE_PAYMENT) ? "payments" : "profile", ui.user.can(P.TAKE_PAYMENT) ? {} : { id: s.id }, "btn primary")}${link("Open student", "profile", { id: s.id }, "btn ghost")}</div>` };
};

SCREENS.overdue = () => {
  const user = ui.user, grace = app.payments.graceDays;
  let preview = "";
  const { oq = "", ostate = "", ochannel = "" } = ui.params, needle = oq.trim().toLowerCase();
  const allOverdue = app.payments.overdueRows(user.branchId);
  const stateOf = r => r.inGrace ? "In grace period" : "Overdue";
  const shownOverdue = allOverdue.filter(r => (!ostate || stateOf(r) === ostate) && (!ochannel || r.channel === ochannel)
    && (!needle || (r.student.fullName + " " + r.student.code + " " + r.enrolment.groupCode).toLowerCase().includes(needle)));
  const overduePage = paginate(shownOverdue, "students", 8);
  const overdueOpts = (list, chosen, blank) => `<option value="">${blank}</option>` + list.map(v => `<option value="${h(v)}"${v === chosen ? " selected" : ""}>${h(v)}</option>`).join("");
  const overdueFiltered = oq || ostate || ochannel, owed = shownOverdue.reduce((sum, r) => sum + r.enrolment.balance, 0);
  const overdueTools = allOverdue.length ? `<div class="row filters tools">
    <input type="search" id="live-oq" data-live="oq" value="${h(oq)}" placeholder="Search by student, ID or group" aria-label="Search overdue students">
    <select id="live-ostate" data-live="ostate" aria-label="State">${overdueOpts(["Overdue", "In grace period"], ostate, "All states")}</select>
    <select id="live-ochannel" data-live="ochannel" aria-label="Channel">${overdueOpts([...new Set(allOverdue.map(r => r.channel))], ochannel, "All channels")}</select>
    <span class="muted">${overdueFiltered ? `${shownOverdue.length} of ${allOverdue.length}` : `${allOverdue.length} students`} · <b class="num">${money(owed)}</b> unpaid</span>
    ${overdueFiltered ? `<a href="#" class="btn small ghost" data-go="overdue" data-keep="1" data-params="{}">Clear</a>` : ""}</div>` : "";
  const rows = overduePage.slice.map(r => {
    const s = r.student, e = r.enrolment;
    if (!preview && s.remindersOn) preview = app.payments.reminderText(s, e);
    return [`<input type="checkbox" name="ids" value="${s.id}" id="od-${s.id}" aria-label="Select ${h(s.fullName)}"${!r.inGrace && s.remindersOn ? " checked" : ""}${s.remindersOn ? "" : " disabled"}>`,
      studentLink(s), `<span class="mono">${h(e.groupCode)}</span>`, fmtDay(e.dueDate), `<span class="num">${money(e.balance)}</span>`,
      r.inGrace ? badge(`In grace period (${r.days}d)`, "info") : badge(`Overdue ${r.days} days`, "bad"),
      badge(r.channel, r.channel.includes("OFF") ? "muted" : r.channel === "Telegram" ? "ok" : "warn"), h(r.last),
      `<span class="nowrap">${link("Log call", "followups", { student: s.id }, "btn small")}${user.can(P.TAKE_PAYMENT) ? " " + link("Take payment", "payments", { student: s.id }, "btn small") : ""}</span>`];
  });
  return { title: "Overdue payments", active: "overdue", needs: P.VIEW_OVERDUE,
    headerAction: user.can(P.SETTINGS) ? `<form data-act="setGrace" class="row tight"><label class="muted" for="f-days">Grace period, days</label>
      <input type="number" id="f-days" name="days" value="${grace}" min="0" max="14" style="width:74px"><button class="btn">Change</button></form>` : "", body: `
    <p class="lead">Grace period: <b>${grace} days</b> after the due date <span class="muted">(set by the Branch Manager)</span></p>
    <form data-act="remind">${card("Students with an unpaid balance after the due date", overdueTools + table(["", "Student", "Group", "Due", "Balance", "State", "Channel", "Last contact", ""], rows, overdueFiltered ? "No student matches the search." : "No overdue payments.") + overduePage.pager)}
    <div class="row" style="margin-bottom:16px"><button class="btn primary">Send reminder to selected</button>
    <span class="muted">Telegram first, SMS as fallback. Students with reminders OFF are not messaged: call them instead.</span></div></form>
    ${preview ? card("Reminder preview", `<p class="bubble">${h(preview)}</p>`) : ""}` };
};

SCREENS.followups = () => {
  const user = ui.user;
  const open = app.followups.openTasks(user.branchId).filter(t => [TaskType.ABSENT, TaskType.MONTHLY_CHECKIN, TaskType.PAYMENT_OVERDUE, TaskType.WAITING_LIST].includes(t.type));
  let task = ui.params.task ? store.tasks.get(ui.params.task) : null;
  let s = task ? store.students.get(task.studentId) : ui.params.student ? store.students.get(ui.params.student) : null;
  if (!s && open.length) { task = open[0]; s = store.students.get(task.studentId); }
  if (s && !task) task = open.find(t => t.studentId === s.id) || null;
  const types = [...new Set(open.map(t => t.type))], owners = [...new Set(open.map(t => t.ownerRole))];
  const option = (v, chosen) => `<option value="${h(v)}"${v === chosen ? " selected" : ""}>${h(v)}</option>`;
  const filters = `<div class="taskfilter"><input type="search" id="ff-q" data-ff="q" value="${h(followFilter.q)}" placeholder="Search student or detail" aria-label="Search open tasks">
    <div class="row tight"><select id="ff-type" data-ff="type" aria-label="Task type"><option value="">All task types</option>${types.map(v => option(v, followFilter.type)).join("")}</select>
    <select id="ff-owner" data-ff="owner" aria-label="Responsible role"><option value="">All staff roles</option>${owners.map(v => option(v, followFilter.owner)).join("")}</select></div>
    <p class="empty" id="ff-none" hidden>No task matches. ${actBtn("Clear filters", "clearFollowFilter", {}, "btn small ghost")}</p></div>`;
  const items = open.map(t => `<a href="#" class="task${task && t.id === task.id ? " on" : ""}" data-go="followups" data-params="${attr({ task: t.id })}"
    data-type="${h(t.type)}" data-owner="${h(t.ownerRole)}" data-text="${h((store.students.get(t.studentId).fullName + " " + t.detail + " " + t.type).toLowerCase())}">
    <b>${h(t.type)}${t.type === TaskType.ABSENT ? ": call now" : ""}</b><span>${h(store.students.get(t.studentId).fullName)}</span><small>${h(t.detail)} · ${h(t.ownerRole)}</small></a>`).join("") || `<p class="empty">No open follow-ups.</p>`;
  let form = card("", `<p class="empty">Choose a task on the left, or open a student and click “Log contact”.</p>`), history = "";
  if (s) {
    const channels = ["Phone call", ...(s.hasTelegram ? ["Telegram"] : []), "SMS"], who = ["Student", ...(s.parentPhone ? ["Parent"] : [])];
    form = `<form data-act="logContact" data-args="${attr({ id: s.id, task: task ? task.id : 0 })}" class="card">
      <h3>Log a contact: ${studentLink(s)} <small>${h(s.code)} · ${h(showPhone(s.phone))}</small></h3>
      ${radios("Who was contacted", "contacted", who, { value: val("contacted") || "Student", required: true })}
      ${radios("Channel", "channel", channels, { value: val("channel") || "Phone call", required: true })}
      ${radios("Result", "result", [ContactResult.ANSWERED, ContactResult.NO_ANSWER, ContactResult.CALL_BACK], { value: val("result") || ContactResult.ANSWERED, required: true })}
      ${textarea("Comment", "comment", { placeholder: "Reason for absence, what was agreed…" })}
      <div class="row between">${field("Next action date", "nextAction", { type: "date" })}<button class="btn primary">Save contact</button></div>
      <p class="muted">“No answer” keeps the task open. These are the fields staff fill in Excel today (Interview Q9).</p></form>`;
    const historyPage = paginate(app.followups.history(s), "contacts", 5, "hpage");
    history = card("Contact history for this student", table(["When", "Who", "Channel", "Result", "Comment"], historyPage.slice.map(c => [fmtDT(c.at),
      h(c.automatic ? "System" : c.staffName), `${h(c.channel)} (${h(c.contacted.toLowerCase())})`,
      badge(c.result, [ContactResult.ANSWERED, ContactResult.SENT].includes(c.result) ? "ok" : "warn"), h(c.comment)]), "No contacts logged yet.") + historyPage.pager);
  }
  return { title: "Follow-ups", active: "followups", needs: P.FOLLOW_UP, body: `<div class="split"><div class="card"><h3>Open tasks <small id="ff-count">${open.length}</small></h3>${open.length ? filters : ""}${items}<div id="ff-pager"></div></div><div>${form}${history}</div></div>` };
};

SCREENS.mock = () => {
  const user = ui.user, q = ui.params.q || "", s = ui.params.student ? store.students.get(ui.params.student) : null;
  const found = q && !s ? paginate(searchStudents(q).filter(x => !x.isArchived()), "students", 8, "rpage") : null;
  const results = found ? card("Search results", table(["ID", "Name", ""], found.slice
    .map(x => [`<span class="mono">${h(x.code)}</span>`, h(x.fullName), link("Select", "mock", { student: x.id }, "btn small")]), "No student found.") + found.pager) : "";
  const sessionPage = paginate(app.groups.upcomingSessions(user.branchId), "sessions", 5);
  const rows = sessionPage.slice.map(({ session, booked }) => {
    const left = session.capacity - booked;
    return [`${WEEKDAYS[session.examDate.getDay()]} ${fmtDay(session.examDate)}`, `${session.startTime}–${session.endTime}`, h(session.room),
      left <= 0 ? badge("FULL", "bad") : `${meter(left, session.capacity)}<span class="num">${left} of ${session.capacity}</span>`, `<span class="num">${money(session.fee)}</span>`,
      ...(s ? [actBtn(left <= 0 ? "Full" : "Book", "bookMock", { student: s.id, session: session.id }, left <= 0 ? "btn small full" : "btn small primary")] : [])];
  });
  const minePage = s ? paginate(store.bookings.find(b => b.studentId === s.id && !b.cancelled).sort((a, b) => b.id - a.id), "bookings", 5, "bpage") : null;
  const mine = s ? card(`Bookings and results of ${h(s.fullName)}`, table(["Session", "Status", "Overall band", "Section scores"],
    minePage.slice
      .map(b => [h(b.sessionLabel), b.confirmed ? badge("Confirmed", "ok") : badge("Booked, unpaid", "warn"), h(b.band) || "—", h(b.scores) || "—"]), "No bookings yet.") + minePage.pager) : "";
  return { title: "Mock test booking", active: "mock", needs: P.MOCK_BOOKING, body: `
    <form class="row filters" data-act="filter" data-route="mock"><input type="search" id="f-q" name="q" value="${h(q)}" placeholder="Find the student by name, phone number or ID" aria-label="Search students"><button class="btn">Search</button></form>${results}
    <p class="lead">${s ? `Booking for ${studentLink(s)} · <span class="mono">${h(s.code)}</span> ${statusBadge(s.status)}` : "Search for the student above to enable booking. Sessions and free seats are shown below."}</p>
    ${card("Upcoming mock exam sessions", table(["Date", "Time", "Room", "Seats left", "Fee", ...(s ? [""] : [])], rows, "No sessions planned.") + sessionPage.pager)}
    <div class="flash info">A booking is confirmed by payment at the cashier's desk. A mock-exam-only student needs no placement test and no group (FR-04).</div>${mine}` };
};

SCREENS.report = () => {
  const user = ui.user, day = today(), all = user.can(P.ALL_BRANCHES);
  const month = ui.params.month || `${day.getFullYear()}-${p2(day.getMonth() + 1)}`, [y, m] = month.split("-").map(Number);
  const branch = all ? (ui.params.branch || "") : String(user.branchId);
  const d = app.reports.monthly(y, m - 1, branch ? Number(branch) : null);
  const monthName = `${MONTHS_LONG[m - 1]} ${y}`, pct = (n, of) => of ? Math.round(n / of * 100) : 0;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // 1. movement: the four numbers as one picture (start + new − archived = end)
  const net = d.activeEnd - d.activeStart, peak = Math.max(d.activeStart + d.fresh, d.activeEnd, 1), H = 150, px = n => Math.max(Math.round(n / peak * H), n ? 4 : 0);
  const column = (cls, label, value, height, offset, tip) => `<div class="bcol ${cls}" title="${h(tip)}"><b class="num">${value}</b><i style="height:${height}px"></i><span style="height:${offset}px"></span></div>`;
  const bridge = `<div class="bridge" role="img" aria-label="${d.activeStart} active at start, plus ${d.fresh} new, minus ${d.archived} archived, equals ${d.activeEnd} active at end">
      ${column("base", "Start", d.activeStart, px(d.activeStart), 0, `Active on 1 ${MONTHS[m - 1]}: ${d.activeStart}`)}
      ${column("gain", "New", `${ICON.up}+${d.fresh}`, px(d.fresh), px(d.activeStart), `Activated during the month: ${d.fresh}`)}
      ${column("loss", "Archived", `${ICON.down}−${d.archived}`, px(d.archived), px(d.activeStart + d.fresh - d.archived), `Archived during the month: ${d.archived}`)}
      ${column("base end", "End", d.activeEnd, px(d.activeEnd), 0, `Active at the end of the month: ${d.activeEnd}`)}</div>
    <div class="bridge-x"><span>Active at start</span><span>New students</span><span>Archived</span><span>Active at end</span></div>`;
  const hero = `<section class="card hero"><div><p class="eyebrow">Student movement · ${h(monthName)}</p>
      <div class="hero-num num">${d.activeEnd}</div><p class="muted" style="margin:2px 0 10px">active students at the end of the month</p>
      <span class="delta ${net >= 0 ? "up" : "down"}">${net >= 0 ? ICON.up : ICON.down}${net >= 0 ? "+" : "−"}${Math.abs(net)} net · ${pct(Math.abs(net), d.activeStart)}% ${net >= 0 ? "growth" : "decline"}</span>
      <p class="eqrow"><span class="eq"><b class="num">${d.activeStart}</b> at start</span><span class="op">+</span><span class="eq"><b class="num">${d.fresh}</b> new</span>
      <span class="op">−</span><span class="eq"><b class="num">${d.archived}</b> archived</span><span class="op">=</span><span class="eq"><b class="num">${d.activeEnd}</b> at end</span></p></div>
    <div>${bridge}</div></section>`;

  // 2. new students by week: one series, one colour, value on each bar
  const top = Math.max(...d.weeks, 1), lastDay = new Date(y, m, 0).getDate(), best = d.weeks.indexOf(Math.max(...d.weeks));
  const weeks = `<div class="wk" style="grid-template-columns:repeat(${d.weeks.length},1fr)">${d.weeks.map((n, i) => { const range = `${1 + 7 * i}–${Math.min(7 + 7 * i, lastDay)} ${MONTHS[m - 1]}`;
    return `<div class="wcol" title="${range}: ${plural(n, "new student")}"><b class="num">${n}</b><i style="height:${Math.max(Math.round(n / top * 120), n ? 4 : 2)}px"></i><span>Week ${i + 1}<small>${range}</small></span></div>`; }).join("")}</div>
    <p class="insight">${d.fresh ? `Busiest week: <b>week ${best + 1}</b> with ${plural(d.weeks[best], "new student")}.` : "No student was activated this month."}</p>`;

  // 3 and 4. ranked horizontal bars (magnitude, so a single hue)
  const hbars = (list, total, noun) => list.map(([label, n]) => `<div class="hbar" title="${h(label)}: ${n} of ${total} ${noun} (${pct(n, total)}%)"><span>${h(label)}</span>
    <span class="track"><i style="width:${Math.max(pct(n, Math.max(...list.map(x => x[1]))), 3)}%"></i></span><b class="num">${n}</b><small class="num">${pct(n, total)}%</small></div>`).join("");
  const registered = d.channels.reduce((sum, c) => sum + c[1], 0), exposed = d.activeStart + d.fresh;
  const reasons = d.reasons.length ? hbars(d.reasons, d.archived, "archived students") +
    `<p class="insight">${plural(d.archived, "student")} of the ${exposed} who were active this month left: <b>${pct(d.archived, exposed)}%</b>. The reason is a required field when archiving.</p>` : `<p class="empty">No student was archived this month.</p>`;
  const channels = d.channels.length ? hbars(d.channels, registered, "registrations") +
    `<p class="insight"><b>${h(d.channels[0][0])}</b> brings ${pct(d.channels[0][1], registered)}% of the ${plural(registered, "registration")} this month.</p>` : `<p class="empty">No registrations this month.</p>`;

  // 5. enrolment pipeline, in the order a student moves through it
  const stageCount = Object.fromEntries(d.pipeline), stages = ["Registered", "Placed", "Group assigned", "Ready for activation"], waiting = stages.reduce((sum, k) => sum + (stageCount[k] || 0), 0);
  const WAITS_FOR = { "Registered": "placement test", "Placed": "a group", "Group assigned": "first payment", "Ready for activation": "activation" };
  const funnel = `<div class="steps funnel">${stages.map(k => `<div class="step${stageCount[k] ? " has" : ""}" title="${h(k)}: ${stageCount[k] || 0}"><b class="num">${stageCount[k] || 0}</b><small>${h(k)}</small><em>waits for ${WAITS_FOR[k]}</em></div>`).join("")}
    <div class="step goal"><b>${ICON.students}</b><small>Active</small></div></div>
    <p class="insight">${waiting ? `<b>${plural(waiting, "student")}</b> ${waiting === 1 ? "is" : "are"} between registration and activation right now.` : "Nobody is waiting in enrolment."}</p>`;

  // archived list: search and filters that work while typing
  const { aq = "", areason = "", acourse = "" } = ui.params, needle = aq.trim().toLowerCase();
  const archivedAll = [...d.archivedStudents].sort((a, b) => b.archivedOn - a.archivedOn);
  const archivedShown = archivedAll.filter(s => (!needle || s.fullName.toLowerCase().includes(needle) || s.code.toLowerCase().includes(needle))
    && (!areason || s.archiveReason === areason) && (!acourse || courseName(s) === acourse));
  const archivedPage = paginate(archivedShown, "students", 5);
  const opts = (list, chosen, blank) => `<option value="">${blank}</option>` + list.map(v => `<option value="${h(v)}"${v === chosen ? " selected" : ""}>${h(v)}</option>`).join("");
  const filtered = aq || areason || acourse;
  const archivedTools = archivedAll.length ? `<div class="row filters tools">
    <input type="search" id="live-aq" data-live="aq" value="${h(aq)}" placeholder="Search by name or student ID" aria-label="Search archived students">
    <select id="live-areason" data-live="areason" aria-label="Reason">${opts([...new Set(archivedAll.map(s => s.archiveReason))], areason, "All reasons")}</select>
    <select id="live-acourse" data-live="acourse" aria-label="Course">${opts([...new Set(archivedAll.map(courseName))], acourse, "All courses")}</select>
    <span class="muted">${filtered ? `${archivedShown.length} of ${archivedAll.length}` : `${archivedAll.length} students`}</span>
    ${filtered ? `<a href="#" class="btn small ghost" data-go="report" data-keep="1" data-params="${attr({ month: ui.params.month, branch: ui.params.branch })}">Clear</a>` : ""}</div>` : "";
  const reasonKind = { "Finished the course": "ok", "Financial reasons": "warn", "Schedule did not fit": "info", "Moved to another centre": "bad" };
  const archivedRows = archivedPage.slice.map(s => [studentLink(s) + `<br><span class="mono muted">${h(s.code)}</span>`, h(courseName(s)) + (s.level ? ` · ${h(s.level)}` : ""),
    badge(s.archiveReason, reasonKind[s.archiveReason] || ""), `<span class="num">${plural(Math.max(Math.round(daysBetween(s.archivedOn, s.activatedOn) / 7), 1), "week")}</span>`, fmtDate(s.archivedOn)]);
  const months = [0, 1, 2, 3].map(i => { const x = new Date(day.getFullYear(), day.getMonth() - i, 1); return [`${x.getFullYear()}-${p2(x.getMonth() + 1)}`, `${MONTHS_LONG[x.getMonth()]} ${x.getFullYear()}`]; });
  return { title: "Monthly enrolment report", active: "report", needs: P.VIEW_REPORT, body: `
    <form class="row filters" data-act="filter" data-route="report">${select("", "month", months, { value: month })}
    ${all ? select("", "branch", store.branches.find().map(b => [b.id, b.name]), { value: branch, blank: "All six branches" }) : `<span class="chip">${h(branchLabel(user.branchId))}</span>`}
    <button class="btn">Show</button>${actBtn("Copy report as text", "copyReport", { month, branch }, "btn ghost")}</form>
    ${hero}
    <div class="cols">${card("New students by week", weeks)}${card("Why students left", reasons)}</div>
    <div class="cols pipeline-row">${card("How new students found us", channels)}${card("Enrolment pipeline today", funnel)}</div>
    ${card("Archived students this month", archivedTools + table(["Student", "Course", "Reason", "Studied for", "Archived on"], archivedRows, filtered ? "No archived student matches the search." : "No student was archived this month.") + archivedPage.pager)}
    <p class="muted">The movement card shows the four numbers the coordinator calculates by hand each month (Interview Q11). Hover a bar for its exact value. Sample data.</p>` };
};

SCREENS.activity = () => {
  const user = ui.user, { staff = "", action = "", date = "", lq = "" } = ui.params, logNeedle = lq.trim().toLowerCase();
  const entries = store.activity.find(a => (user.can(P.ALL_BRANCHES) || a.branchId === user.branchId) && (!staff || a.staffId === Number(staff))
    && (!action || a.action === action) && (!date || iso(a.at) === date)
    && (!logNeedle || `${a.studentName} ${a.staffName} ${a.action} ${a.oldValue} ${a.newValue} ${a.comment}`.toLowerCase().includes(logNeedle))).sort((a, b) => b.at - a.at || b.id - a.id);
  const { slice, pager } = paginate(entries, "entries");
  const rows = slice.map(a => [fmtDT(a.at), h(a.staffName), `<b>${h(a.action)}</b>`, a.studentId ? link(h(a.studentName), "profile", { id: a.studentId }) : "—",
    (a.oldValue && a.newValue ? `${h(a.oldValue)} → ${h(a.newValue)}` : h(a.newValue)) + (a.comment ? `<br><span class="muted">${h(a.comment)}</span>` : "")]);
  const actions = [...new Set(store.activity.find().map(a => a.action))].sort();
  return { title: "Activity log", active: "activity", needs: P.VIEW_LOG, body: `
    <form class="row filters" data-act="filter" data-route="activity"><input type="search" id="live-lq" data-live="lq" name="lq" value="${h(lq)}" placeholder="Search student, receipt number or comment" aria-label="Search the activity log">
    ${select("", "staff", store.staff.find().map(s => [s.id, s.fullName]), { value: staff, blank: "All staff" })}
    ${select("", "action", actions, { value: action, blank: "All actions" })}<input type="date" id="f-date" name="date" value="${h(date)}" aria-label="Date">
    <button class="btn">Filter</button>${link("Clear", "activity", {}, "btn ghost")}</form>
    <div class="flash info">Read-only. Entries cannot be edited or deleted by any staff role. Corrections and reversals appear as new entries.</div>
    ${card(`${entries.length} entries`, table(["Time", "Staff", "Action", "Student", "Old value → new value · comment"], rows, "No entries for this filter.") + pager)}` };
};

SCREENS.archive = () => {
  const s = store.students.get(ui.params.id), enrolment = app.groups.currentEnrolment(s);
  return { title: `Archive · ${h(s.fullName)}`, active: "students", needs: P.ARCHIVE, body: `
    <p class="lead"><span class="mono">${h(s.code)}</span> · ${statusBadge(s.status)}</p>
    <form data-act="archive" data-args="${attr({ id: s.id })}" class="card">
    ${select("Reason for archiving", "reason", ARCHIVE_REASONS, { required: true, blank: "Choose a reason" })}
    ${textarea("Comment", "comment", { placeholder: "What the student or parent said", required: true })}
    <div class="flash info">Archiving ${enrolment ? `releases the seat in group ${h(enrolment.groupCode)} and ` : ""}closes the student's open tasks. The history is kept and stays searchable.</div>
    <h3>Refund <small>only when the centre made the error (Interview Q7)</small></h3>
    <div class="cols narrow-wide" style="grid-template-columns:1fr 2fr">${field("Refund amount (UZS)", "refundAmount", { placeholder: "leave empty for no refund", hint: `Paid so far: ${money(app.enrolment.totalPaid(s))}`, extra: 'inputmode="numeric"' })}
    ${field("What was the centre's error?", "centreError", { placeholder: "e.g. charged twice, group cancelled by the centre" })}</div>
    <p class="muted">A refund request goes to the Branch Manager for approval. The Administrator cannot approve it.</p>
    <div class="row between">${link("Cancel", "profile", { id: s.id }, "btn ghost")}<button class="btn danger">Archive student</button></div></form>` };
};

/* ---- follow-up task filter: works while typing, without redrawing the screen */
const followFilter = { q: "", type: "", owner: "", page: 1 };
const TASK_PAGE_SIZE = 5;
function applyFollowFilter() {
  const tasks = [...document.querySelectorAll(".task[data-type]")], q = followFilter.q.trim().toLowerCase();
  const matching = tasks.filter(el => (!q || el.dataset.text.includes(q)) && (!followFilter.type || el.dataset.type === followFilter.type) && (!followFilter.owner || el.dataset.owner === followFilter.owner));
  const pages = Math.max(1, Math.ceil(matching.length / TASK_PAGE_SIZE));
  if (followFilter.jumpToSelected) { const at = matching.findIndex(el => el.classList.contains("on")); if (at >= 0) followFilter.page = Math.floor(at / TASK_PAGE_SIZE) + 1; followFilter.jumpToSelected = false; }
  const page = followFilter.page = Math.min(Math.max(1, followFilter.page), pages), first = (page - 1) * TASK_PAGE_SIZE;
  tasks.forEach(el => { el.hidden = true; });
  matching.slice(first, first + TASK_PAGE_SIZE).forEach(el => { el.hidden = false; });
  const count = document.getElementById("ff-count"), none = document.getElementById("ff-none"), pager = document.getElementById("ff-pager");
  if (count) count.textContent = matching.length === tasks.length ? `${tasks.length}` : `${matching.length} of ${tasks.length}`;
  if (none) none.hidden = matching.length > 0;
  if (pager) pager.innerHTML = pages === 1 ? "" : pagerHtml(page, pages, first, Math.min(TASK_PAGE_SIZE, matching.length - first), matching.length, "tasks",
    (n, label, on) => n < 1 || n > pages ? `<span class="btn small disabled">${label}</span>` : `<button type="button" class="btn small${on ? " primary" : ""}" data-ffpage="${n}"${on ? ' aria-current="page"' : ""}>${label}</button>`);
}
document.addEventListener("input", ev => { const key = ev.target.dataset && ev.target.dataset.ff; if (key) { followFilter[key] = ev.target.value; followFilter.page = 1; applyFollowFilter(); } });
document.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.dataset && (ev.target.dataset.live || ev.target.dataset.ff)) ev.preventDefault(); });
/* live search and filters on a list: update the parameter, redraw, put the cursor back */
document.addEventListener("input", ev => {
  const el = ev.target, key = el.dataset && el.dataset.live;
  if (!key) return;
  const id = el.id, caret = el.type === "search" ? el.selectionStart : null, y = window.scrollY;
  ui.params = { ...ui.params, [key]: el.value, page: 1 };
  render(); window.scrollTo(0, y);
  const again = document.getElementById(id);
  if (again) { again.focus(); if (caret !== null) again.setSelectionRange(caret, caret); }
});
document.addEventListener("click", ev => { const el = ev.target.closest("[data-ffpage]"); if (el) { followFilter.page = Number(el.dataset.ffpage); applyFollowFilter(); } });

/* ---- actions: what each form and button does */
const parseMoney = text => { const digits = String(text || "").replace(/\D/g, ""); return digits ? Number(digits) : 0; };
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); flash(`${what} copied.`); }
  catch (e) { ui.modal = modal(`${what}: select and copy`, `<textarea class="wide" id="copy-box" rows="9" readonly>${h(text)}</textarea><div class="row" style="margin-top:12px">${actBtn("Close", "closeModal", {}, "btn primary")}</div>`); }
  render();
}
const ACTIONS = {
  login(form, args) {
    const branchId = Number(form.branchId || document.getElementById("f-branchId")?.value || 0);
    form = { ...args, ...form };
    const staff = app.auth.login(form.username, form.password);
    if (!staff) { ui.errors = { password: "Wrong username or password" }; ui.form = { username: form.username, branchId }; return render(); }
    if (!store.branches.get(branchId)) { ui.errors = { branchId: "Choose your branch" }; ui.form = { username: form.username }; return render(); }
    staff.branchId = branchId;                      // the branch chosen at sign-in is the working branch (Interview Q1–Q3)
    ui.user = staff; app.payments.syncOverdueTasks(); go("tasks");
  },
  logout() { ui.user = null; go("login"); },
  closeModal() { ui.modal = ""; render(); },
  clearFollowFilter() { Object.assign(followFilter, { q: "", type: "", owner: "", page: 1 }); render(); },
  filter(form, args, formEl) { go(formEl.dataset.route, { ...args, ...form }); },
  saveNotes(form) { app.followups.meetingNotes(ui.user, form.notes || ""); flash("Notes saved for today's meeting."); render(); },
  copySummary() {
    const c = app.followups.counters(ui.user.branchId);
    const lines = app.followups.openTasks(ui.user.branchId).map(t => `- ${t.type}: ${store.students.get(t.studentId).fullName} (${t.detail})`);
    copyText([`Daily summary, ${fmtDate(today())}, ${branchLabel(ui.user.branchId)}, ${ui.user.fullName}`, `New students to test: ${c.fresh}. Absent: ${c.absent}. Payment tasks: ${c.payments}. Open follow-ups: ${c.followups}.`,
      "Open tasks:", ...lines, "Notes for the meeting:", app.followups.meetingNotes(ui.user) || "(none)"].join("\n"), "Daily summary");
  },
  register(form) {
    try {
      const s = app.enrolment.register(form, ui.user, form.duplicateComment ?? null);
      flash(`Student saved with ID ${s.code}. Next step: placement test.`); go("profile", { id: s.id });
    } catch (e) {
      if (!(e instanceof DuplicateFound) && !(e instanceof ValidationError && e.errors.duplicateComment)) throw e;
      const matches = e.matches || app.enrolment.findDuplicates(normalisePhone(form.phone), form.parentNa ? "" : normalisePhone(form.parentPhone), form.noTelegram ? "" : (form.telegram || "").trim());
      ui.form = { ...form }; delete ui.form.duplicateComment; ui.errors = e.errors || {};
      const hidden = Object.entries(ui.form).map(([k, v]) => `<input type="hidden" name="${h(k)}" value="${h(v)}">`).join("");
      ui.modal = modal("Possible match found", `<p>An existing record uses the same contact details. Check it before creating a new student.</p>
        ${table(["ID", "Name", "Course", "Status", "Match"], matches.map(m => [`<span class="mono">${h(m.student.code)}</span>`, h(m.student.fullName), h(courseName(m.student)), statusBadge(m.student.status), h(m.why)]))}
        <form data-act="register">${hidden}${textarea("Comment (required to continue as a new student)", "duplicateComment", { placeholder: "e.g. sibling, same parent phone", required: true, value: "" })}
        <div class="row between">${actBtn("Back to form", "closeModal", {}, "btn ghost")}<span class="row">${link("Open existing record", "profile", { id: matches[0].student.id }, "btn")}
        <button class="btn primary">Sibling: continue</button></span></div></form><p class="muted">Nothing is saved until one option is chosen.</p>`);
      render();
    }
  },
  addComment(form, args) { app.enrolment.addComment(store.students.get(args.id), ui.user, form.text); render(); },
  editContact(form, args) { ui.params.edit = true; app.enrolment.editContact(store.students.get(args.id), ui.user, form.phone, form.telegram, !!form.remindersOn, form.comment);
    flash("Contact details corrected. The old and new values are in the history."); go("profile", { id: args.id }); },
  activate(form, args) { const channel = app.enrolment.activate(store.students.get(args.id), ui.user); flash(`Student activated. Confirmation sent by ${channel}.`); render(); },
  markAbsent(form, args) { app.followups.markAbsent(store.students.get(args.id), ui.user, "today's lesson"); flash("Absence recorded. A 'call now' task was added to the daily list."); render(); },
  placement(form, args, formEl, choice) {
    const s = store.students.get(args.id), preview = app.placement.build(s, ui.user, form), errors = preview.sectionErrors(), ok = !Object.keys(errors).length;
    ui.form = form; ui.params.preview = ok ? preview : null;
    if (choice === "suggest") { ui.errors = errors; return render(); }
    const test = app.placement.record(s, ui.user, form);
    flash(`Level confirmed: ${test.finalLevel}. Now choose a group.`); go("group", { id: s.id });
  },
  placementOther(form, args, formEl, choice) {
    const s = store.students.get(args.id);
    if (choice === "reschedule") { app.placement.reschedule(s, ui.user, parseISO(form.newDate)); flash("Test rescheduled. The status is unchanged and a task was added for the new date."); }
    else { app.placement.markIncomplete(s, ui.user, form.why); flash("Test marked incomplete. No level was assigned; the student can retake it."); }
    go("profile", { id: s.id });
  },
  assign(form, args) {
    const s = store.students.get(args.id), group = store.groups.get(args.groupId), comment = document.getElementById("assign-comment")?.value || "";
    try { app.groups.assign(s, group, ui.user, comment); }
    catch (e) {
      if (!(e instanceof GroupFull || e instanceof ScheduleClash)) throw e;
      ui.modal = modal("This group cannot be assigned", `<p class="problem">${h(e.message)}</p><p class="muted">No seat was reserved and the status has not changed.</p>
        <div class="row between">${actBtn("Choose another group", "closeModal", {}, "btn primary")}${link("Cancel", "profile", { id: s.id }, "btn ghost")}</div>`);
      return render();
    }
    flash(`Seat reserved in ${group.code}. The student can now pay at the cashier's desk.`); go("profile", { id: s.id });
  },
  waitingList(form, args) { app.groups.addToWaitingList(store.students.get(args.id), ui.user, form.preference); flash("Added to the waiting list. A follow-up task was created."); go("profile", { id: args.id }); },
  pay(form, args) {
    const s = store.students.get(args.id), [kind, id] = (form.payable || ":").split(":");
    ui.form = form;
    const payment = app.payments.recordPayment(s, store.payable(kind, id), parseMoney(form.amount), form.method, ui.user, form.comment || "", !!form.simulateFailure);
    go("receipt", { id: payment.id });
  },
  reverse(form, args) { const p = store.payments.get(args.id); app.payments.reverse(p, ui.user, form.comment);
    flash("Payment reversed. The original entry stays in the log and the balance was recalculated."); render(); },
  sendReceipt(form, args) { const p = store.payments.get(args.id); const channel = app.enrolment.notify(store.students.get(p.studentId), ui.user,
    `Receipt ${p.receipt.number}: ${money(p.amount)} received. Thank you!`); flash(`Receipt sent by ${channel}. It is in the student's history.`); render(); },
  copyReceipt(form, args) {
    const p = store.payments.get(args.id), s = store.students.get(p.studentId), r = p.receipt;
    copyText([`IELTS ZONE receipt ${r.number}`, fmtDT(r.issuedAt), `Student: ${s.fullName} (${s.code})`, `For: ${store.payable(p.payableKind, p.payableId).describe()}`,
      `Method: ${r.method}`, `Amount paid: ${money(r.amount)}`, `Remaining balance: ${money(r.remainingBalance)}`, r.nextDueDate ? `Next due date: ${fmtDate(r.nextDueDate)}` : ""].filter(Boolean).join("\n"), "Receipt");
  },
  remind(form) {
    const ids = [].concat(form.ids || []).map(Number);
    if (!ids.length) throw new RuleError("Select at least one student.");
    const o = app.payments.sendReminders(ids, ui.user);
    flash(`${o.sent} reminder(s) sent${o.skipped ? `, ${o.skipped} skipped (reminders off)` : ""}. Each one is in the student's history.`); render();
  },
  setGrace(form) { requirePermission(ui.user, P.SETTINGS); const old = app.payments.graceDays;
    store.settings.graceDays = Math.max(0, Math.min(14, Number(form.days) || 0)); app.audit.record(ui.user, "Grace period changed", null, `${old} days`, `${store.settings.graceDays} days`);
    flash("Grace period updated."); render(); },
  logContact(form, args) {
    const s = store.students.get(args.id); ui.form = form;
    app.followups.logContact(s, ui.user, form.contacted, form.channel, form.result, form.comment, parseISO(form.nextAction), args.task);
    flash("Contact saved in the student's history." + (form.result === ContactResult.ANSWERED ? "" : " The task stays open.")); go("followups", { student: s.id });
  },
  bookMock(form, args) {
    const s = store.students.get(args.student), session = store.sessions.get(args.session);
    try { app.groups.bookMock(s, session, ui.user); }
    catch (e) {
      if (e instanceof NotAllowed || !(e instanceof RuleError)) throw e;
      ui.modal = modal("This session cannot be booked", `<p class="problem">${h(e.message)}</p><div class="row">${actBtn("Choose another session", "closeModal", {}, "btn primary")}</div>`);
      return render();
    }
    flash(`Booked: ${session.label()}. It is confirmed by payment at the cashier's desk.`); render();
  },
  copyReport(form, args) {
    const [y, m] = args.month.split("-").map(Number), d = app.reports.monthly(y, m - 1, args.branch ? Number(args.branch) : null);
    copyText([`Monthly enrolment report, ${MONTHS_LONG[m - 1]} ${y}, ${args.branch ? branchLabel(Number(args.branch)) : "all branches"}`,
      `Active at start: ${d.activeStart}`, `New students: ${d.fresh}`, `Archived: ${d.archived}`, `Active at end: ${d.activeEnd}`,
      "Archived by reason: " + (d.reasons.map(([r, n]) => `${r} ${n}`).join("; ") || "none")].join("\n"), "Report");
  },
  archive(form, args) {
    const s = store.students.get(args.id); ui.form = form;
    const refund = app.enrolment.archive(s, ui.user, form.reason, form.comment, parseMoney(form.refundAmount), form.centreError);
    flash("Student archived." + (refund ? " The refund request is waiting for the Branch Manager." : "")); go("profile", { id: s.id });
  },
  decideRefund(form, args) { const refund = store.refunds.get(args.id); app.enrolment.decideRefund(refund, ui.user, args.approve);
    flash(`Refund ${refund.status.toLowerCase()}. The decision is in the activity log.`); render(); },
};

/** Runs an action and turns rule errors into messages on the screen. */
function run(name, form, args, formEl, choice) {
  try { ACTIONS[name](form, args, formEl, choice); }
  catch (e) {
    if (e instanceof ValidationError) { ui.errors = e.errors; ui.form = { ...ui.form, ...form }; }
    else if (e instanceof RuleError) flash(e.message, "bad");
    else { console.error(e); flash("Something went wrong: " + e.message, "bad"); }
    render();
  }
}

/* ---- drawing and events */
function loginScreen() {
  const demo = [["admin", "Administrator"], ["cashier", "Cashier"], ["coordinator", "Coordinator"], ["manager", "Branch Manager"]]
    .map(([u, role]) => `<button type="button" class="demo" data-act="login" data-args="${attr({ username: u, password: "demo" })}">${role}<small>${u} / demo</small></button>`).join("");
  return `<div class="login"><div class="login-card"><div class="mark big" style="margin:0 auto">IZ</div><h1>IELTS ZONE</h1><p class="sub">Student Enrolment System</p>
    <form data-act="login">${select("Branch", "branchId", store.branches.find().map(b => [b.id, `${b.name} (${b.city})`]), { value: val("branchId") || store.branches.find()[0].id, required: true })}
    ${field("Username", "username", { required: true, extra: 'autocomplete="username"' })}${field("Password", "password", { type: "password", required: true, extra: 'autocomplete="current-password"' })}
    <button class="btn primary wide">Sign in</button></form><p class="sub" style="margin-top:16px">Demo accounts (one click)</p><div class="demos">${demo}</div>
    <p class="fine">The chosen branch decides which students, groups and reports you see. The sample data is in the Amir Temur branch.</p>
    <p class="fine">Student coursework prototype, not an official IELTS ZONE system. Nothing is sent anywhere.</p></div></div>`;
}
function render() {
  const root = document.getElementById("app");
  if (!ui.user) { root.innerHTML = loginScreen(); return; }
  const user = ui.user;
  let screen;
  try { screen = SCREENS[ui.route](); if (screen.needs && !user.can(screen.needs)) throw new NotAllowed(`The ${user.role} role may not ${screen.needs}.`); }
  catch (e) {
    screen = e instanceof NotAllowed ? { title: "Access denied", body: card("", `<p>${h(e.message)}</p><p class="muted">Your role does not include this screen (NFR-01).</p>`) }
      : { title: "This record cannot be shown", body: card("", `<p>${h(e.message)}</p>${link("Back to the start page", "tasks", {}, "btn")}`) };
  }
  const flashes = ui.flashes.map(f => `<div class="flash ${f.kind}" role="status">${h(f.text)}</div>`).join("");
  ui.flashes = [];
  document.title = `${screen.title.replace(/<[^>]+>/g, "")} · IELTS ZONE Enrolment`;
  const day = today(), open = app.followups.openTasks(user.branchId).length;
  const initials = user.fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const menu = MENU.map(([group, items]) => { const mine = items.filter(([, , p]) => user.can(p));
    return mine.length ? `<div class="nav-group">${group}</div>` + mine.map(([route, label]) =>
      `<a href="#" class="nav${screen.active === route ? " on" : ""}" data-go="${route}" data-params="{}"${screen.active === route ? ' aria-current="page"' : ""}>${ICON[route]}<span>${h(label)}</span>${
        route === "tasks" && open ? `<span class="count">${open}</span>` : ""}</a>`).join("") : ""; }).join("");
  root.innerHTML = `<div class="shell"><nav class="side" aria-label="Main menu">
    <div class="brand"><span class="mark">IZ</span><span>IELTS ZONE<small>Student Enrolment System</small></span></div>${menu}
    <div class="side-foot"><div class="user"><span class="avatar">${h(initials)}</span><span><b>${h(user.fullName)}</b><small>${h(user.role)}</small></span>${actBtn("Log out", "logout", {}, "btn")}</div>
    <div class="side-note">Student coursework prototype, not an official IELTS ZONE system. Sample data only; reloading the page resets it.</div></div></nav>
    <div class="work"><header class="top"><span class="crumb"><b>${h(branchLabel(user.branchId))}</b> · ${WEEKDAYS_LONG[day.getDay()]} ${day.getDate()} ${MONTHS_LONG[day.getMonth()]} ${day.getFullYear()}</span>
    <span class="crumb"><span class="role">${h(user.role)}</span>${h(user.fullName)}</span></header>
    <main><div class="pagehead"><h1>${screen.title}</h1>${screen.headerAction || ""}</div>${flashes}${screen.body}</main></div></div>${ui.modal}`;
  if (ui.route === "followups") applyFollowFilter();
}
function formValues(formEl) {
  const out = {};
  for (const [k, v] of new FormData(formEl).entries()) { if (k in out) out[k] = [].concat(out[k], v); else out[k] = v; }
  return out;
}
document.addEventListener("submit", ev => {
  const formEl = ev.target.closest("form[data-act]");
  ev.preventDefault();
  if (!formEl) return;
  run(formEl.dataset.act, formValues(formEl), JSON.parse(formEl.dataset.args || "{}"), formEl, ev.submitter ? ev.submitter.value : "");
});
document.addEventListener("click", ev => {
  const goEl = ev.target.closest("[data-go]");
  if (goEl) {
    ev.preventDefault();
    const y = window.scrollY;
    go(goEl.dataset.go, JSON.parse(goEl.dataset.params || "{}"));
    if (goEl.dataset.keep) window.scrollTo(0, y);          // paging keeps the reader's place
    return;
  }
  const actEl = ev.target.closest("button[data-act]");
  if (actEl && !actEl.disabled) { ev.preventDefault(); run(actEl.dataset.act, {}, JSON.parse(actEl.dataset.args || "{}"), null, ""); }
});
render();
