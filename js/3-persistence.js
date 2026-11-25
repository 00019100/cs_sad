"use strict";
/* ================================================================== 3. PERSISTENCE */
class Repository {
  constructor() { this.items = []; this.nextId = 1; }
  add(obj) { if (!Object.isFrozen(obj)) obj.id = this.nextId++; this.items.push(obj); return obj; }
  get(id) { return this.items.find(o => o.id === Number(id)) || null; }
  find(test = () => true) { return this.items.filter(test); }
  first(test) { return this.items.find(test) || null; }
  count(test = () => true) { return this.items.filter(test).length; }
}
class Store {
  constructor() {
    for (const name of ["branches", "courses", "staff", "students", "tests", "groups", "enrolments", "sessions", "bookings", "payments",
      "refunds", "tasks", "contacts", "activity"]) this[name] = new Repository();
    this.settings = { graceDays: 3, notes: {} };
  }
  payable(kind, id) { return (kind === "enrolment" ? this.enrolments : this.bookings).get(id); }
  enrolledCount(groupId) { return this.enrolments.count(e => e.groupId === groupId && e.active); }
  bookedCount(sessionId) { return this.bookings.count(b => b.sessionId === sessionId && !b.cancelled); }
}
