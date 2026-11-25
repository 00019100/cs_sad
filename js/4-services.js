"use strict";
/* ================================================================== 4. SERVICES */
/** A business rule stopped the action. The message is shown to the user. */
class RuleError extends Error {}
class ValidationError extends RuleError { constructor(errors) { super("Please correct the highlighted fields"); this.errors = errors; } }
class DuplicateFound extends RuleError { constructor(matches) { super("Possible match found"); this.matches = matches; } }
class GroupFull extends RuleError {}
class ScheduleClash extends RuleError {}
class GatewayFailed extends RuleError {}
class NotAllowed extends RuleError {}

const requirePermission = (staff, permission) => { if (!staff.can(permission)) throw new NotAllowed(`The ${staff.role} role may not ${permission}.`); };
const now = () => { const d = new Date(); d.setSeconds(0, 0); return d; };

class AuditService {
  constructor(store) { this.store = store; }
  record(staff, action, student = null, oldValue = "", newValue = "", comment = "", at = null) {
    return this.store.activity.add(new ActivityLogEntry({ id: this.store.activity.nextId++, at: at || now(), staffId: staff ? staff.id : 0,
      staffName: staff ? staff.fullName : "System", branchId: student ? student.branchId : (staff ? staff.branchId : 0), action,
      studentId: student ? student.id : 0, studentName: student ? student.fullName : "", oldValue: String(oldValue), newValue: String(newValue), comment }));
  }
}

/** Creates and closes the tasks that appear on the daily task list (UC19). */
class TaskBoard {
  constructor(store) { this.store = store; }
  open(student, type, detail, due = null, ownerRole = Role.ADMINISTRATOR) {
    const existing = this.store.tasks.first(t => t.studentId === student.id && t.type === type && t.open);
    if (existing) { existing.detail = detail; existing.due = due || existing.due; return existing; }
    return this.store.tasks.add(new FollowUpTask({ studentId: student.id, branchId: student.branchId, type, detail, due: due || today(), ownerRole, createdAt: now() }));
  }
  close(student, ...types) { this.store.tasks.find(t => t.studentId === student.id && types.includes(t.type) && t.open).forEach(t => t.close()); }
}

class AuthService {
  constructor(store) { this.store = store; }
  login(username, password) {
    const staff = this.store.staff.first(s => s.username === String(username).trim().toLowerCase());
    return staff && staff.password === password ? staff : null;
  }
}

/** Registration, activation, archiving and refunds (UC03, UC04, UC12, UC17, UC18). */
class EnrolmentService {
  constructor(store, audit, tasks, notifier) { Object.assign(this, { store, audit, tasks, notifier }); }

  validate(form) {
    const errors = {}, day = today();
    if ((form.fullName || "").trim().split(/\s+/).length < 2) errors.fullName = "Enter surname and first name";
    const dob = parseISO(form.dateOfBirth);
    if (!dob) errors.dateOfBirth = "Enter the date of birth";
    else if (dob >= day || dob.getFullYear() < 1940) errors.dateOfBirth = "Date of birth is not realistic";
    if (!form.courseId) errors.courseId = "Choose a course";
    if (!Object.values(ContactChannel).includes(form.channel)) errors.channel = "Choose how the student contacted the centre";
    if (!isValidPhone(form.phone)) errors.phone = "Phone number must have 9 digits after +998";
    if (form.parentNa) {
      if (!(form.parentNaReason || "").trim()) errors.parentNaReason = "Give the reason why there is no parent contact";
      else if (dob && new Student({ dateOfBirth: dob }).isMinor(day)) errors.parentPhone = "A parent phone number is required for students under 18";
    } else if (!isValidPhone(form.parentPhone)) errors.parentPhone = "Phone number must have 9 digits after +998";
    const telegram = (form.telegram || "").trim();
    if (form.noTelegram) {
      if (!["SMS", "Phone call"].includes(form.backupContact)) errors.backupContact = "Choose SMS or phone call as the backup contact";
    } else if (!telegram.startsWith("@") || telegram.length < 4) errors.telegram = "Enter the Telegram username (@name) or tick 'No Telegram'";
    return errors;
  }

  /** UC03 step 6: same student phone, same Telegram, or the same parent phone (siblings). */
  findDuplicates(phone, parentPhone, telegram) {
    const found = new Map();
    const check = (test, why) => this.store.students.find(test).forEach(s => { if (!found.has(s.id)) found.set(s.id, { student: s, why }); });
    if (phone) check(s => s.phone === phone, "same student phone");
    if (telegram) check(s => s.telegram && s.telegram.toLowerCase() === telegram.toLowerCase(), "same Telegram account");
    if (parentPhone) check(s => s.parentPhone === parentPhone, "same parent phone");
    return [...found.values()];
  }

  /** UC03 Register New Student (includes UC04 Record Contact Details). */
  register(form, staff, duplicateComment = null) {
    requirePermission(staff, P.REGISTER);
    const errors = this.validate(form);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const phone = normalisePhone(form.phone);
    const parentPhone = form.parentNa ? "" : normalisePhone(form.parentPhone);
    const telegram = form.noTelegram ? "" : form.telegram.trim();
    if (duplicateComment === null) {
      const matches = this.findDuplicates(phone, parentPhone, telegram);
      if (matches.length) throw new DuplicateFound(matches);
    } else if (!duplicateComment.trim()) throw new ValidationError({ duplicateComment: "A comment is required to continue" });

    const student = this.store.students.add(new Student({ fullName: form.fullName.trim(), dateOfBirth: parseISO(form.dateOfBirth),
      courseId: Number(form.courseId), branchId: staff.branchId, channel: form.channel, phone, parentPhone,
      parentNaReason: form.parentNa ? form.parentNaReason.trim() : "", telegram, backupContact: form.noTelegram ? form.backupContact : "",
      registeredOn: today(), registeredBy: staff.id }));
    student.code = `S-${10000 + student.id}`;
    let comment = (form.comment || "").trim();
    if (duplicateComment) comment = [comment, "Possible duplicate reviewed: " + duplicateComment.trim()].filter(Boolean).join(" | ");
    this.audit.record(staff, "Student registered", student, "", student.status, `Channel: ${student.channel}. ${comment}`.trim());
    this.tasks.open(student, TaskType.PLACEMENT, `Registered ${fmtDay(today())} (${student.channel.toLowerCase()})`);
    return student;
  }

  /** UC12 Activate Student (includes UC13 Send Notification). */
  activate(student, staff) {
    requirePermission(staff, P.ACTIVATE);
    if (!student.canBeActivated()) throw new RuleError("The student can be activated only after the first payment (status 'Ready for activation').");
    const old = student.status;
    student.status = StudentStatus.ACTIVE; student.activatedOn = today();
    this.tasks.close(student, TaskType.ACTIVATE);
    this.audit.record(staff, "Student activated", student, old, student.status);
    return this.notify(student, staff, "Welcome to IELTS ZONE! Your place is confirmed. Your group details are in your profile.");
  }

  notify(student, staff, text) {
    const result = this.notifier.send(student, text);
    this.store.contacts.add(new ContactLog({ studentId: student.id, channel: result.channel,
      result: result.delivered ? ContactResult.SENT : ContactResult.NO_ANSWER, comment: `${text} [${result.note}]`,
      staffId: staff ? staff.id : 0, staffName: "System", at: now(), automatic: true }));
    if (!result.delivered) this.tasks.open(student, TaskType.MONTHLY_CHECKIN, "Message could not be sent: call the student");
    return result.channel;
  }

  totalPaid(student) { return this.store.payments.find(p => p.studentId === student.id && !p.reversed).reduce((sum, p) => sum + p.amount, 0); }

  /** UC17 Archive Student (extended by UC18 Process Refund). */
  archive(student, staff, reason, comment, refundAmount = 0, centreError = "") {
    requirePermission(staff, P.ARCHIVE);
    const errors = {};
    if (!ARCHIVE_REASONS.includes(reason)) errors.reason = "Choose a reason for archiving";
    if (!(comment || "").trim()) errors.comment = "A comment is required";
    if (refundAmount) {
      if (!(centreError || "").trim()) errors.centreError = "Refunds are only possible when the centre made an error. Describe the error.";
      const paid = this.totalPaid(student);
      if (refundAmount > paid) errors.refundAmount = `The refund cannot be more than the amount paid (${money(paid)})`;
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
    let refund = null;
    if (refundAmount) {
      refund = this.store.refunds.add(new Refund({ studentId: student.id, amount: refundAmount, centreError: centreError.trim(), requestedBy: staff.id, requestedAt: now() }));
      this.audit.record(staff, "Refund requested", student, "", money(refundAmount), centreError.trim());
    }
    const old = student.status;
    this.store.enrolments.find(e => e.studentId === student.id && e.active).forEach(e => { e.active = false; });   // releases the seat
    this.store.tasks.find(t => t.studentId === student.id && t.open).forEach(t => t.close());
    student.status = StudentStatus.ARCHIVED; student.archivedOn = today(); student.archiveReason = reason;
    this.audit.record(staff, "Student archived", student, old, student.status, `Reason: ${reason}. ${comment.trim()}`);
    return refund;
  }

  decideRefund(refund, manager, approve) {
    requirePermission(manager, P.APPROVE_REFUND);
    if (!refund.isPending()) throw new RuleError("This refund has already been decided.");
    refund.status = approve ? RefundStatus.APPROVED : RefundStatus.REJECTED;
    refund.decidedBy = manager.id; refund.decidedAt = now();
    this.audit.record(manager, approve ? "Refund approved" : "Refund rejected", this.store.students.get(refund.studentId),
      RefundStatus.PENDING, refund.status, `${money(refund.amount)}. Centre error: ${refund.centreError}`);
  }

  addComment(student, staff, text) {
    if (!(text || "").trim()) throw new RuleError("Write a comment first.");
    this.audit.record(staff, "Comment", student, "", "", text.trim());
  }

  /** UC03 ext. 8a: a saved record is corrected with a comment; old and new values are kept. */
  editContact(student, staff, phone, telegram, remindersOn, comment) {
    requirePermission(staff, P.REGISTER);
    if (!(comment || "").trim()) throw new RuleError("A reason is required when a saved record is corrected.");
    if (!isValidPhone(phone)) throw new RuleError("Phone number must have 9 digits after +998.");
    const describe = () => `${showPhone(student.phone)}, ${student.telegram || "no Telegram"}, reminders ${student.remindersOn ? "on" : "off"}`;
    const old = describe();
    student.phone = normalisePhone(phone); student.telegram = (telegram || "").trim(); student.remindersOn = remindersOn;
    student.backupContact = student.telegram ? "" : (student.backupContact || "SMS");
    this.audit.record(staff, "Contact details corrected", student, old, describe(), comment.trim());
  }
}

/** UC05 Conduct Placement Test (includes UC06 Conduct Speaking Check). */
class PlacementService {
  constructor(store, audit, tasks) { Object.assign(this, { store, audit, tasks }); }
  versionsFor(student) { return PlacementService.VERSIONS[this.store.courses.get(student.courseId).name] || ["General placement, version A"]; }
  build(student, staff, form) {
    const int = v => /^\d+$/.test(String(v || "").trim()) ? Number(v) : NaN;
    const float = v => String(v || "").trim() === "" ? NaN : Number(v);
    return new PlacementTest({ studentId: student.id, version: form.version || "", takenAt: now(), examinerId: staff.id,
      listening: int(form.listening), reading: int(form.reading), grammar: int(form.grammar),
      speakingScore: float(form.speakingScore), speakingComment: (form.speakingComment || "").trim() });
  }
  record(student, staff, form) {
    requirePermission(staff, P.PLACEMENT);
    if (!student.canTakePlacement()) throw new RuleError(`A placement test cannot be recorded while the status is '${student.status}'.`);
    const test = this.build(student, staff, form);
    const errors = test.sectionErrors();
    if (!this.versionsFor(student).includes(test.version)) errors.version = "Choose a test version for the student's course";
    const scoresOk = !Object.keys(test.sectionErrors()).length;
    test.suggestedLevel = scoresOk ? test.suggestLevel() : "";
    const override = form.overrideLevel || "", comment = (form.overrideComment || "").trim();
    if (override && override !== test.suggestedLevel) {
      if (!comment) errors.overrideComment = "A comment is required when the suggested level is changed";
    } else if (scoresOk && test.isBorderline() && !comment) {
      errors.overrideComment = "Borderline result: discuss with the Coordinator and record the decision here";
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
    test.finalLevel = override || test.suggestedLevel; test.overrideComment = comment;
    this.store.tests.add(test);
    const old = student.status;
    student.level = test.finalLevel; student.status = StudentStatus.PLACED;
    this.tasks.close(student, TaskType.PLACEMENT);
    this.tasks.open(student, TaskType.ASSIGN_GROUP, `Placed: ${student.level}`);
    this.audit.record(staff, "Level confirmed", student, old, student.status,
      `Suggested ${test.suggestedLevel} (${test.overallPercent()}%), confirmed ${test.finalLevel}. ${comment}`.trim());
    return test;
  }
  reschedule(student, staff, newDate) {
    requirePermission(staff, P.PLACEMENT);
    if (!newDate || newDate < today()) throw new RuleError("Choose a new test date that is not in the past.");
    this.tasks.open(student, TaskType.PLACEMENT, `Rescheduled to ${fmtDay(newDate)}`, newDate);
    this.audit.record(staff, "Placement test rescheduled", student, "", fmtDate(newDate));
  }
  markIncomplete(student, staff, comment) {
    requirePermission(staff, P.PLACEMENT);
    if (!(comment || "").trim()) throw new RuleError("Add a comment explaining why the test is incomplete.");
    this.store.tests.add(new PlacementTest({ studentId: student.id, takenAt: now(), examinerId: staff.id, outcome: "Incomplete", overrideComment: comment.trim() }));
    this.tasks.open(student, TaskType.PLACEMENT, "Test incomplete: retake needed");
    this.audit.record(staff, "Placement test incomplete", student, "", "", comment.trim());
  }
}
PlacementService.VERSIONS = { "IELTS": ["IELTS placement, version A", "IELTS placement, version B"],
  "General English": ["General English placement, version A", "General English placement, version B"],
  "SAT": ["SAT diagnostic, version A"], "CEFR": ["CEFR placement, version A"] };

/** UC07 Assign Student to Group (includes UC08 Check Schedule Conflict) and mock exam booking. */
class GroupService {
  constructor(store, audit, tasks) { Object.assign(this, { store, audit, tasks }); }
  candidates(student, allBranches = false, days = "", period = "") {
    const inPeriod = g => !period || (period === "Morning" ? g.startTime < "12:00" : period === "Afternoon" ? (g.startTime >= "12:00" && g.startTime < "17:00") : g.startTime >= "17:00");
    return this.store.groups.find(g => g.courseId === student.courseId && (g.level === student.level || g.level === "")
        && (allBranches || g.branchId === student.branchId) && (!days || g.days === days) && inPeriod(g))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)).map(group => ({ group, enrolled: this.store.enrolledCount(group.id) }));
  }
  currentEnrolment(student) { return this.store.enrolments.first(e => e.studentId === student.id && e.active); }
  /** UC08: other groups and mock exam bookings. Returns a description of the clash, or "". */
  findClash(student, slot, ignoreGroupId = 0, onlyMocks = false) {
    if (!onlyMocks) for (const e of this.store.enrolments.find(x => x.studentId === student.id && x.active && x.groupId !== ignoreGroupId)) {
      const other = this.store.groups.get(e.groupId);
      if (other.slot.overlaps(slot)) return `the student is already in group ${other.code} (${other.slot})`;
    }
    for (const b of this.store.bookings.find(x => x.studentId === student.id && !x.cancelled)) {
      const session = this.store.sessions.get(b.sessionId);
      if (session.examDate >= today() && session.slot.overlaps(slot))
        return `the student has a mock exam booked on ${WEEKDAYS[session.examDate.getDay()]} ${fmtDay(session.examDate)}, ${session.startTime}–${session.endTime}`;
    }
    return "";
  }
  assign(student, group, staff, comment = "") {
    requirePermission(staff, P.ASSIGN_GROUP);
    if (!student.canBeAssigned()) throw new RuleError("The student needs a confirmed level before a group can be assigned.");
    const current = this.currentEnrolment(student);
    if (current && current.groupId === group.id) throw new RuleError(`The student is already in group ${group.code}.`);
    if (current && !comment.trim()) throw new RuleError("A reason is required when a student moves to another group.");
    if (group.isFull(this.store.enrolledCount(group.id))) throw new GroupFull(`Group ${group.code} is full (${group.capacity} of ${group.capacity} seats taken).`);
    const clash = this.findClash(student, group.slot, current ? current.groupId : 0);
    if (clash) throw new ScheduleClash(`Time clash: ${group.code} meets ${group.slot}, but ${clash}.`);
    const day = today();
    const enrolment = new Enrolment({ studentId: student.id, groupId: group.id, groupCode: group.code, enrolledOn: day, fee: group.monthlyFee,
      dueDate: group.startDate && group.startDate > day ? group.startDate : day });
    let old = "none";
    if (current) {                       // UC07 ext. 6a: release the old seat
      old = current.groupCode; current.active = false;
      enrolment.paid = Math.min(current.paid, enrolment.fee); enrolment.dueDate = current.dueDate;
    }
    this.store.enrolments.add(enrolment);
    if (student.status === StudentStatus.PLACED) student.status = StudentStatus.GROUP_ASSIGNED;
    this.tasks.close(student, TaskType.ASSIGN_GROUP, TaskType.WAITING_LIST);
    this.audit.record(staff, current ? "Group moved" : "Group assigned", student, old,
      `${group.code} · seats left ${group.seatsLeft(this.store.enrolledCount(group.id))}`, comment.trim());
    return enrolment;
  }
  addToWaitingList(student, staff, preference) {
    requirePermission(staff, P.ASSIGN_GROUP);
    this.tasks.close(student, TaskType.ASSIGN_GROUP);
    this.tasks.open(student, TaskType.WAITING_LIST, `Waiting for a ${student.level || "suitable"} group. Prefers: ${preference || "any time"}`, addDays(today(), 7));
    this.audit.record(staff, "Added to waiting list", student, "", "", preference || "");
  }
  upcomingSessions(branchId) {
    return this.store.sessions.find(s => s.branchId === branchId && s.examDate >= today()).sort((a, b) => a.examDate - b.examDate)
      .map(session => ({ session, booked: this.store.bookedCount(session.id) }));
  }
  bookMock(student, session, staff) {
    requirePermission(staff, P.MOCK_BOOKING);
    if (student.isArchived()) throw new RuleError("An archived student cannot book a mock exam.");
    if (this.store.bookedCount(session.id) >= session.capacity) throw new GroupFull(`This mock exam session is full (${session.capacity} seats).`);
    if (this.store.bookings.first(b => b.studentId === student.id && b.sessionId === session.id && !b.cancelled)) throw new RuleError("The student already has a booking for this session.");
    const clash = this.findClash(student, session.slot, 0, true);
    if (clash) throw new ScheduleClash(`Time clash: ${clash}.`);
    const booking = this.store.bookings.add(new MockBooking({ studentId: student.id, sessionId: session.id, sessionLabel: session.label(), bookedOn: today(), fee: session.fee, dueDate: session.examDate }));
    this.audit.record(staff, "Mock exam booked", student, "", session.label(), "Unpaid: confirmed by payment");
    return booking;
  }
}

/** UC09 Process Payment, UC10 Issue Receipt, UC11 Verify Online Payment, UC15 Monitor Overdue, UC16 Send Reminder. */
class PaymentService {
  constructor(store, audit, tasks, gateways, notifier) { Object.assign(this, { store, audit, tasks, gateways, notifier }); }
  get graceDays() { return this.store.settings.graceDays; }
  payablesFor(student) {
    return [...this.store.enrolments.find(e => e.studentId === student.id && e.active),
      ...this.store.bookings.find(b => b.studentId === student.id && !b.cancelled && b.balance > 0)];
  }
  recordPayment(student, payable, amount, method, cashier, comment = "", simulateFailure = false) {
    requirePermission(cashier, P.TAKE_PAYMENT);
    if (!payable) throw new RuleError("Payment is blocked: the student has no group and no mock exam booking. Send the student to an Administrator first.");   // ext. 2a
    const errors = {};
    if (!Object.values(PaymentMethod).includes(method)) errors.method = "Choose the payment method";
    if (!Number.isInteger(amount) || amount <= 0) errors.amount = "Enter the amount received";
    const advance = amount > payable.balance;
    if (!errors.amount && advance && !comment.trim())                                    // ext. 4b
      errors.amount = `The amount is more than the balance (${money(Math.max(payable.balance, 0))}). Correct it, or add a comment to record an advance payment.`;
    if (Object.keys(errors).length) throw new ValidationError(errors);
    let reference = "";
    const gateway = this.gateways.forMethod(method);                                    // ext. 3a: UC11
    if (gateway) {
      const response = gateway.confirm(amount, student.code, simulateFailure);
      if (!response.confirmed) {                                                        // ext. 3b: nothing is saved
        this.audit.record(cashier, "Online payment failed", student, money(payable.balance), "balance unchanged", `${gateway.name}: ${response.message}`);
        throw new GatewayFailed(`${response.message}. No payment was recorded and the balance is unchanged.`);
      }
      reference = response.reference;
    }
    const firstPayment = payable.paid === 0, oldBalance = payable.balance;
    payable.apply(amount);
    if (payable.paymentStatus === PaymentStatus.PARTIAL) payable.extendDueDate(14);     // ext. 4a
    const payment = this.store.payments.add(new Payment({ studentId: student.id, payableKind: payable.kind, payableId: payable.id, amount, method,
      paidAt: now(), cashierId: cashier.id, gatewayRef: reference, balanceAfter: Math.max(payable.balance, 0),
      nextDueDate: payable.balance > 0 ? payable.dueDate : null, comment: comment.trim() }));
    payment.issueReceipt();                                                             // UC10
    if (payable.balance <= 0) this.tasks.close(student, TaskType.PAYMENT_OVERDUE);
    if (payable.kind === "enrolment" && firstPayment && student.status === StudentStatus.GROUP_ASSIGNED) {
      student.status = StudentStatus.READY;                                             // step 9
      this.tasks.open(student, TaskType.ACTIVATE, "First payment received");
    }
    const note = [`${method} · ${payment.receipt.number}`, reference && `gateway ${reference}`, advance && "advance payment", comment.trim()].filter(Boolean).join(" · ");
    this.audit.record(cashier, "Payment recorded", student, `Balance ${money(oldBalance)}`, money(Math.max(payable.balance, 0)), note);
    return payment;
  }
  /** UC09 ext. 6a: the original entry stays; a reversal is added. */
  reverse(payment, cashier, comment) {
    requirePermission(cashier, P.TAKE_PAYMENT);
    if (payment.reversed) throw new RuleError("This payment has already been reversed.");
    if (!(comment || "").trim()) throw new RuleError("A reason is required to reverse a payment.");
    const payable = this.store.payable(payment.payableKind, payment.payableId), oldBalance = payable.balance;
    payable.paid -= payment.amount;
    payment.reversed = true; payment.reversalComment = comment.trim();
    this.audit.record(cashier, "Payment reversed", this.store.students.get(payment.studentId), `Balance ${money(oldBalance)}`, money(payable.balance),
      `${payment.receipt.number}: ${comment.trim()} (original entry kept)`);
  }
  overdueRows(branchId) {
    const day = today();
    return this.store.enrolments.find(e => e.active && e.balance > 0 && e.dueDate && e.dueDate < day).sort((a, b) => a.dueDate - b.dueDate)
      .map(enrolment => ({ enrolment, student: this.store.students.get(enrolment.studentId) }))
      .filter(r => !r.student.isArchived() && (!branchId || r.student.branchId === branchId))
      .map(r => {
        const last = this.store.contacts.find(c => c.studentId === r.student.id).sort((a, b) => b.at - a.at)[0];
        return { ...r, days: r.enrolment.daysOverdue(day), inGrace: r.enrolment.inGracePeriod(day, this.graceDays),
          channel: r.student.remindersOn ? r.student.preferredChannel() : "Reminders OFF",
          last: last ? `${fmtDay(last.at)}, ${last.result.toLowerCase()}` : "none" };
      });
  }
  /** Creates a task for every student who is past the grace period (FR-05). */
  syncOverdueTasks() { this.overdueRows(null).filter(r => !r.inGrace).forEach(r => this.tasks.open(r.student, TaskType.PAYMENT_OVERDUE, `${r.days} days after due date`, null, Role.CASHIER)); }
  reminderText(student, enrolment) {
    return `Hello ${student.fullName.split(" ").pop()}, your IELTS ZONE payment of ${money(enrolment.balance)} was due on ${fmtDay(enrolment.dueDate)}. You can pay by Click, Payme, card or at the cashier desk.`;
  }
  sendReminders(studentIds, staff) {
    requirePermission(staff, P.VIEW_OVERDUE);
    const outcome = { sent: 0, skipped: 0, call: 0 };
    for (const row of this.overdueRows(null).filter(r => studentIds.includes(r.student.id))) {
      if (!row.student.remindersOn) { outcome.skipped++; continue; }                    // Survey Q10: the student's choice
      const result = this.notifier.send(row.student, this.reminderText(row.student, row.enrolment));
      this.store.contacts.add(new ContactLog({ studentId: row.student.id, channel: result.channel,
        result: result.delivered ? ContactResult.SENT : ContactResult.NO_ANSWER, comment: `Payment reminder: ${money(row.enrolment.balance)} [${result.note}]`,
        staffId: staff.id, staffName: staff.fullName, at: now(), automatic: true }));
      outcome[result.delivered ? "sent" : "call"]++;
      this.audit.record(staff, "Payment reminder sent", row.student, "", result.channel, `${money(row.enrolment.balance)} overdue ${row.days} days`);
    }
    return outcome;
  }
}

/** UC19 View Daily Task List and the contact log that replaces the Excel sheet (FR-05). */
class FollowUpService {
  constructor(store, audit, tasks) { Object.assign(this, { store, audit, tasks }); }
  openTasks(branchId) {
    const order = [TaskType.ABSENT, TaskType.PLACEMENT, TaskType.ASSIGN_GROUP, TaskType.ACTIVATE, TaskType.PAYMENT_OVERDUE, TaskType.WAITING_LIST, TaskType.MONTHLY_CHECKIN];
    const limit = addDays(today(), 7);
    return this.store.tasks.find(t => t.branchId === branchId && t.open && (!t.due || t.due <= limit))
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || (a.due || 0) - (b.due || 0));
  }
  counters(branchId) {
    const n = type => this.openTasks(branchId).filter(t => t.type === type).length;
    return { fresh: n(TaskType.PLACEMENT), absent: n(TaskType.ABSENT), payments: n(TaskType.PAYMENT_OVERDUE) + n(TaskType.ACTIVATE),
      followups: n(TaskType.MONTHLY_CHECKIN) + n(TaskType.WAITING_LIST) + n(TaskType.ABSENT) };
  }
  /** An absence creates an immediate follow-up task (Interview Q8). */
  markAbsent(student, staff, lesson) {
    requirePermission(staff, P.FOLLOW_UP);
    this.tasks.open(student, TaskType.ABSENT, `Absent from ${lesson}`);
    this.audit.record(staff, "Absence recorded", student, "", "", lesson);
  }
  logContact(student, staff, contacted, channel, result, comment, nextAction = null, taskId = 0) {
    requirePermission(staff, P.FOLLOW_UP);
    if (!["Student", "Parent"].includes(contacted)) throw new RuleError("Choose who was contacted.");
    if (contacted === "Parent" && !student.parentPhone) throw new RuleError("This student has no parent contact on record.");
    if (channel === "Telegram" && !student.hasTelegram) throw new RuleError("This student has no Telegram account on record. Use SMS or a phone call.");
    if (!Object.values(ContactResult).includes(result)) throw new RuleError("Choose the result of the contact.");
    const entry = this.store.contacts.add(new ContactLog({ studentId: student.id, taskId, contacted, channel, result, comment: (comment || "").trim(),
      staffId: staff.id, staffName: staff.fullName, at: now(), nextAction }));
    const task = taskId ? this.store.tasks.get(taskId) : null;
    if (task && task.open) {
      if (result === ContactResult.ANSWERED) task.close();
      else { task.due = nextAction || today(); task.detail = task.detail.split(" · ")[0] + ` · last try: ${result.toLowerCase()}`; }   // stays open (Interview Q14)
    }
    this.audit.record(staff, "Contact logged", student, "", `${channel} · ${result}`, [contacted, (comment || "").trim()].filter(Boolean).join(". "));
    return entry;
  }
  history(student) { return this.store.contacts.find(c => c.studentId === student.id).sort((a, b) => b.at - a.at || b.id - a.id); }
  meetingNotes(staff, text) {
    const key = `${staff.id}:${iso(today())}`;
    if (text !== undefined) this.store.settings.notes[key] = text;
    return this.store.settings.notes[key] || "";
  }
}

/** UC20: the four numbers the coordinator calculates by hand each month (Interview Q11). */
class ReportService {
  constructor(store) { this.store = store; }
  monthly(year, month, branchId) {
    const start = new Date(year, month, 1), end = new Date(year, month + 1, 1);
    const within = d => d && d >= start && d < end;
    const students = this.store.students.find(s => !branchId || s.branchId === branchId);
    const activeBefore = students.filter(s => s.activatedOn && s.activatedOn < start && (!s.archivedOn || s.archivedOn >= start));
    const fresh = students.filter(s => within(s.activatedOn));
    const archived = students.filter(s => s.activatedOn && within(s.archivedOn));
    const weeks = [0, 0, 0, 0, 0];
    fresh.forEach(s => { weeks[Math.min(Math.floor((s.activatedOn.getDate() - 1) / 7), 4)]++; });
    const tally = (list, key) => Object.entries(list.reduce((acc, s) => { const k = key(s); acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
    return { start, activeStart: activeBefore.length, fresh: fresh.length, archived: archived.length,
      activeEnd: activeBefore.length + fresh.length - archived.length, weeks: weeks[4] ? weeks : weeks.slice(0, 4),
      reasons: tally(archived, s => s.archiveReason), archivedStudents: archived,
      channels: tally(students.filter(s => within(s.registeredOn)), s => s.channel),
      pipeline: tally(students.filter(s => ![StudentStatus.ACTIVE, StudentStatus.ARCHIVED].includes(s.status)), s => s.status.split(":")[0]) };
  }
}

/** Builds every service once and wires them together. */
class Application {
  constructor() {
    this.store = new Store();
    this.audit = new AuditService(this.store);
    this.tasks = new TaskBoard(this.store);
    this.notifier = new NotificationRouter();
    this.gateways = new GatewayRegistry();
    this.auth = new AuthService(this.store);
    this.enrolment = new EnrolmentService(this.store, this.audit, this.tasks, this.notifier);
    this.placement = new PlacementService(this.store, this.audit, this.tasks);
    this.groups = new GroupService(this.store, this.audit, this.tasks);
    this.payments = new PaymentService(this.store, this.audit, this.tasks, this.gateways, this.notifier);
    this.followups = new FollowUpService(this.store, this.audit, this.tasks);
    this.reports = new ReportService(this.store);
  }
}
