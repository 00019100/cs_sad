"use strict";
/* ================================================================== DEMO DATA
   Everything here is invented for the prototype: names, fees, groups and dates.
   Dates are set relative to today so the lists and the report always look current. */
function seed(app) {
  const store = app.store, day = today();
  let seedValue = 7;
  const rnd = () => { seedValue = (seedValue * 1103515245 + 12345) % 2147483648; return seedValue / 2147483648; };
  const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = list => list[Math.floor(rnd() * list.length)];

  const branches = [["Amir Temur", "Tashkent"], ["Tashkent branch 2", "Tashkent"], ["Tashkent branch 3", "Tashkent"], ["Tashkent branch 4", "Tashkent"],
    ["Fergana branch 1", "Fergana"], ["Fergana branch 2", "Fergana"]].map(([name, city]) => store.branches.add(new Branch({ name, city })));
  const main = branches[0];
  const courses = {};
  for (const name of ["General English", "IELTS", "SAT", "CEFR"]) courses[name] = store.courses.add(new Course({ name, usesLevels: name !== "SAT" }));
  const FEES = { "General English": 800000, "IELTS": 1200000, "SAT": 1500000, "CEFR": 900000 }, MOCK_FEE = 150000;

  const staff = (Cls, username, fullName) => store.staff.add(new Cls({ username, fullName, password: "demo", branchId: main.id }));
  const admin = staff(Administrator, "admin", "Jamshid Olimov"), admin2 = staff(Administrator, "admin2", "Sabina Yusupova");
  const cashier = staff(Cashier, "cashier", "Dilshod Rakhimov");
  staff(Coordinator, "coordinator", "Nargiza Tosheva"); staff(BranchManager, "manager", "Rustam Kadirov");

  const g = {};
  const group = (code, course, level, days, startTime, endTime, teacher, capacity = 14, startIn = 6, branch = main) => {
    g[code] = store.groups.add(new Group({ code, courseId: courses[course].id, level, branchId: branch.id, teacher, days, startTime, endTime, capacity,
      startDate: addDays(day, startIn), monthlyFee: FEES[course] }));
  };
  const MWF = "Mon/Wed/Fri", TTS = "Tue/Thu/Sat";
  group("IE-INT-14", "IELTS", "Intermediate", MWF, "18:30", "20:00", "Teacher A");
  group("IE-INT-15", "IELTS", "Intermediate", MWF, "20:00", "21:30", "Teacher B");
  group("IE-INT-11", "IELTS", "Intermediate", MWF, "16:30", "18:00", "Teacher C", 6, -20);
  group("IE-INT-16", "IELTS", "Intermediate", "Sat", "10:00", "13:00", "Teacher A");
  group("IE-UPP-07", "IELTS", "Upper-Intermediate", TTS, "18:30", "20:00", "Teacher D", 14, -35);
  group("IE-ADV-04", "IELTS", "Advanced", MWF, "09:00", "10:30", "Teacher D", 14, -50);
  group("GE-ELE-03", "General English", "Elementary", TTS, "15:00", "16:30", "Teacher E", 14, -40);
  group("GE-PRE-05", "General English", "Pre-Intermediate", MWF, "15:00", "16:30", "Teacher F", 14, -25);
  group("GE-INT-02", "General English", "Intermediate", TTS, "17:00", "18:30", "Teacher E", 14, 4);
  group("SAT-02", "SAT", "", TTS, "09:00", "11:00", "Teacher G", 10, -30);
  group("CE-INT-01", "CEFR", "Intermediate", MWF, "11:00", "12:30", "Teacher H", 14, -15);
  group("GE-BEG-01", "General English", "Beginner", MWF, "13:00", "14:30", "Teacher F", 14, -28);
  group("IE-INT-21", "IELTS", "Intermediate", TTS, "18:30", "20:00", "Teacher K", 14, 6, branches[1]);

  const saturday = addDays(day, ((6 - day.getDay()) % 7) || 7);
  const sessions = [];
  [[30, "Mock centre 1"], [30, "Mock centre 1"], [5, "Mock centre 2"]].forEach(([capacity, room], week) => {
    sessions.push(store.sessions.add(new MockSession({ branchId: main.id, examDate: addDays(saturday, 7 * week), room, capacity, fee: MOCK_FEE })));
    sessions.push(store.sessions.add(new MockSession({ branchId: main.id, examDate: addDays(saturday, 7 * week + 1), room, capacity: 30, fee: MOCK_FEE })));
  });
  const pastSession = store.sessions.add(new MockSession({ branchId: main.id, examDate: addDays(day, -17), room: "Mock centre 1", fee: MOCK_FEE }));

  const FIRST = ("Dilnoza Sardor Malika Jasur Kamola Timur Nodira Otabek Laylo Sherzod Gulnoza Farrukh Madina Akmal Shahzoda Rustam Nigora Javlon Sevara " +
    "Ulugbek Zarina Bobur Mohira Islom Feruza Sanjar Iroda Doston Charos Abror Munisa Elyor Nilufar Jahongir Durdona Azamat Shahlo Oybek Ruxshona Mirzo " +
    "Sitora Anvar Dildora Komil Yulduz Behruz Lola Sarvar Asal Jamol Barno Eldor Ziyoda Husan Marjona Sunnat Nasiba Ravshan Umida Zafar Parizoda Shoxrux " +
    "Robiya Davron Hilola Murod Sabrina Temur Mubina Azizbek Samira Nodir").split(" ");
  const LAST = "Tursunov Rashidov Aliev Yusupov Nematov Saidov Ergashev Azimov Hamidov Toshev Ismoilov Qodirov Mirzaev Sultonov Abdullaev Rahimov Usmonov Nazarov Xolmatov Valiev Sharipov Boboev Normatov Jalilov Ortiqov Zokirov Haydarov Salimov Yoldoshev".split(" ");
  const FEMALE = "Asal Barno Ziyoda Marjona Nasiba Umida Parizoda Robiya Hilola Sabrina Mubina Samira Dilnoza Malika Kamola Nodira Laylo Gulnoza Madina Shahzoda Nigora Sevara Zarina Mohira Feruza Iroda Charos Munisa Nilufar Durdona Shahlo Ruxshona Sitora Dildora Yulduz Lola".split(" ");
  let nameIndex = 0;
  const usedNames = new Set(["Bekzod Tursunov"]);
  const phones = new Set();
  const phone = () => { for (;;) { const v = `+998${pick(["90", "91", "93", "94", "97", "99"])}${randInt(1000000, 9999999)}`; if (!phones.has(v)) { phones.add(v); return v; } } };

  const student = (course, status, registeredDaysAgo, level = "", opt = {}) => {
    let first = opt.first || FIRST[nameIndex++ % FIRST.length], last = opt.last || pick(LAST);
    while (!opt.last && usedNames.has(`${first} ${last}`)) last = pick(LAST);          // no two sample students share a full name
    usedNames.add(`${first} ${last}`);
    const age = opt.adult ? randInt(19, 27) : randInt(14, 17);
    const telegram = opt.telegram === false ? "" : `@${first.toLowerCase()}_${last.toLowerCase().slice(0, 4)}`;
    const s = store.students.add(new Student({ fullName: `${last}${FEMALE.includes(first) ? "a" : ""} ${first}`,
      dateOfBirth: addDays(new Date(day.getFullYear() - age, day.getMonth(), Math.min(day.getDate(), 28)), -randInt(1, 300)),
      courseId: courses[course].id, branchId: main.id, channel: pick(["Walk-in", "Walk-in", "Walk-in", "Walk-in", "Walk-in", "Phone call", "Phone call", "Telegram", "Instagram"]),
      phone: phone(), parentPhone: opt.adult ? "" : phone(), parentNaReason: opt.adult ? "Adult student" : "", telegram,
      backupContact: telegram ? "" : "SMS", remindersOn: opt.reminders !== false, status, level, registeredOn: addDays(day, -registeredDaysAgo), registeredBy: admin.id }));
    s.code = `S-${10000 + s.id}`;
    return s;
  };
  const pay = (s, payable, amount, daysAgo) => {
    let when = addDays(day, -daysAgo); when.setHours(randInt(9, 19), randInt(0, 59));
    if (when > new Date()) when = new Date(Date.now() - randInt(5, 50) * 60000);      // never in the future
    const before = payable.balance;
    payable.apply(amount);
    const payment = store.payments.add(new Payment({ studentId: s.id, payableKind: payable.kind, payableId: payable.id, amount,
      method: pick([PaymentMethod.CARD, PaymentMethod.CLICK, PaymentMethod.PAYME]), paidAt: when, cashierId: cashier.id,
      balanceAfter: payable.balance, nextDueDate: payable.balance > 0 ? payable.dueDate : null }));
    payment.issueReceipt();
    app.audit.record(cashier, "Payment recorded", s, `Balance ${money(before)}`, money(payable.balance), `${payment.method} · ${payment.receipt.number}`, when);
  };
  const active = (course, code, level, activatedDaysAgo, paidShare = 1, dueIn = 12, opt = {}) => {
    const s = student(course, StudentStatus.ACTIVE, activatedDaysAgo + randInt(1, 4), level, opt);
    s.activatedOn = addDays(day, -activatedDaysAgo);
    const e = store.enrolments.add(new Enrolment({ studentId: s.id, groupId: g[code].id, groupCode: code, enrolledOn: s.activatedOn, fee: g[code].monthlyFee, dueDate: addDays(day, dueIn) }));
    if (paidShare) pay(s, e, Math.round(g[code].monthlyFee * paidShare), Math.max(activatedDaysAgo % 28, 1));
    return { s, e };
  };
  const repeat = (n, fn) => { for (let i = 0; i < n; i++) fn(i); };

  // active students: enough history for the report, and one group that is already full
  repeat(6, () => active("IELTS", "IE-INT-11", "Intermediate", randInt(22, 80)));
  repeat(8, () => active("IELTS", "IE-UPP-07", "Upper-Intermediate", randInt(36, 90)));
  repeat(7, () => active("IELTS", "IE-ADV-04", "Advanced", randInt(40, 100), 1, 12, { adult: true }));
  repeat(8, () => active("General English", "GE-ELE-03", "Elementary", randInt(32, 80)));
  repeat(8, () => active("General English", "GE-PRE-05", "Pre-Intermediate", randInt(2, 24)));
  repeat(7, () => active("General English", "GE-BEG-01", "Beginner", randInt(1, 27)));
  repeat(5, () => active("SAT", "SAT-02", "", randInt(3, 26)));
  repeat(6, () => active("CEFR", "CE-INT-01", "Intermediate", randInt(1, 14)));

  // overdue and grace-period cases for the cashier (UC15)
  active("IELTS", "IE-UPP-07", "Upper-Intermediate", 40, 0.5, -5);
  const noTelegram = active("General English", "GE-ELE-03", "Elementary", 45, 0, -4, { telegram: false });
  active("SAT", "SAT-02", "", 33, 0.5, -1);
  active("IELTS", "IE-ADV-04", "Advanced", 60, 0, -6, { reminders: false, adult: true });
  active("General English", "GE-PRE-05", "Pre-Intermediate", 50, 0.5, -9);
  active("CEFR", "CE-INT-01", "Intermediate", 38, 0, -7);
  active("General English", "GE-BEG-01", "Beginner", 41, 0.25, -8, { telegram: false });
  active("SAT", "SAT-02", "", 44, 0, -2);
  active("IELTS", "IE-UPP-07", "Upper-Intermediate", 52, 0.5, -3, { reminders: false });
  const twoDaysAgo = addDays(day, -2); twoDaysAgo.setHours(11, 5);
  store.contacts.add(new ContactLog({ studentId: noTelegram.s.id, channel: "Phone call", result: ContactResult.NO_ANSWER, comment: "Payment date passed",
    staffId: cashier.id, staffName: cashier.fullName, at: twoDaysAgo }));

  // archived students, for 'archived and why' in the report (UC17)
  const LEAVERS = [["IELTS", "IE-UPP-07", "Upper-Intermediate"], ["General English", "GE-ELE-03", "Elementary"], ["IELTS", "IE-ADV-04", "Advanced"],
    ["General English", "GE-PRE-05", "Pre-Intermediate"], ["SAT", "SAT-02", ""], ["CEFR", "CE-INT-01", "Intermediate"], ["General English", "GE-BEG-01", "Beginner"]];
  const WHY = [0, 0, 1, 2, 3, 0, 2, 4, 1, 0, 3, 2, 0, 1, 0, 2];
  repeat(16, i => {
    const [course, code, level] = LEAVERS[i % LEAVERS.length];
    const { s, e } = active(course, code, level, randInt(45, 95));
    s.status = StudentStatus.ARCHIVED;
    s.archivedOn = addDays(day, -(i < 12 ? randInt(0, Math.min(day.getDate() - 1, 22)) : randInt(32, 50)));
    s.archiveReason = ARCHIVE_REASONS[WHY[i]];
    e.active = false;
  });

  // students at each step of enrolment, with their tasks on today's list (UC19)
  const r1 = student("IELTS", StudentStatus.REGISTERED, 1);
  app.tasks.open(r1, TaskType.PLACEMENT, "Registered yesterday (walk-in)");
  const r2 = student("General English", StudentStatus.REGISTERED, 0, "", { telegram: false });
  app.tasks.open(r2, TaskType.PLACEMENT, "Registered today (phone call)");
  const placed = (course, level, opt) => {
    const s = student(course, StudentStatus.PLACED, 2, level, opt);
    store.tests.add(new PlacementTest({ studentId: s.id, version: `${course} placement, version A`, takenAt: addDays(now(), -1), examinerId: admin.id,
      listening: 27, reading: 25, grammar: 24, speakingScore: 5.5, suggestedLevel: level, finalLevel: level }));
    app.tasks.open(s, TaskType.ASSIGN_GROUP, `Placed: ${level}`);
    return s;
  };
  // clash demo: this student has a mock exam on the Saturday when group IE-INT-16 meets
  const clashStudent = placed("IELTS", "Intermediate", { first: "Bekzod", last: "Tursunov" });
  store.bookings.add(new MockBooking({ studentId: clashStudent.id, sessionId: sessions[0].id, sessionLabel: sessions[0].label(), bookedOn: addDays(day, -1),
    fee: MOCK_FEE, paid: MOCK_FEE, dueDate: sessions[0].examDate }));
  placed("General English", "Intermediate");
  const assigned = student("IELTS", StudentStatus.GROUP_ASSIGNED, 3, "Intermediate");
  store.enrolments.add(new Enrolment({ studentId: assigned.id, groupId: g["IE-INT-15"].id, groupCode: "IE-INT-15", enrolledOn: addDays(day, -1), fee: FEES.IELTS, dueDate: g["IE-INT-15"].startDate }));
  const ready = student("CEFR", StudentStatus.READY, 4, "Intermediate");
  const readyEnrolment = store.enrolments.add(new Enrolment({ studentId: ready.id, groupId: g["CE-INT-01"].id, groupCode: "CE-INT-01", enrolledOn: addDays(day, -2), fee: FEES.CEFR, dueDate: addDays(day, 20) }));
  pay(ready, readyEnrolment, FEES.CEFR, 0);
  app.tasks.open(ready, TaskType.ACTIVATE, "First payment received");

  // follow-up tasks: absences and monthly check-ins (Interview Q8)
  const actives = store.students.find(s => s.status === StudentStatus.ACTIVE);
  app.tasks.open(actives[2], TaskType.ABSENT, "Absent from 09:00 lesson, 2nd absence this month");
  app.tasks.open(actives[3], TaskType.ABSENT, "Absent from 16:30 lesson");
  app.tasks.open(actives[30], TaskType.ABSENT, "Absent from 15:00 lesson, parent not informed");
  actives.slice(6, 12).forEach(s => app.tasks.open(s, TaskType.MONTHLY_CHECKIN, "Call student and parent"));
  actives.slice(12, 40).forEach(s => {
    const at = addDays(now(), -randInt(3, 20));
    store.contacts.add(new ContactLog({ studentId: s.id, contacted: s.parentPhone ? pick(["Student", "Parent"]) : "Student", channel: pick(["Phone call", "Telegram"]),
      result: pick([ContactResult.ANSWERED, ContactResult.ANSWERED, ContactResult.NO_ANSWER]), comment: "Monthly check-in, no problems",
      staffId: admin2.id, staffName: admin2.fullName, at }));
  });
  app.payments.syncOverdueTasks();

  // mock exam history, and one session that is already full
  actives.slice(0, 5).forEach(s => store.bookings.add(new MockBooking({ studentId: s.id, sessionId: sessions[4].id, sessionLabel: sessions[4].label(),
    bookedOn: addDays(day, -3), fee: MOCK_FEE, paid: MOCK_FEE, dueDate: sessions[4].examDate })));
  [["6.5", "L 7.0 · R 6.5 · W 6.0 · S 6.5"], ["7.0", "L 7.5 · R 7.0 · W 6.5 · S 7.0"], ["6.0", "L 6.0 · R 6.5 · W 5.5 · S 6.0"],
    ["7.5", "L 8.0 · R 7.5 · W 7.0 · S 7.5"], ["6.5", "L 6.5 · R 7.0 · W 6.0 · S 6.5"], ["5.5", "L 5.5 · R 6.0 · W 5.0 · S 5.5"]].forEach(([band, scores], i) =>
    store.bookings.add(new MockBooking({ studentId: actives[i].id, sessionId: pastSession.id, sessionLabel: pastSession.label(), bookedOn: addDays(day, -25),
      fee: MOCK_FEE, paid: MOCK_FEE, dueDate: pastSession.examDate, band, scores })));

  // a parent phone that is already on record, shown on the registration screen for the duplicate demo
  store.settings.demoParentPhone = actives.find(s => s.parentPhone).parentPhone;
}
