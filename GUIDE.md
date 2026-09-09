# Placify: Roles & Permissions Documentation

Welcome to Placify. This document provides a comprehensive guide on how roles and permissions are structured within the application to ensure data security, workflow integrity, and the principle of least privilege.

---

## 1. User Roles Overview

The CRM uses a Role-Based Access Control (RBAC) system. Each user is assigned a specific role that determines what they can see and do.

### Core Management Roles
*   **Administrator (`administrator`, `jpc_sysadmin`)**: Full system access. Can manage users, view all candidate data, monitor all dashboards, override any pipeline stage, and manage 15-day Free Trials.
*   **Manager (`jpc_manager`, `manager`)**: High-level operational access. Focused on team performance, pipeline monitoring, and authorized to enable, disable, and manage candidate 15-day Free Trials.
*   **System Admin (`jpc_sysadmin`)**: Technical oversight role focused on system configurations, flags, email creation, and 2-step verification.

### Operational Roles
*   **Lead Generation (`jpc_lead_gen`)**: Responsible for adding new leads to the system. They can only see the leads they have generated.
*   **Sales (`jpc_sales`)**: Handles lead conversion, candidate packages, and is authorized to enable, disable, and manage candidate 15-day Free Trials.
*   **Customer Service / Compliance Team Head (`jpc_cs`, `jpc_compliance_person`)**: The compliance and onboarding hub. Handles QC calls, agreements, payment tracking, recruiter assignments, stage movement, and is authorized to enable, disable, and manage candidate 15-day Free Trials.
*   **Recruiter (`jpc_recruiter`)**: Manages day-to-day job applications for assigned candidates. Tracks daily targets and submits resume update/RTR requests.
*   **Resume Team (`jpc_resume`)**: Specialized role for modifying resumes, fulfilling RTR requests, and handling resume understanding analysis.
*   **Marketing Team (`jpc_marketing`)**: Handles LinkedIn optimization, approves resume change requests (as Team Leaders), and manages recruiter clusters.
*   **Marketing Support (`jpc_marketing_support`)**: Assists the marketing team in daily operations.
*   **Proxy Team (`jpc_proxy`)**: Provides interview support, manages scheduling availability, and submits structured technical evaluations.

### Candidate Role
*   **Candidate (`candidate`)**: The individual being placed. They have access to their own "Candidate Portal" to view their progress, payments, and interview schedule.

---

## 2. Permissions Matrix

| Feature / Page | Admin/Manager | CS | Recruiter | Lead Gen | Sales | Marketing | Resume | Proxy |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dashboard (All Stats)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dashboard (Personal Stats)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Add Candidate** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **View All Candidates** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Assigned Candidates** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Edit Package/Payments** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **15-Day Free Trial (Manage)** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **QC Checklist** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **App Tracker (Write)** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **App Tracker (Delete)** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **XLSX Reporting** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Resume Log Book** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **RTR Log Book** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Resume Prep Log** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Domain Resume Repository** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Interview Support (Create)**| ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Interview Support (Manage)**| ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Move to Stage (Full access)**| ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Technical Feedback**  | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅* |
| **Delete Interview** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Target Reduction (Approve)** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Feature Alerts (Create)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Team Management** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Platform-Wide Features

### 3.1 Advanced Searchable Dropdowns
All major selection inputs (Candidates, Teams, Leaders, Statuses) use an advanced searchable interface. This prevents UI lag in large databases and allows users to quickly find specific names or roles.

### 3.2 Candidate List Performance (Load More)
To ensure high performance with thousands of records, the Candidate list uses **Virtualized Rendering** (60fps scrolling) and a **Load More** pagination model. By default, 100 candidates are loaded, and users can load 100 more at a time using the button at the bottom of the table.

### 3.3 Duplicate Prevention (App Tracker)
The system automatically hashes job links to prevent recruiters from submitting the same job twice for a candidate. This preserves the integrity of the application pipeline.

### 3.4 Bulk Link Import
Recruiters can import multiple job links simultaneously. The system validates each URL and checks for duplicates against the candidate's history before saving.

### 3.5 Target Management & Auto-Reporting
*   **Daily Targets**: Recruiters have a baseline target (e.g., 40 apps).
*   **Target Reduction**: Recruiters can request a "Target Reduction" if they have valid reasons (e.g., specific technology stack has low volume). This can be approved by CS, Admin, or Marketing Team Leaders.
*   **Crystalline Alerts**: At 5:00 PM EST daily, the system evaluates targets. Sub-par performance without an approved reduction triggers a "Crystalline Twinkle" alert to management.

### 3.6 Resume Lifecycle
1.  **Request**: Submitted by recruiter in Resume Log Book.
2.  **Marketing Approval**: Filtered by Team Leaders (Marketing) to ensure branding standards.
3.  **CS Forwarding**: Reviewed by CS for candidate payment/agreement compliance.
4.  **Team Fulfillment**: Resume team uploads final version and marks as completed. When completed, the candidate's master record is automatically updated.

### 3.7 Interview Support System (Deep Dive)
The Interview Support System is a highly secure, sophisticated module designed to manage the entire interview lifecycle from request to final decision.

#### 3.7.1 Request Lifecycle & Strict Validation
1.  **Creation**: A Recruiter creates an "Interview Support Request" for a candidate. They must specify the Company, Role, and can attach a **Job Description (JD)** and **Application Link**.
2.  **Proxy Safeguard & Link Generation**:
    *   **Mandatory Assignment**: Before generating a booking link for any **Proxy Facilitated (Default)** round, a proxy assignment is strictly required. The user interface enforces this validation, blocking link generation and returning a clear notification: *"Please assign a Proxy Team member before generating a booking link."* if no proxy is selected.
    *   **Workflow Modes**:
        *   **Proxy Facilitated**: A Proxy is assigned to the round. The Candidate chooses from the assigned proxy's unique availability only, completely preventing proxy overlap.
        *   **Self Attended (Direct Mode)**: Used when a proxy is not required. CS and Admin overrides can directly "Set Schedule" once the candidate/client confirms the time, bypassing the availability/booking link flow.
3.  **Unique Slots & Double Booking Mitigation**:
    *   **Timezone Enforcement**: The candidate scheduler renders slots strictly within the permitted working range (**9:30 AM to 6:30 PM EST**) in **30-minute intervals**.
    *   **De-duplication Engine**: Candidate slot display lists are programmatically de-duplicated by their start times to ensure completely unique options are presented.
    *   **Race Conditions & Double-Booking Guard**: Right before a booking is saved, a real-time database query fetches a fresh status copy of the selected slot from Firestore. If it was already booked by another candidate in a microsecond race, the booking is stopped, the slot is filtered out of the candidate’s view immediately, and they are prompted with: *"This time slot has already been booked by another candidate. Please select another time."*
    *   **Proxy Reassignment Validation**: When reassigning an interview to a different proxy, the system strictly validates the new proxy's availability. If the selected proxy has a scheduling conflict (existing interview, manual block, or 15m buffer), the reassignment is blocked with a clear warning.
4.  **Full Interactive Workspace ("View Full Details")**:
    *   All cards on the dashboard have a comprehensive **View Full Details** drawer/modal.
    *   This provides a continuous roadmap of all round timelines, candidate dossiers, recruiter owners, and CS contacts.
    *   **Least Privilege/Read-Only Flow**: For users without edit permissions (Recruiters, Proxies), the workspace operates completely in **read-only mode**, safeguarding core interview records from unauthorized changes. For CS, Admins, and Tech Sysadmins, the modal becomes fully interactive, allowing in-drawer information updates.
5.  **Preparation Mode**: Proxies have access to the **Proxy Dashboard** where they can see upcoming interviews, read JD details, view candidate resumes, and access the "Proxy Facilitated" meeting link.
6.  **Real-Time Monitoring**: The **Interview Dashboard** provides management with a broad view of all active interviews. "Live" interviews (those occurring right now) are highlighted in red with Pulse animations.
7.  **Feedback & Decisioning**: After a round, the Proxy submits detailed technical feedback. 
    *   **Status Transitions**: When feedback is saved successfully, the interview round and request status automatically transit from "Pending" to "Completed"/"Feedback Added". The interview is immediately filtered out of raw upcoming/pending views and shifted into the "Completed" tab across the dashboards.
    *   **Feedback Visibility Rules**:
        *   **Admin / Manager**: Full visibility across the system for performance monitoring and compliance.
        *   **Customer Service (`jpc_cs`)**: Access to view feedback to make decisions, execute support updates, and keep onboarding streamlined.
        *   **Recruiters**: Accessible to follow up with candidate evaluations and request next steps.
        *   **System Admin (`jpc_sysadmin`)**: Full visibility for complete system and operational oversight.
        *   **Proxy (`jpc_proxy`)**: Restricted access — they can *only* view technical feedback for the specific interview rounds they were assigned to support.

#### 3.7.2 Key Interaction Tools & Calendar Overhauls
*   **Proxy Central Calendar (Manual Blockings & Series)**:
    *   **Work Hours Locking**: Displays and operates strictly within the allowed range of **9:30 AM to 6:30 PM EST** in 30-minute intervals. Invalid hours outside of this range are completely hidden.
    *   **Manual Blocks & Buffer Breaks**: Proxy members can click the "+" button in any day column to block off personal time as `'unavailable'`, `'break'`, or `'leave'` using an advanced configuration panel.
    *   **Recurring Series**: Proxies can choose to schedule recurring slots (e.g., Daily Weekday Series for the next 5 weekdays, or Weekly Series for the next 4 weeks on that weekday).
    *   **Firestore Collision Check**: When generating default availability or a recurring manual series, a Firestore check parses existing records first. If a slot already exists for that proxy at that date-time, the system overrides/merges its status rather than creating duplicates, enforcing 100% database health.
*   **WhatsApp Connect**: Automated templates for sharing booking links or following up on schedules via WhatsApp.
*   **Status Indicators**: 
    *   `live`: Interview happening now.
    *   `confirmed`: Slot booked by candidate.
    *   `proxy_assigned`: Waiting for candidate to book.
    *   `next_round`: Previous round cleared, waiting for new round details.

#### 3.7.3 Step-by-Step Candidate Interview Process Flow
Placify organizes and automates every phase of the client interview workflow to ensure zero administrative delays, full proxy alignment, and absolute scheduling accuracy. Below is the step-by-step operational process:

1.  **Request Initiation (Recruiter)**:
    *   When an employer or client requests an interview with a candidate, the assigned Recruiter initiates an **Interview Support Request** from the primary App Tracker or Candidate Sheet.
    *   The Recruiter enters the target organization (Company Name), job title (Role), application link, and uploads the **Job Description (JD)**.
    *   Crucially, the Recruiter creates the specific **Interview Round** (e.g., *Round 1: Screening*, *Round 2: Technical/Coding*, *Round 3: System Design*) and selects the mode of attendance (*Proxy Facilitated* or *Self Attended*).

2.  **Resource Assignment (Recruiter / Customer Service / Team Lead)**:
    *   If the round is set as **Proxy Facilitated (Default)**, the platform enforces blockings that strictly require a proxy assignment.
    *   An available team member from the **Proxy Team** (`jpc_proxy`) with matching domain skills is assigned to the specific round.
    *   Once saved, the system compiles a personalized, safe, secure **Candidate Booking Link** tied specifically to that Proxy's unique availability calendar.

3.  **Candidate Self-Scheduling (Candidate/Recruiter WhatsApp connection)**:
    *   The recruiter uses the one-click **Copy Link** or the integrated **WhatsApp Connect** feature to share the scheduling link with the Candidate.
    *   The Candidate opens the link, which displays open 30-minute slots strictly matching the assigned Proxy's current availability calendar (localized within 9:30 AM to 6:30 PM EST).
    *   The candidate selects their preferred slot and clicks "Confirm Booking".
    *   **Safeguard Checks**: At the exact microsecond of selection, a live Firestore query triggers to verify the slot is still free. If cleared, the slot transits to `'booked'`, and the round status shifts to `'confirmed'`.

4.  **Interview Preparation (Proxy)**:
    *   Upon confirmation, the booking immediately mirrors on the **Proxy Dashboard**.
    *   The assigned Proxy reviews the candidate’s file: their master resume, previous feedback history, target company, role, and the JD document.
    *   The Proxy ensures meeting requirements and coordinates preparation notes with the recruiter team before the call.

5.  **Live Round Execution (Candidate/Proxy)**:
    *   During the selected 30-minute EST slot, the interview appears highlight-coded in red with a live heartbeat pulse animation on both the main dashboard and the Proxy console.
    *   The Proxy clicks the live link to join the meeting bridge (Google Meet, Zoom, MS Teams, etc.) and attends the session under the agreed proxy model.

6.  **Structured Post-Interview Feedback Loop (Proxy Decisioning)**:
    *   Immediately after the call, the Proxy opens the round and clicks "Submit Feedback".
    *   The Proxy fills a highly detailed technical evaluation form assessing: **Coding Quality**, **Architectural/Framework Knowledge**, **Project Execution**, **Problem Solving**, and **Communication Skills**, along with explicit notes on exact questions asked and answers provided.
    *   The Proxy enters the overall result status: **Cleared (Passed)**, **Rejected**, **Absent**, or **Reschedule Requested**.
    *   When saved, the system automatically migrates the round from "Pending" to **Completed**, moves the candidate's core stage to `'interviewing'` or updates progress, issues high-priority notifications to the recruiter/CS, and securely stores the evaluation logs.

---

### 3.8 Feature Blast Alert System
This is a critical communication tool allowing Administrators to broadcast updates across the entire platform.

*   **Triggering an Alert**: Only users with the `administrator` role see the "New Feature" button on the Feature Alerts page.
*   **Multi-Team Targeting**: Admins can select specific roles (e.g., `jpc_sales`, `jpc_recruiter`) to receive the alert. This ensures that only relevant team members are notified.
*   **Content Support**:
    *   **Image Previews**: Visual walkthroughs or feature screenshots.
    *   **PDF Documentation**: Links to deep-dive guides or SOP modifications.
    *   **Sticky Mode**: New alerts appear at the top of the user's main dashboard in a high-visibility blue container until the user clicks "X" to dismiss.
*   **Historical Log**: All past alerts are stored in the "Feature Alerts" section for users to refer back to.

### 3.9 Marketing Load Distribution & Cluster Management
To ensure a balanced workload and efficient candidate mapping across operational teams, the Team management interface provides a dynamic **Marketing Load Distribution & Cluster Management** workbook dashboard module under the Team page tabs.

*   **Dual View Mode Layout**:
    *   **Marketing Cluster Hierarchy**: Programmatically clusters and displays recruiters under their designated Marketing Team Leads (`jpc_marketing`). This view tracks direct candidate assignments of the group as well as overall cluster bounds.
    *   **Recruiter Workload Leaderboard**: A dense spreadsheet ranking of all operational recruiters globally by active candidate profile workload, offering full search capability and real-time status filtering (Active vs. On Leave).
*   **Workload Health Metrics**: Based on the active count of dynamic profile assignments, the module evaluates recruiter workloads into distinct color-coded performance buckets with associated progress meters:
    *   **Light Load** (0 to 2 occupied profiles): Blue badge, indicating recruiter bandwidth is under-utilized.
    *   **Optimal Load** (3 to 8 occupied profiles): Green badge, representing comfortable operating capacity.
    *   **Heavy Load** (9 to 14 occupied profiles): Amber badge, marking near-capacity limits.
    *   **Overloaded** (15+ occupied profiles): High-visibility blinking red badge, alerting managers of critical bottlenecks.
*   **Independent Mappings**: A separate module automatically lists "Independent Recruiters" who function autonomously or do not have a designated Team Leader, preventing unassigned resources from being overlooked.
*   **Profile Reassignment Trigger**: Administrators and Managers can click the inline **Reassign** action from any profile visualization to trigger an intuitive pop-up wizard to safely shift candidates or rebalance loads in a single transaction.
*   **Proactive Action Warnings**: If unmapped active profiles are detected in the Firestore database, the dashboard alerts administrators with an intuitive warning bar and provides a direct shortcut link to target, status-filter, and distribute those pending candidates.

### 3.10 15-Day Free Trial Management & Platform-Wide Badging
Placify includes a dedicated 15-Day Free Trial workflow allowing prospective candidates to evaluate placement and interview support services.

*   **Role-Based Access Control (Strict RBAC)**:
    Only four operational role groups possess authority to enable, disable, and manage candidate Free Trials:
    *   **Administrator & System Admin** (`administrator`, `jpc_sysadmin`)
    *   **Manager** (`jpc_manager`, `manager`)
    *   **Sales** (`jpc_sales`)
    *   **Customer Service / Compliance Team Head** (`jpc_cs`, `jpc_compliance_person`)
    *   *Read-Only Restriction*: All other team roles (Recruiters, Lead Gen, Resume, Marketing, Proxy) view candidate Free Trial statuses in read-only mode without edit or toggle capabilities.
*   **Candidate Profile Control Panel (`CandidateDetail`)**:
    *   **One-Click Activation**: Enabling sets `is_free_trial: true`, anchors the start date to the current date, and automatically projects an exact 15-day expiration window (`free_trial_start_date` and `free_trial_end_date`).
    *   **Live Countdown Engine**: Automatically calculates remaining trial days dynamically (e.g., `14 Days Left`, `Expired Today`) with visual countdown indicators.
    *   **Custom Date Window Overrides**: Authorized roles can adjust the Start Date and End Date boundaries whenever extensions or custom arrangements are approved.
    *   **Early Termination Guard**: Authorized staff can end active trials early with confirmation prompt.
    *   **Full Activity Audit Trail**: Every status change (`Enabled 15-day Free Trial`, `Disabled Free Trial`, `Updated Free Trial Dates`) is recorded with user attribution in `jpc_activity_logs`.
*   **Omnipresent "Free Trial" Badging**:
    Active Free Trial candidates are visually highlighted everywhere their profile appears across the CRM:
    *   **Candidates Directory**: Distinct badge adjacent to candidate name in table rows.
    *   **Pipeline (Kanban)**: High-visibility badge on pipeline cards across all recruitment stages.
    *   **Candidate Portal**: Personalized welcome banner indicating active trial status to the candidate.
    *   **Candidate Sheet Slideover**: Header badge in quick-access candidate dossier.
    *   **Interview Support System**: Rendered on interview request cards and inside the Interview Details dossier modal.
    *   **Searchable Candidate Select**: Displayed directly in both the selector trigger and dropdown option items.
    *   **Application & Target Trackers**: Highlighted across App Tracker, Target Dashboard, and Follow-Ups.
    *   **Operational Log Books**: Displayed on candidate entries in RTR Log Book, Resume Log Book, Resume Prep Log, and Domain Resume Repository.
    *   **Archive & Billing**: Shown in Not Interested, Not Eligible, and Candidate Receipt/Invoice records.
    *   **Automatic Expiration Transition**: When the 15-day window ends, the badge smoothly transitions to a distinct "Trial Expired" indicator.

### 3.11 Specialized Log Books & Repository Architecture
*   **RTR Log Book (`RTRLogBook`)**: Tracks Right-to-Represent requests submitted by recruiters, reviewed by Team Leaders and CS, and fulfilled by the Resume Team with direct document upload and audit logging.
*   **Resume Prep Log (`ResumePrepLog`)**: Manages specialized Resume Understanding analysis and targeted Interview Question preparation requests with dual-mode operational tabs and evaluator feedback workflows.
*   **Domain Resume Repository (`DomainResumeRepository`)**: Centralized file library categorizing resumes across Technology Domains and Target Roles. Offers multi-view modes (Tree Hierarchy, Card Grid, Dense Table) and bulk ZIP archive downloading structured by `Domain → Role → Candidate`.

---

## 5. Technical Specifications

Placify is built on a modern, high-performance full-stack architecture designed for scalability, real-time coordination, and data integrity.

### 5.1 Core Technology Stack
*   **Frontend Framework**: **React 19** using functional components and hooks.
*   **Routing**: **React Router 7** (Data API) for client-side navigation and stateful routing.
*   **Backend Server**: **Express 5** running on **Node.js**, bundled with **esbuild** for production.
*   **Primary Database**: **Firebase Firestore** (NoSQL) for real-time data synchronization and flexible schema management.
*   **Authentication**: **Firebase Authentication** providing secure session management and identity verification.
*   **Styling Engine**: **Tailwind CSS 4** for high-performance, utility-first UI construction.

### 5.2 Key Integrations & Libraries
*   **Artificial Intelligence**: Integrated with **Google Gemini API** (`@google/genai`) for automated recruiter compliance auditing and technical evaluation analysis.
*   **Calendar Services**: **Google Calendar API** (`googleapis`) with a custom OAuth2 implementation, persistent refresh token management, and background synchronization.
*   **Communications**: **NodeMailer** for transactional emails with support for dynamic, user-configured SMTP providers.
*   **Visualization**: **Recharts** for real-time performance analytics and workload distribution charts.
*   **Data Processing**: **XLSX** and **PapaParse** for high-volume data imports/exports; **Mammoth** and **PDF.js** for document parsing.
*   **Animations**: **Motion** (fka Framer Motion) for fluid, responsive UI transitions and interactive state feedback.

### 5.3 Automated Services & Infrastructure
*   **Cron Schedules**:
    *   **Daily Target Audit**: Runs at **6:15 PM EST** to evaluate recruiter compliance and broadcast "Crystalline" alerts.
    *   **Monthly Performance Review**: Automatically generates and emails an Excel-based KPI report to management on the last day of each month.
*   **Timezone-Safe Engine**: A custom implementation of `parseLocalTimeToDate` and `getCalendarDateInfo` ensures all scheduling logic is strictly anchored to **EST (America/New_York)**, preventing timezone drift or browser-specific date bugs.
*   **OAuth2 Backend**: A dedicated server-side flow handles Google authentication, secure token storage in Firestore, and automatic access token renewal to maintain persistent calendar connections for proxy members.

---

## 6. Operational Best Practices
1.  **Timezone Standardization**: All interview slots and follow-up deadlines are scheduled and booked in the core timezone (defaulting to **EST / America/New_York**), but are fully supported via dynamic timezone conversions based on the request configuration. All days, weekdays, and times are parsed and formatted using a specialized timezone-safe parser (`parseLocalTimeToDate` and `getCalendarDateInfo`) targeting UTC noon to completely bypass local browser offset bugs, DST transitions, or month boundaries.
2.  **Weekday/Day-of-Week Robustness**: Dynamic calendar grids and slots always combine the raw local date parts with timezone-independent locale formatters, preventing blank or mismatched weekday labels across different operating systems, timezones, and responsive layouts.
3.  **Resume integrity**: When a resume is updated via the **Resume Log Book**, the system automatically updates the candidate's master record. Always use the link in the sidebar or candidate sheet to ensure you are seeing the latest version.
4.  **Interview Hygiene**: If an interview is canceled, use the "Reschedule" trigger. Deleting a request removes historical feedback which is critical for future placements.
5.  **Feedback Quality**: Feedback should include specific technical questions asked and the candidate's answers. This data is invaluable for the next round's proxy.

---

*Last Updated: September 10, 2026*
