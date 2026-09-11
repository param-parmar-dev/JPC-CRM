# Placify: Roles & Permissions Documentation

Welcome to Placify. This document provides a comprehensive guide on how roles, permissions, workflows, and automated system engines are structured within the application to ensure data security, operational integrity, and the principle of least privilege.

---

## 1. User Roles Overview

The CRM uses a Role-Based Access Control (RBAC) system. Each user is assigned a specific role that determines what they can see and do.

### Core Management Roles
*   **Administrator (`administrator`, `jpc_sysadmin`)**: Full system access. Can manage users, view all candidate data, monitor all dashboards, override any pipeline stage, manage 15-day Free Trials, toggle sales availability globally, configure and reorder round-robin lead distribution, override sales assignment, and approve/reject pending TL requests in Resume and RTR logs.
*   **Manager (`jpc_manager`, `manager`)**: High-level operational access. Focused on team performance, pipeline monitoring, authorized to enable, disable, and manage candidate 15-day Free Trials, toggle sales availability globally, manage round-robin lead distribution, override sales assignments, and act as TL to approve/reject pending TL requests in Resume and RTR logs.
*   **System Admin (`jpc_sysadmin`)**: Technical oversight role focused on system configurations, flags, email creation, 2-step verification, OAuth integrations, serverless endpoints, and possesses administrative management privileges.

### Operational Roles
*   **Lead Generation (`jpc_lead_gen`)**: Responsible for adding new leads into the system. They can only see the leads they have generated. **Strict RBAC Rule**: Disallowed from selecting, editing, or overriding `assigned_sales` (the salesperson is assigned automatically via the Round-Robin engine or by Management).
*   **Sales (`jpc_sales`)**: Handles lead conversion and candidate packages, and is authorized to enable, disable, and manage candidate 15-day Free Trials. Sales reps control their shift availability using the personal **Active / Deactive** toggle. During working hours, active sales reps receive incoming leads sequentially via the automated Round-Robin engine.
*   **Customer Service Head (`jpc_cs`)**: The compliance and onboarding hub. Handles QC calls, agreements, payment tracking, recruiter assignments, stage movement, and is authorized to manage 15-day Free Trials. Possesses authority to manually assign/reassign sales persons, toggle sales availability, and act as Team Leader (`canActAsTLForRequest`) to advance or reject `pending_tl` requests in Resume and RTR Log Books.
*   **Compliance Person (`jpc_compliance_person`)**: Works alongside the Customer Service Head to handle QC checklists, agreement verification, payment tracking, and candidate dossier compliance. Authorized to manage 15-day Free Trials, override sales assignments, toggle sales availability, and act as Team Leader on pending log book requests.
*   **Recruiter (`jpc_recruiter`)**: Manages day-to-day job applications for assigned candidates. Tracks daily targets, creates interview support requests, and submits resume update and RTR requests.
*   **Resume Team (`jpc_resume`)**: Specialized role for modifying resumes, fulfilling RTR requests, and handling resume understanding analysis.
*   **Marketing Team (`jpc_marketing`)**: Handles LinkedIn optimization, approves resume change requests (as Team Leaders), and manages recruiter clusters and workload distribution.
*   **Marketing Support (`jpc_marketing_support`)**: Assists the marketing team in daily operations and candidate profile maintenance.
*   **Proxy Team (`jpc_proxy`)**: Provides live interview support, manages scheduling availability, connects personal Google Calendars for auto-sync, and submits structured technical evaluations.

### Candidate Role
*   **Candidate (`candidate`, `jpc_candidate`)**: The individual being placed. They have access to their own "Candidate Portal" to view their progress, payments, and interview schedule.

---

## 2. Permissions Matrix

| Feature / Page | Admin/Manager | CS Head / Compliance | Recruiter | Lead Gen | Sales | Marketing | Resume | Proxy |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dashboard (All Stats)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dashboard (Personal Stats)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Add Candidate / Lead** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **View All Candidates** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Assigned Candidates** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Edit Package / Payments** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **15-Day Free Trial (Manage)** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **QC Checklist** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Sales Availability (Self Toggle)** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Sales Availability (Global / Team Toggle)** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Sales Person Assignment (Manual / Override)** | ✅ | ✅ | ❌ | ❌* | ❌ | ❌ | ❌ | ❌ |
| **Round-Robin Lead Engine (Config & Order)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **App Tracker (Write)** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **App Tracker (Delete)** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **XLSX Reporting** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Resume Log Book (View / Request)** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **RTR Log Book (View / Request)** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Resume Prep Log** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Domain Resume Repository** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Approve Pending TL Requests (Resume & RTR)** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (TL) | ❌ | ❌ |
| **Interview Support (Create)** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Interview Support (Manage / Assign)** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Move to Stage (Full access)** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Technical Feedback** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅* |
| **Delete Interview** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Target Reduction (Approve)** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Feature Alerts (Create)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Team Management & Clusters** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

*\*Notes:*
- *Lead Generation users are strictly forbidden from assigning or altering `assigned_sales`; attempts are blocked at both UI and server API layers.*
- *Proxies can only view technical feedback for interview rounds to which they were explicitly assigned.*

---

## 3. Platform-Wide Features

### 3.1 Advanced Searchable Dropdowns
All major selection inputs (Candidates, Teams, Leaders, Statuses) use an advanced searchable interface. This prevents UI lag in large databases and allows users to quickly filter and find specific names or roles with debounced inputs.

### 3.2 Candidate List Performance (Virtualized Rendering & Load More)
To ensure high performance with thousands of records, the Candidate list uses **Virtualized Rendering** (`react-window` at 60fps scrolling) and a **Load More** pagination model. By default, 100 candidates are loaded, and users can load 100 more at a time using the button at the bottom of the table.

### 3.3 Duplicate Prevention (App Tracker)
The system automatically hashes job links to prevent recruiters from submitting the same job twice for a candidate. This preserves the integrity of the application pipeline.

### 3.4 Bulk Link Import
Recruiters can import multiple job links simultaneously. The system validates each URL and checks for duplicates against the candidate's history before saving.

### 3.5 Target Management & Auto-Reporting
*   **Daily Targets**: Recruiters have a baseline target (e.g., 40 apps).
*   **Target Reduction**: Recruiters can request a "Target Reduction" if they have valid reasons (e.g., niche technology stack with low job volume). This can be approved by CS Head, Admin, or Marketing Team Leaders.
*   **Crystalline Alerts**: At 6:15 PM EST daily, the system evaluates targets. Sub-par performance without an approved reduction triggers a "Crystalline Twinkle" alert to management.

### 3.6 Resume Lifecycle & Multi-Level TL Approvals
1.  **Request**: Submitted by recruiter in Resume Log Book or RTR Log Book (status: `pending_tl`).
2.  **Multi-Level TL Approval**:
    *   **Marketing Team Leaders (`jpc_marketing`)**: Primary approvers for team branding and quality.
    *   **CS Head & Management Override (`canActAsTLForRequest`)**: Customer Service Head (`jpc_cs`, `jpc_compliance_person`, Faiz / Care) and Management (`administrator`, `jpc_sysadmin`, `jpc_manager`) can also approve (`pending_cs`) or reject (`rejected_tl`) requests. This ensures operational velocity and prevents bottlenecks when a Marketing TL is away or on leave.
3.  **CS Verification**: Reviewed by CS for candidate payment, agreement compliance, and package tier (status: `pending_resume`).
4.  **Team Fulfillment**: Resume team uploads final version and marks as completed. When completed, the candidate's master record is automatically updated, and completion metadata (user ID, user name, timestamp) is logged.

### 3.7 Interview Support System (Deep Dive)
The Interview Support System manages the entire interview lifecycle from initial request to final verdict.

#### 3.7.1 Request Lifecycle & Strict Validation
1.  **Creation**: A Recruiter creates an "Interview Support Request" for a candidate, specifying Company, Role, and attaching a **Job Description (JD)** and **Application Link**.
2.  **Proxy Safeguard & Link Generation**:
    *   **Mandatory Assignment**: Before generating a booking link for any **Proxy Facilitated (Default)** round, a proxy assignment is strictly required. The interface blocks link generation if no proxy is selected with the message: *"Please assign a Proxy Team member before generating a booking link."*
    *   **Workflow Modes**:
        *   **Proxy Facilitated**: A Proxy is assigned to the round. The Candidate selects from the assigned proxy's availability only, completely preventing proxy overlap.
        *   **Self Attended (Direct Mode)**: Used when a proxy is not required. CS and Admin overrides can directly "Set Schedule" once confirmed, bypassing the availability booking flow.
3.  **Unique Slots & Double Booking Mitigation**:
    *   **Timezone Enforcement**: The candidate scheduler renders slots strictly within the permitted working range (**9:30 AM to 6:30 PM EST**) in **30-minute intervals**.
    *   **De-duplication Engine**: Candidate slot display lists are programmatically de-duplicated by their start times to ensure completely unique options are presented.
    *   **Race Conditions & Double-Booking Guard**: Right before a booking is saved, a real-time database query fetches a fresh status copy of the selected slot from Firestore. If already booked by another candidate, the booking is stopped, the slot is filtered out, and the candidate is prompted: *"This time slot has already been booked by another candidate. Please select another time."*
    *   **Proxy Reassignment Validation**: When reassigning an interview to a different proxy, the system uses `findBestProxyForWindow` to strictly validate the new proxy's availability. If the selected proxy has a scheduling conflict (existing interview, manual block, or 15-minute buffer), reassignment is blocked with a clear warning.
4.  **Full Interactive Workspace ("View Full Details")**:
    *   All cards on the dashboard have a comprehensive **View Full Details** drawer/modal.
    *   Provides a continuous roadmap of all round timelines, candidate dossiers, recruiter owners, and CS contacts.
    *   **Least Privilege/Read-Only Flow**: For users without edit permissions (Recruiters, Proxies), the workspace operates in **read-only mode**. For CS, Admins, and Tech Sysadmins, the modal is fully interactive for in-drawer updates.
5.  **Preparation Mode**: Proxies have access to the **Proxy Dashboard** to review upcoming interviews, read JD specifications, view master resumes, and access the meeting bridge link.
6.  **Real-Time Monitoring**: The **Interview Dashboard** provides management with a broad view of all active interviews. "Live" interviews (occurring right now) are highlighted in red with pulse animations.
7.  **Feedback & Decisioning**:
    *   After a round, the Proxy submits detailed technical feedback.
    *   When saved, the status automatically transitions from "Pending" to "Completed" / "Feedback Added", moving the card to the "Completed" tab.
    *   **Feedback Visibility Rules**: Admin, Manager, CS, and Recruiters have full visibility for candidate evaluations and next steps. Proxies are restricted to viewing feedback only for the rounds they personally supported.

#### 3.7.2 Key Interaction Tools & Calendar Overhauls
*   **Proxy Central Calendar (Manual Blockings & Series)**:
    *   **Work Hours Locking**: Displays and operates strictly within the allowed range of **9:30 AM to 6:30 PM EST** in 30-minute intervals. Invalid hours outside of this range are completely hidden.
    *   **Manual Blocks & Buffer Breaks**: Proxy members can click the "+" button in any day column to block off personal time as `'unavailable'`, `'break'`, or `'leave'` using an advanced configuration panel.
    *   **Recurring Series**: Proxies can schedule recurring slots (e.g., Daily Weekday Series for the next 5 weekdays, or Weekly Series for the next 4 weeks on that weekday).
    *   **Firestore Collision Check**: When generating default availability or a recurring manual series, a Firestore check parses existing records first. If a slot already exists for that proxy at that date-time, the system overrides/merges its status rather than creating duplicates.
*   **Google Calendar OAuth Integration**: Proxy members can securely connect their Google Calendars with persistent OAuth2 tokens, enabling automated synchronization of confirmed interviews directly to their personal calendars.
*   **WhatsApp Connect**: Automated templates for sharing booking links or following up on schedules via WhatsApp.
*   **Status Indicators**: 
    *   `live`: Interview happening now.
    *   `confirmed`: Slot booked by candidate.
    *   `proxy_assigned`: Waiting for candidate to book.
    *   `next_round`: Previous round cleared, waiting for new round details.

#### 3.7.3 Step-by-Step Candidate Interview Process Flow
1.  **Request Initiation (Recruiter)**: Recruiter initiates an **Interview Support Request** with company, role, JD document, and round details.
2.  **Resource Assignment (Recruiter / CS / TL)**: For *Proxy Facilitated* rounds, an available proxy with matching domain skills is assigned, generating a unique booking link.
3.  **Candidate Self-Scheduling**: Recruiter shares the link via Copy Link or WhatsApp. The candidate selects an available 30-minute EST slot verified in real time.
4.  **Interview Preparation (Proxy)**: Assigned proxy reviews JD, candidate resume, and notes on the Proxy Dashboard.
5.  **Live Round Execution**: Visual red pulse indicator displays during the live slot; proxy joins meeting bridge.
6.  **Structured Post-Interview Feedback Loop**: Proxy submits structured technical evaluation (Coding, Architecture, Execution, Problem Solving, Communication, Questions Asked, and Verdict). The system updates candidate progress and triggers notifications.

### 3.8 Feature Blast Alert System
Enables Administrators to broadcast updates across the entire platform.
*   **Triggering an Alert**: Only users with the `administrator` role see the "New Feature" button.
*   **Multi-Team Targeting**: Admins can select specific roles (e.g., `jpc_sales`, `jpc_recruiter`) to receive the alert.
*   **Content Support**: Supports image previews, PDF documentation links, and sticky top-of-dashboard banners.
*   **Historical Log**: All past alerts remain searchable in the Feature Alerts archive.

### 3.9 Marketing Load Distribution & Cluster Management
Provides dynamic candidate mapping and workload balancing under Team management tabs.
*   **Marketing Cluster Hierarchy**: Programmatically clusters and displays recruiters under their designated Marketing Team Leads (`jpc_marketing`).
*   **Recruiter Workload Leaderboard**: Ranks recruiters globally by active candidate profile workload with active vs. leave filtering.
*   **Workload Health Metrics**:
    *   **Light Load** (0–2 profiles): Blue badge (bandwidth under-utilized).
    *   **Optimal Load** (3–8 profiles): Green badge (comfortable capacity).
    *   **Heavy Load** (9–14 profiles): Amber badge (near-capacity limit).
    *   **Overloaded** (15+ profiles): Blinking red badge (critical bottleneck).
*   **Independent Mappings**: Lists autonomous recruiters without designated TLs to prevent unassigned resources.
*   **Profile Reassignment Wizard**: Management can rebalance candidate assignments across recruiters in a single transaction.

### 3.10 15-Day Free Trial Management & Platform-Wide Badging
Allows prospective candidates to evaluate placement and interview support services.
*   **Strict RBAC Control**: Only four role groups can enable, disable, and manage Free Trials:
    *   Administrator & System Admin (`administrator`, `jpc_sysadmin`)
    *   Manager (`jpc_manager`, `manager`)
    *   Sales (`jpc_sales`)
    *   Customer Service Head & Compliance (`jpc_cs`, `jpc_compliance_person`)
    *   *All other roles view trial data in read-only mode.*
*   **Control Panel (`CandidateDetail`)**: One-click activation anchors 15-day expiration window, dynamic remaining-days countdown (e.g., `14 Days Left`), custom date overrides, early termination guard, and full audit logging in `jpc_activity_logs`.
*   **Omnipresent Badging**: Displays across Candidates Directory, Pipeline Kanban, Candidate Portal banner, Candidate Sheet slideover, Interview Support dossier, Searchable Candidate Select, App Tracker, Target Dashboard, and Log Books. Transitions smoothly to "Trial Expired" upon completion.

### 3.11 Specialized Log Books & Repository Architecture
*   **RTR Log Book (`RTRLogBook`)**: Tracks Right-to-Represent requests submitted by recruiters, reviewed by Team Leaders/CS Head, and fulfilled by the Resume Team with direct document upload and audit logging.
*   **Resume Prep Log (`ResumePrepLog`)**: Manages specialized Resume Understanding analysis and targeted Interview Question preparation requests with dual-mode operational tabs and evaluator feedback workflows.
*   **Domain Resume Repository (`DomainResumeRepository`)**: Centralized file library categorizing resumes across Technology Domains and Target Roles. Offers multi-view modes (Tree Hierarchy, Card Grid, Dense Table) and bulk ZIP archive downloading structured by `Domain → Role → Candidate`.

### 3.12 Sales Availability & Automated Lead Round-Robin Engine
To eliminate manual routing delays, prevent lead hoarding, and maintain fair workload distribution, Placify features an enterprise-grade, concurrency-safe **Sales Person Availability & Round-Robin Assignment Engine**.

```
[ Incoming Lead Created ]
         │
         ▼
[ Within EST Working Hours? (9:30 AM - 6:30 PM EST, Mon-Fri) ]
         │
    Yes  ├──────────────────────────────┐ No
         ▼                              ▼
[ Any Active Sales Reps Available? ]  [ Safely Mark Lead as UNASSIGNED ]
         │                              ▲
    Yes  ├──────────────────────────────┘
         ▼
[ Continuous Round-Robin Pointer ]
  (1st → Sales A, 2nd → Sales B, 3rd → Sales C...)
         │
         ▼
[ Atomic Transaction Commit ]
  - Updates Candidate: assigned_sales
  - Updates Config: last_assigned_user_id, last_assigned_index
  - Logs to Recent Assignments Audit Trail
```

#### 3.12.1 Continuous Sequential Round-Robin Routing
*   **Deterministic Sequence**: Incoming leads rotate sequentially among all eligible sales representatives (e.g., Lead 1 → Salesperson A, Lead 2 → Salesperson B, Lead 3 → Salesperson C, looping continuously back to A).
*   **Strict Eligibility Criteria**: To receive a lead via round-robin, a sales representative must satisfy all of the following:
    1. Role is `jpc_sales`.
    2. Account is not marked as deleted (`deleted_at == null`).
    3. Representative is not on leave (`is_on_leave == false`).
    4. Sales availability status is explicitly set to `'Active'`.
    5. Representative ID is not paused/excluded in the round-robin settings (`excluded_user_ids`).
*   **Atomic Concurrency Safety**: The round-robin sequence pointer is committed inside a Firestore transaction alongside the candidate record update. This ensures zero race conditions or duplicate assignments, even when hundreds of leads arrive simultaneously.

#### 3.12.2 Working Hours Enforcement & Unassigned Safety Shield
*   **Sales Working Hours**: Strictly bounded from **Monday through Friday, 9:30 AM to 6:30 PM Eastern Time (America/New_York)**. Evaluated using timezone-safe minute calculations (570 minutes to 1110 minutes).
*   **Outside-Hours & Holiday Protection**: Any lead arriving outside of working hours or on weekends is safely designated as **Unassigned** (`assigned_sales: null`). No leads are dropped, and off-duty sales reps are never assigned leads after hours.
*   **No Active Rep Protection**: If all sales representatives are deactivated, paused, or on leave during working hours, new incoming leads remain unassigned rather than failing or routing to inactive staff.

#### 3.12.3 Automated Cron Schedules for Sales Availability
*   **Daily 6:30 PM EST Deactivation Cron (`30 18 * * 1-5`)**: Every Monday through Friday at 6:30 PM Eastern Time, the server runs an automated batch update deactivating all active sales representatives (`sales_availability_status: 'Deactive'`).
*   **Daily 9:30 AM EST Morning Cron (`30 9 * * 1-5`)**: Every Monday through Friday at 9:30 AM Eastern Time, the server marks the start of the sales shift and automatically triggers the Unassigned Leads Backlog Engine.

#### 3.12.4 Sales Shift Availability Workflow
*   **Self-Service Availability Toggle**: Sales team members can toggle their availability between **Active** and **Deactive** directly from their dashboard or the Round-Robin Roster.
*   **Management Override Authority**: Administrators, System Admins, Managers, Customer Service Head, and Compliance Persons (`canManageSalesAssignment`) have full authority to toggle the availability of any sales representative at any time.
*   **Instant Backlog Processing on Activation**: Whenever a sales representative transitions from 'Deactive' to 'Active' during working hours, the system immediately fires the backlog engine to distribute pending leads to available reps.

#### 3.12.5 Unassigned Leads Backlog Processing Engine
*   **Chronological FIFO Processing**: The backlog engine queries all unassigned candidates (`assigned_sales == null`) and sorts them chronologically (oldest creation date first).
*   **Unified Rotation Sequence**: Backlog leads are processed through the exact same round-robin transaction engine, advancing the global rotation pointer fairly across all currently active sales reps.
*   **Concurrency Serialization Guard**: In-memory execution locks (`isBacklogRunning` and `rerunBacklogRequested`) prevent concurrent backlog passes from clashing. If multiple triggers fire simultaneously, requests are queued into a sequential follow-up pass.

#### 3.12.6 Strict Role-Based Access Control (Lead Gen Guard)
*   **Lead Gen Disallowed from Sales Assignment**: Users with the `jpc_lead_gen` role are strictly prohibited from setting, modifying, or overriding `assigned_sales`.
*   **Client & Server Layer Enforcement**: The client UI hides sales assignment dropdowns for Lead Gen users. On the server side, `/api/leads` and `PATCH /api/candidates/:id` actively strip incoming sales fields and return a `403 Forbidden` error if a Lead Gen user attempts to alter sales assignment.
*   **Authorized Override Roles**: Only Administrator, System Admin, Manager, CS Head, and Compliance Person possess authority to manually assign or override a lead's assigned sales representative.

#### 3.12.7 Lead Round-Robin Management Dashboard (`LeadRoundRobinDashboard`)
Accessible under the Team management console, this dedicated monitoring and control interface provides:
*   **Automation Control**: One-click "Pause Automation" / "Enable Automation" switch and "Reset Pointer" button.
*   **Next in Line Indicator**: Real-time display showing exactly which sales representative is next in the rotation queue.
*   **Visual Rotation Flow Cards**: Display of all eligible sales reps with their current sequence position, leads assigned today, all-time leads assigned, and "Last Assigned" indicator.
*   **Custom Rotation Ordering**: Administrators and Managers can reorder sales reps using "Move Up" and "Move Down" controls to establish custom assignment priorities.
*   **One-Click Exclusion (`UserX`)**: Ability to pause any representative from rotation without deleting their user account.
*   **Sales Roster Table**: Comprehensive overview of all registered sales reps, their live availability indicator (pulsing green Active vs. gray Deactive), leave status, and quick toggle buttons.
*   **Live Audit Log**: Historical table recording the last 40 automatic round-robin assignments, detailing candidate name, assigned salesperson, and exact timestamp.

### 3.13 Multi-Model AI Fallback & Resume Parsing Architecture
Placify incorporates a robust, resilient artificial intelligence pipeline to automate candidate data intake and compliance auditing.

*   **Document Text Extraction**: Client-side worker engines parse uploaded resumes instantly:
    *   **PDF**: Processed via `pdfjs-dist` worker, extracting text from pages 1 through 5.
    *   **DOCX**: Processed via `mammoth` into clean raw text.
    *   **TXT**: Decoded directly from base64 strings.
*   **Tiered Model Fallback Chain**: To guarantee 99.9% uptime and prevent service interruption from upstream rate limits or model deprecations, the system utilizes a multi-model fallback chain:
    1.  `gemini-3.6-flash` (Primary, fast low-latency extraction)
    2.  `gemini-3.8-flash` (Secondary fallback, enhanced reasoning)
    3.  `gemini-flash-latest` (Tertiary fallback)
*   **Dual-Tier Execution**:
    1.  *Server-Side Processing (`/api/resume/parse`)*: Handles API key security and centralized token budgeting.
    2.  *Client-Side Direct SDK Fallback*: If the server route is unreachable, the client SDK uses Google GenAI with strict JSON schemas.
    3.  *Deterministic Regex Heuristics*: If all AI endpoints or API keys are unavailable, local regex parsers extract names, emails, and phone numbers so recruiters are never blocked.
*   **AI Compliance Auditing**: The Gemini compliance service (`/api/gemini/analyze-compliance`) analyzes recruiter performance against daily KPIs, providing automated recommendations with graceful local analytical fallbacks.

### 3.14 Mobile-First Responsive Design & Adaptive Navigation
Placify is completely mobile-responsive, allowing recruiters, sales reps, proxies, and managers to operate seamlessly on smartphones, tablets, and desktop displays.

*   **Mobile Bottom Navigation (`MobileBottomNav`)**: When viewed on mobile viewports, the desktop sidebar collapses and an ergonomic bottom navigation bar appears, providing instant one-tap access to:
    *   **Dashboard**: High-level personal and team KPIs.
    *   **Candidates**: Mobile candidate cards with quick search and filters.
    *   **App Tracker**: Mobile application logging with quick action sheets.
    *   **Pipeline**: Touch-friendly Kanban and stage selector.
    *   **Interviews**: Live interview alerts and proxy scheduling.
*   **Adaptive Pipeline Kanban**: Allows users on small screens to toggle between an interactive stage selector and focused single-column stage views with swipe actions.
*   **Responsive Modals & Slide-Overs**: All core sheets (Candidate Detail, Add Candidate, Interview Dossier, Track Job) automatically adapt to full-screen mobile drawers with safe-area bottom padding.

### 3.15 Production Google Calendar OAuth & Synchronization
Proxy team members can link their Google accounts for automatic two-way calendar coordination.
*   **OAuth2 Backend**: Dedicated Express server endpoints (`/auth/google`, `/auth/google/callback`) handle OAuth code exchange, persistent refresh token storage in Firestore (`jpc_users`), and automatic access token renewal.
*   **Strict HTTPS Production Enforcement**: In production environments, OAuth redirect URIs strictly enforce the `https://` protocol scheme to satisfy Google Cloud Console OAuth verification requirements and prevent serverless deployment crashes.
*   **Persistent Meeting Bridge**: Automatically inserts Google Meet or video bridge links into generated calendar invites.

### 3.16 Three-Tier Duplicate Lead Prevention Architecture
To guarantee that no duplicate candidate leads are ever created—even under high network latency, rapid multi-clicking, double Enter keypresses, or concurrent frontend and API retries—Placify implements a robust three-tier duplicate prevention and idempotency system:

1.  **Tier 1: Frontend Synchronous Submission Guard (`AddCandidateModal.tsx`)**:
    *   **Synchronous Execution Lock**: Uses an immediate `isSubmittingRef.current = true` mutable ref check executed synchronously in the click handler *before* any asynchronous task or re-render cycle begins, completely closing the React state update batching window.
    *   **Stable Submission Key & ID**: Generates a stable `idempotencyKeyRef` (`ik_<timestamp>_<rand>`) and `candidateIdRef` upon opening the modal. If the network drops or a request is retried, the identical idempotency key and pre-allocated candidate ID are sent, ensuring duplicate requests resolve to the same underlying record.
    *   **Form-Level Enter Guard**: The form `<motion.form onSubmit={handleSubmit}>` intercepts Enter key submissions, while the Submit and Cancel buttons are disabled with a visual loading spinner (`Saving Candidate...`) to provide unambiguous user feedback.
    *   **Atomic Reset**: Only resets the form and generates new submission keys once a successful response is acknowledged by the server.

2.  **Tier 2: Backend Idempotency Engine (`server.ts`, `storage.ts`)**:
    *   **Durable Idempotency Store (`jpc_idempotency_keys`)**: The Express backend and Firestore storage services check incoming `Idempotency-Key` headers or body parameters against the `jpc_idempotency_keys` collection.
    *   **Cached Result Resolution**: If a request with the same idempotency key arrives while processing or after completion, the server safely retrieves the existing candidate record and returns `{ duplicatePrevented: true, alreadyExisted: true, candidateId }` without executing side effects or mutating system state.
    *   **Round-Robin Pointer Conservation**: Because the duplicate request is identified as idempotent, the round-robin pointer is never advanced a second time, preserving strict round-robin fairness for sales representatives.

3.  **Tier 3: Database Deterministic Concurrency Control (`jpc_lead_locks`)**:
    *   **Deterministic Phone Locks**: In Firestore, phone numbers are stripped of non-digits and leading US country codes (`1`) to produce a canonical lock path: `jpc_lead_locks/phone_${cleanPhone}`.
    *   **Transactional Isolation**: Inside Firestore transactions (`transaction.get` / `transaction.set`), attempts to create two leads with colliding canonical phone numbers will atomically conflict. The second transaction reads the lock, confirms an active candidate already exists, and halts creation.
    *   **Soft-Deletion Resiliency**: If a previous candidate with the same phone was soft-deleted (`deleted_at != null`), the lock check recognizes the record as inactive and permits legitimate re-application, atomically transferring or resetting the lock document.

4.  **Unified Atomic Side-Effect Execution**:
    *   Candidate creation, round-robin distribution, activity log creation, QC checklist seeding, and notification dispatches are coupled to the primary transaction.
    *   Downstream side effects are bypassed if `duplicatePrevented` is true, ensuring no candidate receives multiple Welcome logs, duplicated checklist items, or redundant push notifications.

---

## 4. Automated Schedules & Cron Infrastructure

Placify runs four primary automated background jobs anchored strictly to **Eastern Time (America/New_York)**:

| Schedule (EST) | Cron Expression | Service / Purpose | Impacted Roles |
| :--- | :--- | :--- | :--- |
| **9:30 AM (Mon–Fri)** | `30 9 * * 1-5` | **Sales Shift Start & Unassigned Backlog Processing**<br>Begins sales working hours and automatically runs the round-robin engine to assign backlog leads accumulated overnight or over the weekend. | Sales, Lead Gen, Management |
| **6:15 PM (Mon–Fri)** | `15 18 * * 1-5` | **Daily Target Audit ("Crystalline Twinkle")**<br>Evaluates recruiter daily application targets (e.g., 40 apps). Flags sub-par volume without approved target reductions and alerts management. | Recruiters, CS Head, Marketing TLs |
| **6:30 PM (Mon–Fri)** | `30 18 * * 1-5` | **Daily Sales Automatic Deactivation**<br>Concludes sales working hours. Automatically shifts all active sales representatives to `Deactive` status to prevent off-hours misallocations. | Sales, Management |
| **10:00 AM (Month End)** | `0 10 28-31 * *` | **Monthly Executive KPI Performance Review**<br>Compiles comprehensive monthly placement, application, and interview statistics into a formatted XLSX spreadsheet and emails it to leadership. | Administrators, Managers |

---

## 5. Technical Specifications

Placify is built on a modern, high-performance full-stack architecture designed for scalability, real-time coordination, and data integrity.

### 5.1 Core Technology Stack
*   **Frontend Framework**: **React 19** using modern functional components, custom hooks, and concurrent features.
*   **Routing**: **React Router 7** (Data API) for client-side navigation and stateful routing.
*   **Backend Server**: **Express 5** running on **Node.js**, pre-bundled with **esbuild** for serverless Vercel deployment and containerized environments.
*   **Primary Database**: **Firebase Firestore** (NoSQL) for real-time data synchronization and flexible schema management.
*   **Authentication**: **Firebase Authentication** providing secure session management and identity verification.
*   **Styling Engine**: **Tailwind CSS 4** for high-performance, utility-first UI construction with custom theme variables.

### 5.2 Key Integrations & Libraries
*   **Artificial Intelligence**: **Google Gemini API** (`@google/genai`) with tiered multi-model fallback (`gemini-3.6-flash`, `gemini-3.8-flash`, `gemini-flash-latest`) for automated compliance auditing and resume parsing.
*   **Calendar Services**: **Google Calendar API** (`googleapis`) with OAuth2 token persistence and automatic access token renewal.
*   **Communications**: **NodeMailer** for transactional emails with support for dynamic, user-configured SMTP providers.
*   **Visualization**: **Recharts** for real-time performance analytics and workload distribution charts.
*   **Data Processing**: **XLSX** and **PapaParse** for high-volume data imports/exports; **Mammoth** and **PDF.js** for document parsing.
*   **Animations**: **Motion** (fka Framer Motion) for fluid, responsive UI transitions and interactive state feedback.
*   **List Virtualization**: **react-window** for rendering large candidate and application lists at smooth 60fps.

### 5.3 Concurrency, Data Integrity & Timezone Architecture
*   **Atomic Round-Robin Engine**: Uses Firestore transactional reads and writes (`transaction.get`, `transaction.set`, `transaction.update`) to ensure lead pointers and candidate records are updated atomically with zero race conditions.
*   **Timezone-Safe Engine**: A custom implementation of `parseLocalTimeToDate` and `getCalendarDateInfo` ensures all scheduling and availability logic is strictly anchored to **EST (America/New_York)**, completely bypassing browser-local offset discrepancies and DST drift.
*   **Least-Privilege Security Rules**: Firestore security rules restrict candidate document writes, validate user roles, and allow public writes only to dedicated asset collections (such as `jpc_cv_files` for public bookings).

---

## 6. Operational Best Practices

1.  **Sales Availability Discipline**: Sales representatives should toggle their status to **Active** when starting their shift at 9:30 AM EST. If stepping away for extended periods or taking leave, they should set status to **Deactive** so incoming leads seamlessly rotate to available teammates. The system will automatically deactivate all reps at 6:30 PM EST.
2.  **Unassigned Leads Backlog**: When sales representatives activate in the morning, the system will automatically distribute accumulated backlog leads in chronological order. Management should periodically review the Round-Robin Dashboard to ensure adequate sales coverage.
3.  **Lead Generation Best Practice**: Lead Generation staff should focus strictly on accurate lead data entry (contact info, source, resume). Do not attempt to assign a sales representative manually, as the system enforces automated sequential allocation.
4.  **Log Book Velocity & TL Overrides**: While Marketing Team Leaders are the primary approvers for candidate resumes and RTR requests, Customer Service Head and Management should monitor the `pending_tl` queues daily and exercise their approval authority if a Marketing TL is absent, keeping candidate marketing on schedule.
5.  **Timezone Standardization**: All interview slots, follow-ups, and availability calendars operate in **EST (America/New_York)**. When communicating with candidates across different time zones, refer to the booking confirmation details which localize times appropriately.
6.  **Interview Hygiene & Rescheduling**: Never delete an interview request if a round is postponed or cancelled; use the **Reschedule** feature. Deleting an interview removes historical evaluator feedback and interview trail metrics that are critical for candidate placement.
7.  **Structured Technical Feedback**: Proxy team members must submit feedback immediately following each call, documenting specific questions asked and evaluating core technical competencies. This data is critical for candidate preparation in subsequent rounds.

---

*Last Updated: September 12, 2026*
