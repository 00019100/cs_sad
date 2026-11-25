# IELTS ZONE Student Enrolment System: high-fidelity prototype

Coursework prototype for Systems Analysis and Design (6BUIS026C), Coursework 2.
It is a student project, not an official IELTS ZONE system. All data is sample data and nothing is sent anywhere.

The prototype was built with an AI agent (Claude), which the coursework brief permits for the high-fidelity prototype.

## Run it

Open `index.html` in a browser, or deploy the folder to any static host. There is nothing to install or build.

Sign in with a demo account (password `demo`):

| Username | Role |
|---|---|
| `admin` | Administrator |
| `cashier` | Cashier |
| `coordinator` | Coordinator |
| `manager` | Branch Manager |

Reloading the page resets the sample data.

## Structure

The files follow the packages of the architecture diagram in the report.

| File | Package | Contents |
|---|---|---|
| `js/1-domain.js` | domain | Business classes and their rules: Person, Student, StaffMember and the four roles, Branch, Course, Group, TimeSlot, PlacementTest, SpeakingCheck, MockSession, Payable, Enrolment, MockBooking, Payment, Receipt, Refund, FollowUpTask, ContactLog, ActivityLogEntry |
| `js/2-integration.js` | integration | NotificationChannel and PaymentGateway with their implementations (simulated) |
| `js/3-persistence.js` | persistence | Repository and Store (in memory) |
| `js/4-services.js` | services | One class per group of use cases: enrolment, placement, groups, payments, follow-ups, reports, audit |
| `js/5-seed.js` | (sample data) | Invented students, groups, payments and tasks |
| `js/6-ui.js` | ui | Screens, navigation and form handling |
| `css/styles.css` | ui | Visual design |

## What is simulated

Click, Payme, Telegram and SMS are simulated. Fees, the grace period, level thresholds and five of the six branch names are assumptions.
