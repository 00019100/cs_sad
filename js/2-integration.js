"use strict";
/* ================================================================== 2. INTEGRATION */
/** Interface for outgoing messages. Nothing leaves the browser: each send is written to the contact history. */
class NotificationChannel {
  get name() { throw new Error("abstract"); }
  canReach(student) { throw new Error("abstract"); }
  send(student, text) { throw new Error("abstract"); }
}
class TelegramNotifier extends NotificationChannel {
  get name() { return "Telegram"; }
  canReach(student) { return student.hasTelegram; }
  send(student) { return { channel: this.name, delivered: true, note: `to ${student.telegram} (simulated)` }; }
}
class SmsNotifier extends NotificationChannel {
  get name() { return "SMS"; }
  canReach(student) { return !!student.phone && student.backupContact !== "Phone call"; }
  send(student) { return { channel: this.name, delivered: true, note: `to ${showPhone(student.phone)} (simulated)` }; }
}
class CallFallback extends NotificationChannel {
  get name() { return "Phone call"; }
  canReach() { return true; }
  send() { return { channel: this.name, delivered: false, note: "no Telegram or SMS: call task created" }; }
}
/** Tries Telegram first, then the fallback channels in order (UC13 extended by UC14). */
class NotificationRouter {
  constructor(channels) { this.channels = channels || [new TelegramNotifier(), new SmsNotifier(), new CallFallback()]; }
  send(student, text) { const channel = this.channels.find(c => c.canReach(student)); return channel.send(student, text); }
}

/** Interface for online payment providers. Simulated: no money moves and no real API is called. */
class PaymentGateway {
  get name() { throw new Error("abstract"); }
  confirm(amount, studentCode, simulateFailure) { throw new Error("abstract"); }
}
PaymentGateway.counter = 48210;
class ClickGateway extends PaymentGateway {
  get name() { return "Click"; }
  confirm(amount, studentCode, simulateFailure) {
    return simulateFailure ? { confirmed: false, reference: "", message: "Click did not confirm the transaction (timeout)" }
      : { confirmed: true, reference: `CLK-${PaymentGateway.counter++}`, message: "Confirmed by Click" };
  }
}
class PaymeGateway extends PaymentGateway {
  get name() { return "Payme"; }
  confirm(amount, studentCode, simulateFailure) {
    return simulateFailure ? { confirmed: false, reference: "", message: "Payme rejected the transaction" }
      : { confirmed: true, reference: `PME-${PaymentGateway.counter++}`, message: "Confirmed by Payme" };
  }
}
/** Returns the gateway for an online method, or undefined for cash and desk card payments. */
class GatewayRegistry {
  constructor() { this.gateways = { [PaymentMethod.CLICK]: new ClickGateway(), [PaymentMethod.PAYME]: new PaymeGateway() }; }
  forMethod(method) { return this.gateways[method]; }
}
