# VItalSync — quarantine facility dashboard

A working React prototype for coordinating a 74-bed quarantine and treatment facility. It includes a polished, responsive interface and synthetic patient records so you can try the entire workflow immediately.

## Run it

You need Node.js 20.19+ (or 22.12+) and npm.

```bash
cd /home/shubham/Desktop/Factwise
npm install
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173/**. Keep the terminal running; press Ctrl+C to stop the server.

```bash
npm test           # Workflow rule tests
npm run build     # Compile the production app into dist/
npm run preview   # Preview the production build
```

## The problem, in plain language

The centre needs a shared answer to three questions: who still needs a temperature check, who is ready to see a doctor, and who can leave? Paper journals make that coordination difficult. Delayed discharges also stop new patients from accessing the 74 available beds.

VItalSync turns each patient’s day into an ordered checklist:

```text
Admission → Temperature due → Doctor review due → Daily care complete
                                     ↓
                      72 documented fever-free hours?
                                     ↓ yes
                          Doctor approves discharge
                                     ↓
                          Admin completes discharge
                                     ↓
                           Bed becomes available
```

If a patient is not ready for discharge, the next day starts with another temperature check and doctor review. A recorded death also closes the case, releases its bed, and updates outcome reporting.

## Try it in five minutes

1. The **Overview** starts with 74 patients, 56 temperatures recorded today, 30 doctor reviews, 6 discharge-eligible patients, and 2 approved discharges.
2. Open **Daily rounds → Temperature due**. Click **Record temp**, enter a value such as `36.8`, and save. The patient moves to the doctor review queue.
3. Open **Doctor review**, choose a patient, enter a review note, and save. The temperature must be recorded first.
4. Open **Discharges**. Approve an eligible patient or complete one of the already approved discharges. The admin queue updates immediately.
5. Click **Admit patient**. Choose the newly available bed and enter a name and age. Before a bed is released, admission is blocked.
6. Open a patient’s name to see their temperature chart, history, and doctor notes. **Record death** includes an explicit confirmation and outcome note.
7. Open **Insights & reports** to see recovery and mortality rates. Export the patient summary with **Export CSV**.
8. Use **Facility settings → Reset demo** to restore the starting data and start a care session on the current date.

## What is included

| Screen | Purpose |
| --- | --- |
| Overview | Occupancy, daily task counts, discharge eligibility, activity, and recovery rate |
| Patients | Search by name, ID, or bed; ward filters; pagination; active and closed cases |
| Daily rounds | Nurse and doctor task queues in the required order |
| Patient record | Temperature chart and history, review notes, case outcome |
| Discharges | Automatic eligibility calculation, doctor approval, admin completion |
| Insights & reports | Recovery/mortality rates, 85%/15% benchmarks, mortality alert, CSV export |
| Getting started | In-app explanation and implementation roadmap |
| Facility settings | Demo fever threshold, capacity, timezone, and reset |

All displayed counts are calculated from the underlying demo records. Actions update queues, occupancy, reporting, and a local activity history. Changes are saved in this browser’s localStorage and survive reloads. The interface adapts to desktop and mobile screens, with keyboard-operable dialogs and form validation.

## Rules and explicit assumptions

- **Capacity:** 74 active patients maximum. Each active patient has one unique bed. Closed records keep their historical bed assignment, but no longer occupy it.
- **Demo care date:** The workspace keeps its saved care date, shown in the header. Changing the computer date or reopening the app tomorrow preserves patient records, completed checks, reviews, and discharge counts. Demo actions use this same care date. Existing saved workspaces infer it from their latest record; resetting the demo starts a new session on the current date.
- **Daily tasks:** One routine temperature and one doctor review per patient per facility calendar day (the saved care date in this demo). A doctor review requires today’s temperature. Additional clinical readings and correcting erroneous records are outside this prototype’s scope.
- **Facility timezone:** Asia/Kolkata (IST), independent of the browser’s system timezone.
- **Fever threshold:** The brief does not define one. This demo assumes **38.0°C**, configurable in settings. The facility must confirm this assumption before real use. A value at or above the threshold counts as fever.
- **Three full days:** At least **72 elapsed hours**, with a documented below-threshold reading on every consecutive facility date through today. Three readings across only 48 hours do not qualify. Missing dates, a fever reading, and missing today’s reading block eligibility. This is a conservative interpretation of the brief, not proof that intermittent measurements establish continuous absence of fever.
- **Discharge:** Eligibility is calculated automatically; discharge still requires today’s doctor review, explicit doctor approval, and admin completion. Changing the threshold clears outstanding approvals. Recording a new daily temperature also clears a previous approval.
- **Clinical treatment:** The app stores review notes; it does not suggest diagnoses, medication, or treatment.
- **Recovery:** `recovered / (recovered + deceased) × 100`.
- **Mortality:** `deceased / (recovered + deceased) × 100`. A rate above 15% triggers an alert. Current inpatients are excluded from both denominators. With no completed cases, rates are unavailable.
- **Demo cohort:** 116 recovered + 14 deceased = 130 completed cases, giving an initial recovery rate of approximately **89.2%** and mortality of **10.8%**. Historical demo cases contain outcome metadata, not fabricated temperature and review logs.

## How the app works

**React** builds the screens from reusable components. **Vite** runs the development server and produces the deployable app. **CSS** handles layout and styling. **Lucide** supplies the icons. Temperature charts are accessible SVGs.

The frontend calls the rules in `src/domain.js` when someone saves an action. Those rules check whether the action is allowed, update a copy of the data, and add an activity record. React then redraws the affected screens. The updated dataset is saved to localStorage.

```text
src/main.jsx          React entry point
src/App.jsx           Screens, forms, dialogs, export, and browser persistence
src/styles.css        Responsive layout and visual design
src/domain.js         Patient state, workflow rules, calculations, and demo data
src/domain.test.js    Tests for important workflow and reporting rules
vite.config.js       Vite + React configuration
public/favicon.svg   VItalSync app icon
```

The main record is a patient with an ID, demographics, bed, admission date, outcome, temperature readings, doctor reviews, discharge approval, and case-closure date. A separate activity list records actions. Settings currently contain the fever threshold.

## Path to a shared facility product

This is a complete **frontend prototype**, not a multi-user clinical system. All roles are demonstrated in one interface, and staff names are demo labels. There is no backend, login, server-enforced authorization, shared database, or clinical audit trail. Browser storage can be cleared, changed, or overwritten by another tab. Use synthetic data here.

Build the real MVP in this order:

1. **Confirm facility policy.** Agree on the fever threshold, the exact 3-day interpretation, timezone, missed-reading handling, corrections, and staff responsibilities.
2. **Add a backend and PostgreSQL database.** Use tables for staff, patients, admissions, beds, readings, reviews, approvals, outcomes, and audit events. Keep the UI and move validation into a trusted API.
3. **Add staff authentication and permissions.** Nurses record measurements; doctors review and approve; administrators admit and discharge; authorized clinical staff record deaths. Check permissions on the server for every write.
4. **Handle concurrent work.** Use transactions, unique constraints for daily routine records and active bed assignments, and version checks. Two staff members must not claim the same task or assign the same bed at once. Refresh other users’ queues after updates.
5. **Add an auditable correction workflow.** Preserve original records, who changed them, when, and why. Validate timestamps and identity on the server. Add retry/idempotency behavior for interrupted requests.
6. **Test and operate the system.** Validate workflows with facility staff. Test permissions, day boundaries, concurrent users, data recovery, and backups. Configure appropriate access controls, secure hosting, encrypted connections, monitoring, retention, and recovery procedures before handling real patient information.

A small API can start with:

| Endpoint | Responsibility |
| --- | --- |
| `GET /patients` | Read authorized patient records and filtered work queues |
| `POST /admissions` | Admit into an available bed atomically |
| `POST /patients/:id/temperatures` | Record a nurse’s daily reading |
| `POST /patients/:id/reviews` | Save a doctor review after the reading |
| `POST /patients/:id/discharge-approval` | Verify eligibility and approve |
| `POST /patients/:id/discharge` | Close the admission and release the bed |
| `POST /patients/:id/death` | Record a death with authorized confirmation |
| `GET /reports/outcomes` | Compute outcome rates from completed cases |

Keep reminders, shift handovers, bed maps, advanced charts, external integrations, and richer clinical records for later. The initial priority is reliable daily checks, coordinated discharge, and accurate outcome counts.

## Verification

The domain tests cover timezone boundaries, seed consistency, exact 72-hour eligibility, missing readings, fever recurrence, ordered handoff, duplicate prevention, required notes, discharge approval, capacity, occupied beds, outcomes, zero denominators, and invalid temperatures. The browser workflow was also exercised in Chromium at desktop and mobile sizes. Production builds are generated with `npm run build`.

The font stylesheet uses Google Fonts with local sans-serif fallbacks; the application still works if fonts cannot load.
