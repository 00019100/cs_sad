"use strict";
/* =====================================================================================
   IELTS ZONE Student Enrolment System: high-fidelity prototype (SAD CW2)
   One file, four layers. The layers match the packages of the architecture diagram:
     1. DOMAIN       classes that hold the business rules
     2. INTEGRATION  payment gateways and notification channels (simulated)
     3. PERSISTENCE  in-memory Store with one repository per class
     4. SERVICES     one class per group of use cases
     5. UI           screens, navigation and form handling
   All data is sample data. Nothing is sent anywhere.
   ===================================================================================== */

/* ------------------------------------------------------------------ helpers */
const DAY = 86400000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const daysBetween = (a, b) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / DAY);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const p2 = n => String(n).padStart(2, "0");
const fmtDate = d => d ? `${p2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "—";
const fmtDay = d => d ? `${p2(d.getDate())} ${MONTHS[d.getMonth()]}` : "—";
const fmtDT = d => d ? `${p2(d.getDate())} ${MONTHS[d.getMonth()]} ${p2(d.getHours())}:${p2(d.getMinutes())}` : "—";
const money = n => `${Math.round(n).toLocaleString("en-US")} UZS`;

/* ================================================================== 1. DOMAIN */
const StudentStatus = Object.freeze({
  REGISTERED: "Registered: awaiting placement test", PLACED: "Placed: awaiting group",
  GROUP_ASSIGNED: "Group assigned: awaiting payment", READY: "Ready for activation", ACTIVE: "Active", ARCHIVED: "Archived" });
const PaymentStatus = Object.freeze({ PAID: "Paid", PARTIAL: "Partially paid", OUTSTANDING: "Outstanding" });
const PaymentMethod = Object.freeze({ CASH: "Cash", CARD: "Card (at desk)", CLICK: "Click", PAYME: "Payme" });
const ContactChannel = Object.freeze({ WALK_IN: "Walk-in", PHONE: "Phone call", TELEGRAM: "Telegram", INSTAGRAM: "Instagram" });
const Role = Object.freeze({ ADMINISTRATOR: "Administrator", CASHIER: "Cashier", COORDINATOR: "Coordinator", MANAGER: "Branch Manager" });
const TaskType = Object.freeze({ PLACEMENT: "Placement test", ASSIGN_GROUP: "Assign group", ACTIVATE: "Activate", ABSENT: "Absent",
  PAYMENT_OVERDUE: "Payment overdue", MONTHLY_CHECKIN: "Monthly check-in", WAITING_LIST: "Waiting list" });
const ContactResult = Object.freeze({ ANSWERED: "Answered", NO_ANSWER: "No answer", CALL_BACK: "Call back later", SENT: "Sent" });
const RefundStatus = Object.freeze({ PENDING: "Waiting for Branch Manager", APPROVED: "Approved", REJECTED: "Rejected" });
const P = Object.freeze({ VIEW_TASKS: "view daily tasks", REGISTER: "register students", VIEW_STUDENTS: "view students",
  PLACEMENT: "conduct placement tests", ASSIGN_GROUP: "assign groups", ACTIVATE: "activate students", ARCHIVE: "archive students",
  TAKE_PAYMENT: "take payments", VIEW_OVERDUE: "view overdue payments", FOLLOW_UP: "log follow-ups", MOCK_BOOKING: "book mock exams",
  VIEW_REPORT: "view the monthly report", ALL_BRANCHES: "view all branches", VIEW_LOG: "view the activity log",
  APPROVE_REFUND: "approve refunds", SETTINGS: "change settings" });
const LEVELS = ["Beginner", "Elementary", "Pre-Intermediate", "Intermediate", "Upper-Intermediate", "Advanced"];
const ARCHIVE_REASONS = ["Finished the course", "Moved to another centre", "Financial reasons", "Schedule did not fit", "Other"];

const normalisePhone = raw => (raw || "").replace(/[\s\-()]/g, "");
const isValidPhone = raw => /^\+998\d{9}$/.test(normalisePhone(raw));
const showPhone = v => v && v.length === 13 ? `${v.slice(0, 4)} ${v.slice(4, 6)} ${v.slice(6, 9)} ${v.slice(9, 11)} ${v.slice(11)}` : (v || "");

/** Abstract parent of Student and StaffMember. */
class Person {
  constructor(data) {
    if (new.target === Person) throw new Error("Person is abstract");
    this.id = null; this.fullName = "";
    Object.assign(this, data);
  }
  displayRole() { throw new Error("abstract"); }
}

class Student extends Person {
  constructor(data) {
    super({ code: "", dateOfBirth: null, courseId: 0, branchId: 0, channel: ContactChannel.WALK_IN, phone: "", parentPhone: "",
      parentNaReason: "", telegram: "", backupContact: "", remindersOn: true, status: StudentStatus.REGISTERED, level: "",
      registeredOn: null, registeredBy: 0, activatedOn: null, archivedOn: null, archiveReason: "", ...data });
  }
  displayRole() { return "Student"; }
  ageOn(day) {
    const b = this.dateOfBirth;
    return day.getFullYear() - b.getFullYear() - ((day.getMonth() < b.getMonth() || (day.getMonth() === b.getMonth() && day.getDate() < b.getDate())) ? 1 : 0);
  }
  isMinor(day) { return this.ageOn(day) < 18; }
  get hasTelegram() { return !!this.telegram; }
  /** Telegram first; SMS or a call only as the fallback (UC14). */
  preferredChannel() { return this.hasTelegram ? "Telegram" : (this.backupContact || "SMS"); }
  canTakePlacement() { return [StudentStatus.REGISTERED, StudentStatus.PLACED].includes(this.status); }
  canBeAssigned() { return [StudentStatus.PLACED, StudentStatus.GROUP_ASSIGNED, StudentStatus.READY, StudentStatus.ACTIVE].includes(this.status); }
  canBeActivated() { return this.status === StudentStatus.READY; }
  isArchived() { return this.status === StudentStatus.ARCHIVED; }
}

/** Abstract. Each role is a subclass that answers one question differently: what may I do? */
class StaffMember extends Person {
  constructor(data) {
    super({ username: "", password: "", branchId: 0, ...data });
    if (new.target === StaffMember) throw new Error("StaffMember is abstract");
  }
  get role() { throw new Error("abstract"); }
  permissions() { throw new Error("abstract"); }
  displayRole() { return this.role; }
  can(permission) { return this.permissions().includes(permission); }
}
class Administrator extends StaffMember {
  get role() { return Role.ADMINISTRATOR; }
  permissions() { return [P.VIEW_TASKS, P.REGISTER, P.VIEW_STUDENTS, P.PLACEMENT, P.ASSIGN_GROUP, P.ACTIVATE, P.ARCHIVE, P.FOLLOW_UP, P.MOCK_BOOKING]; }
}
class Cashier extends StaffMember {
  get role() { return Role.CASHIER; }
  permissions() { return [P.VIEW_TASKS, P.VIEW_STUDENTS, P.TAKE_PAYMENT, P.VIEW_OVERDUE, P.FOLLOW_UP]; }
}
class Coordinator extends StaffMember {
  get role() { return Role.COORDINATOR; }
  permissions() { return [P.VIEW_TASKS, P.VIEW_STUDENTS, P.FOLLOW_UP, P.VIEW_OVERDUE, P.VIEW_REPORT, P.VIEW_LOG]; }
}
class BranchManager extends StaffMember {
  get role() { return Role.MANAGER; }
  permissions() { return [P.VIEW_TASKS, P.VIEW_STUDENTS, P.VIEW_OVERDUE, P.VIEW_REPORT, P.ALL_BRANCHES, P.VIEW_LOG, P.APPROVE_REFUND, P.SETTINGS]; }
}

class Branch { constructor(data) { Object.assign(this, { id: null, name: "", city: "" }, data); } }
class Course { constructor(data) { Object.assign(this, { id: null, name: "", usesLevels: true }, data); } }

/** Value object: the days and hours when a group or an exam meets. */
class TimeSlot {
  constructor(days, start, end) { this.days = days.split("/").filter(Boolean); this.start = start; this.end = end; }
  overlaps(other) { return this.days.some(d => other.days.includes(d)) && this.start < other.end && other.start < this.end; }
  toString() { return `${this.days.join("/")} ${this.start}–${this.end}`; }
}

class Group {
  constructor(data) {
    Object.assign(this, { id: null, code: "", courseId: 0, level: "", branchId: 0, teacher: "", days: "", startTime: "", endTime: "",
      capacity: 14, startDate: null, monthlyFee: 0 }, data);
  }
  get slot() { return new TimeSlot(this.days, this.startTime, this.endTime); }
  seatsLeft(enrolled) { return Math.max(this.capacity - enrolled, 0); }
  isFull(enrolled) { return enrolled >= this.capacity; }
}

/** Part of a PlacementTest and never exists without one (composition, UC06). */
class SpeakingCheck {
  constructor(score, comment = "") { this.score = score; this.comment = comment; }
  isValid() { return Number.isFinite(this.score) && this.score >= 0 && this.score <= SpeakingCheck.MAX; }
}
SpeakingCheck.MAX = 9;

class PlacementTest {
  constructor(data) {
    Object.assign(this, { id: null, studentId: 0, version: "", takenAt: null, examinerId: 0, listening: 0, reading: 0, grammar: 0,
      suggestedLevel: "", finalLevel: "", overrideComment: "", outcome: "Completed" }, data);
    this.speaking = new SpeakingCheck(data.speakingScore ?? 0, data.speakingComment ?? "");
  }
  sectionErrors() {
    const errors = {};
    for (const name of ["listening", "reading", "grammar"]) {
      const v = this[name];
      if (!Number.isInteger(v) || v < 0 || v > PlacementTest.SECTION_MAX) errors[name] = `Score must be between 0 and ${PlacementTest.SECTION_MAX}`;
    }
    if (!this.speaking.isValid()) errors.speakingScore = "Speaking score must be between 0 and 9";
    return errors;
  }
  overallPercent() {
    const written = (this.listening + this.reading + this.grammar) / (3 * PlacementTest.SECTION_MAX) * 100;
    const spoken = this.speaking.score / SpeakingCheck.MAX * 100;
    return Math.round((0.7 * written + 0.3 * spoken) * 10) / 10;
  }
  suggestLevel() {
    const pct = this.overallPercent();
    const i = PlacementTest.BANDS.findIndex(limit => pct < limit);
    return LEVELS[i === -1 ? LEVELS.length - 1 : i];
  }
  /** True when the result falls close to the line between two levels (UC05 ext. 7a). */
  isBorderline() { const pct = this.overallPercent(); return PlacementTest.BANDS.some(limit => Math.abs(pct - limit) <= PlacementTest.BORDER); }
}
PlacementTest.SECTION_MAX = 40; PlacementTest.BANDS = [20, 35, 50, 68, 84]; PlacementTest.BORDER = 2;

class MockSession {
  constructor(data) { Object.assign(this, { id: null, branchId: 0, examType: "IELTS mock", examDate: null, startTime: "10:00", endTime: "13:00", room: "", capacity: 30, fee: 0 }, data); }
  get slot() { return new TimeSlot(WEEKDAYS[this.examDate.getDay()], this.startTime, this.endTime); }
  label() { return `${this.examType}, ${WEEKDAYS[this.examDate.getDay()]} ${fmtDay(this.examDate)} ${this.startTime}–${this.endTime}`; }
}

/** Abstract parent of everything a student pays for. The payment screen works with any Payable,
    which is how a mock-exam-only student can pay without having a group (FR-04). */
class Payable {
  constructor(data) {
    if (new.target === Payable) throw new Error("Payable is abstract");
    Object.assign(this, { id: null, studentId: 0, fee: 0, paid: 0, dueDate: null }, data);
  }
  get kind() { throw new Error("abstract"); }
  describe() { throw new Error("abstract"); }
  get balance() { return this.fee - this.paid; }
  get paymentStatus() { return this.paid >= this.fee ? PaymentStatus.PAID : this.paid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.OUTSTANDING; }
  daysOverdue(day) { return (this.balance <= 0 || !this.dueDate) ? 0 : Math.max(daysBetween(day, this.dueDate), 0); }
  inGracePeriod(day, graceDays) { const d = this.daysOverdue(day); return d > 0 && d <= graceDays; }
  isOverdue(day, graceDays) { return this.daysOverdue(day) > graceDays; }
  apply(amount) { this.paid += amount; }
  /** A partial payment gives the student more time for the rest. */
  extendDueDate(days = 14) { this.dueDate = addDays(this.dueDate || today(), days); }
}
class Enrolment extends Payable {
  constructor(data) { super({ groupId: 0, groupCode: "", enrolledOn: null, active: true, ...data }); }
  get kind() { return "enrolment"; }
  describe() { return `Group ${this.groupCode}`; }
}
class MockBooking extends Payable {
  constructor(data) { super({ sessionId: 0, sessionLabel: "", bookedOn: null, band: "", scores: "", cancelled: false, ...data }); }
  get kind() { return "booking"; }
  describe() { return `Mock exam: ${this.sessionLabel}`; }
  get confirmed() { return this.paymentStatus === PaymentStatus.PAID; }
}

/** Issued with every successful payment and owned by it (composition, UC10). */
class Receipt {
  constructor(number, issuedAt, amount, method, remainingBalance, nextDueDate) { Object.assign(this, { number, issuedAt, amount, method, remainingBalance, nextDueDate }); }
  static makeNumber(paymentId, when) { return `R-${when.getFullYear()}-${String(paymentId).padStart(6, "0")}`; }
}
class Payment {
  constructor(data) {
    Object.assign(this, { id: null, studentId: 0, payableKind: "", payableId: 0, amount: 0, method: PaymentMethod.CASH, paidAt: null, cashierId: 0,
      gatewayRef: "", balanceAfter: 0, nextDueDate: null, comment: "", reversed: false, reversalComment: "", receipt: null }, data);
  }
  issueReceipt() { this.receipt = new Receipt(Receipt.makeNumber(this.id, this.paidAt), this.paidAt, this.amount, this.method, this.balanceAfter, this.nextDueDate); return this.receipt; }
}
class Refund {
  constructor(data) { Object.assign(this, { id: null, studentId: 0, amount: 0, centreError: "", requestedBy: 0, requestedAt: null, status: RefundStatus.PENDING, decidedBy: 0, decidedAt: null }, data); }
  isPending() { return this.status === RefundStatus.PENDING; }
}

class FollowUpTask {
  constructor(data) { Object.assign(this, { id: null, studentId: 0, branchId: 0, type: TaskType.PLACEMENT, detail: "", due: null, open: true, ownerRole: Role.ADMINISTRATOR, createdAt: null }, data); }
  close() { this.open = false; }
  dueLabel(day) { return this.type === TaskType.ABSENT ? "Call now" : (!this.due || this.due <= day) ? "Today" : fmtDay(this.due); }
}
class ContactLog {
  constructor(data) { Object.assign(this, { id: null, studentId: 0, taskId: 0, contacted: "Student", channel: "Phone call", result: ContactResult.ANSWERED, comment: "", staffId: 0, staffName: "", at: null, automatic: false, nextAction: null }, data); }
}
/** One line of the audit trail. Entries are only ever added, never changed (NFR-02). */
class ActivityLogEntry {
  constructor(data) { Object.assign(this, { id: null, at: null, staffId: 0, staffName: "", branchId: 0, action: "", studentId: 0, studentName: "", oldValue: "", newValue: "", comment: "" }, data); Object.freeze(this); }
}
