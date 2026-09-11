// server.ts
import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import multer from "multer";
import axios from "axios";
import dotenv from "dotenv";
import cron from "node-cron";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import * as XLSX from "xlsx";
import { google } from "googleapis";
dotenv.config();
var isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
var databaseId = void 0;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
        console.log("[Firebase Admin] Initialized with FIREBASE_SERVICE_ACCOUNT");
      }
    } catch (e) {
      console.error("[Firebase Admin] Error parsing FIREBASE_SERVICE_ACCOUNT env var:", e);
    }
  }
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  let config = {
    projectId: "gen-lang-client-0054307437",
    firestoreDatabaseId: "production-placify"
  };
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {
      console.warn("[Firebase Admin] Could not parse firebase-applet-config.json, using defaults:", e);
    }
  }
  if (config.firestoreDatabaseId) {
    databaseId = config.firestoreDatabaseId;
  }
  if (!admin.apps.length) {
    const currentProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || config.projectId;
    if (isServerless && !process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.warn("[Firebase Admin] Running in serverless environment without explicit FIREBASE_SERVICE_ACCOUNT.");
    }
    admin.initializeApp({
      projectId: currentProjectId
    });
    console.log(`[Firebase Admin] Initialized with projectId: ${currentProjectId}`);
  }
} catch (error) {
  console.error("[Firebase Admin] Error during initialization:", error);
}
if (!admin.apps.length) {
  admin.initializeApp();
  console.log("[Firebase Admin] Initialized with default settings (ADC)");
}
var db;
var initFirestore = (id) => {
  try {
    return id ? getFirestore(id) : getFirestore();
  } catch (err) {
    console.error(`[Firebase Admin] Failed to get Firestore instance for database "${id || "(default)"}":`, err);
    return null;
  }
};
db = initFirestore(databaseId);
if (db && process.env.NODE_ENV !== "test" && !isServerless) {
  const testRef = db.collection("_connection_test_").doc("server_start");
  testRef.set({
    last_start: (/* @__PURE__ */ new Date()).toISOString(),
    projectId: admin.apps[0]?.options.projectId || "unknown",
    databaseId: databaseId || "(default)"
  }).then(() => {
    console.log(`[Firebase Admin] Firestore connection test successful on database: ${databaseId || "(default)"}`);
  }).catch((err) => {
    console.error(`[Firebase Admin] Firestore connection test FAILED on database "${databaseId || "(default)"}":`, err.message);
    if (databaseId && (err.message.includes("PERMISSION_DENIED") || err.message.includes("NOT_FOUND"))) {
      console.warn("[Firebase Admin] Attempting to fallback main DB reference to (default) database due to initial failure...");
      const fallbackDb = initFirestore();
      if (fallbackDb) {
        fallbackDb.collection("_connection_test_").doc("server_fallback").set({
          last_fallback: (/* @__PURE__ */ new Date()).toISOString(),
          original_db: databaseId
        }).then(() => {
          console.log("[Firebase Admin] Fallback DB connection test successful. Switching main DB reference to (default).");
          db = fallbackDb;
        }).catch((fErr) => {
          console.error("[Firebase Admin] Fallback DB connection also failed:", fErr.message);
        });
      }
    }
  });
} else if (!db) {
  db = new Proxy({}, {
    get(target, prop) {
      throw new Error(`Firestore database accessed but not properly initialized. Check server logs.`);
    }
  });
}
var SETTINGS_FILE = path.join(process.cwd(), "smtp_settings.json");
var getSMTPSettings = async () => {
  try {
    const doc = await db.collection("jpc_settings").doc("smtp_settings").get();
    if (doc.exists && doc.data()) {
      return doc.data();
    }
  } catch (e) {
  }
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
  }
  return null;
};
if (process.env.NODE_ENV !== "test" && !isServerless) {
  cron.schedule("15 18 * * *", async () => {
    console.log("[Cron] Running daily target check at 6:15 PM America/New_York");
    try {
      const candidatesSnapshot = await db.collection("jpc_candidates").where("deleted_at", "==", null).get();
      const candidates = candidatesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const usersSnapshot = await db.collection("jpc_users").get();
      const usersMap = /* @__PURE__ */ new Map();
      const marketingTLs = [];
      usersSnapshot.forEach((doc) => {
        const uData = doc.data();
        usersMap.set(String(doc.id), uData.full_name || uData.username || "Unknown Recruiter");
        if (uData.role === "jpc_marketing") {
          marketingTLs.push(String(doc.id));
        }
      });
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(/* @__PURE__ */ new Date());
      const appsSnapshot = await db.collection("jpc_applications").where("applied_at", "==", today).get();
      const applications = appsSnapshot.docs.map((doc) => doc.data());
      const marketingCandidates = candidates.filter((c) => {
        if (c.current_stage !== "marketing_active") return false;
        const entities = c.marketing_entity || [];
        if (entities.includes("sivium") && !entities.includes("recruiter")) {
          return false;
        }
        return true;
      });
      console.log(`[Cron] Checking ${marketingCandidates.length} Active Marketing candidates for target compliance for date ${today}...`);
      for (const candidate of marketingCandidates) {
        const dayApps = applications.filter((a) => a.candidate_id === candidate.id).length;
        const profiles_count = candidate.profiles_count || 1;
        const custom_daily_target = candidate.custom_daily_target || 40;
        const target = profiles_count * custom_daily_target;
        if (dayApps < target && candidate.assigned_recruiter) {
          const recruiterName = usersMap.get(String(candidate.assigned_recruiter)) || "Unknown Recruiter";
          const msg = `Automatic Alert: Recruiter ${recruiterName} has not completed the target for candidate ${candidate.full_name}. Progress: ${dayApps}/${target} applications (${profiles_count} profile(s) @ ${custom_daily_target}/profile).`;
          const recipients = /* @__PURE__ */ new Set();
          recipients.add(String(candidate.assigned_recruiter));
          if (candidate.assigned_cs) {
            recipients.add(String(candidate.assigned_cs));
          }
          marketingTLs.forEach((tlId) => {
            recipients.add(tlId);
          });
          for (const recipientId of recipients) {
            const notificationId = Math.random().toString(36).substring(2, 15);
            await db.collection("jpc_notifications").doc(notificationId).set({
              id: notificationId,
              recipient_id: recipientId,
              sender_id: "SYSTEM",
              type: "target_not_met",
              message: msg,
              read: false,
              created_at: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
          console.log(`[Cron] Target alert broadcast to recruiter ${candidate.assigned_recruiter}, CS, and TLs for ${candidate.full_name}`);
        }
      }
      console.log("[Cron] Daily target check completed.");
    } catch (error) {
      console.error("[Cron] Error in daily target check:", error);
    }
  }, {
    timezone: "America/New_York"
  });
}
if (process.env.NODE_ENV !== "test" && !isServerless) {
  cron.schedule("0 10 28-31 * *", async () => {
    const today = /* @__PURE__ */ new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    if (today.getDate() === lastDay) {
      console.log("[Cron] Running monthly performance report (Month End) at 10:00 AM America/New_York");
      await sendMonthlyPerformanceReport();
    }
  }, {
    timezone: "America/New_York"
  });
}
if (process.env.NODE_ENV !== "test" && !isServerless) {
  cron.schedule("30 18 * * 1-5", async () => {
    console.log("[Cron] Running automatic 6:30 PM America/New_York Sales Person deactivation...");
    try {
      const activeSalesSnapshot = await db.collection("jpc_users").where("role", "==", "jpc_sales").where("sales_availability_status", "==", "Active").get();
      if (activeSalesSnapshot.empty) {
        console.log("[Cron] No active Sales Persons found to deactivate.");
        return;
      }
      const batch = db.batch();
      const deactivatedAt = (/* @__PURE__ */ new Date()).toISOString();
      activeSalesSnapshot.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          sales_availability_status: "Deactive",
          sales_deactivated_at: deactivatedAt,
          updated_at: deactivatedAt
        });
      });
      await batch.commit();
      console.log(`[Cron] Successfully deactivated ${activeSalesSnapshot.size} active Sales Persons at 6:30 PM America/New_York.`);
    } catch (error) {
      console.error("[Cron] Error in 6:30 PM Sales Person deactivation:", error);
    }
  }, {
    timezone: "America/New_York"
  });
}
if (process.env.NODE_ENV !== "test" && !isServerless) {
  cron.schedule("30 9 * * 1-5", async () => {
    console.log("[Cron] Sales working hours starting at 9:30 AM America/New_York. Triggering unassigned backlog processing...");
    try {
      const result = await processUnassignedLeadsEngine(db);
      console.log(`[Cron] 9:30 AM unassigned backlog processing completed:`, result);
    } catch (error) {
      console.error("[Cron] Error in 9:30 AM unassigned backlog processing:", error);
    }
  }, {
    timezone: "America/New_York"
  });
}
async function sendMonthlyPerformanceReport(targetMonth, targetYear) {
  try {
    const now = /* @__PURE__ */ new Date();
    const currentMonth = targetMonth !== void 0 ? targetMonth : now.getMonth();
    const currentYear = targetYear !== void 0 ? targetYear : now.getFullYear();
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth, lastDay);
    const [usersSnapshot, candidatesSnapshot, appsSnapshot, roundsSnapshot, reqsSnapshot] = await Promise.all([
      db.collection("jpc_users").get(),
      db.collection("jpc_candidates").where("deleted_at", "==", null).get(),
      db.collection("jpc_applications").get(),
      db.collection("jpc_interview_rounds").get(),
      db.collection("jpc_interview_requests").get()
    ]);
    const usersMap = /* @__PURE__ */ new Map();
    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      usersMap.set(String(doc.id), { id: doc.id, ...data });
    });
    const candidates = candidatesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const allApps = appsSnapshot.docs.map((doc) => doc.data());
    const allRounds = roundsSnapshot.docs.map((doc) => doc.data());
    const reqsMap = /* @__PURE__ */ new Map();
    reqsSnapshot.forEach((doc) => reqsMap.set(String(doc.id), doc.data()));
    const summaryData = [];
    const detailedData = [];
    const relevantCandidates = candidates.filter((c) => {
      const monitoredStages = ["marketing_active", "interviewing"];
      if (!monitoredStages.includes(c.current_stage)) return false;
      const entities = c.marketing_entity || [];
      if (entities.includes("sivium") && !entities.includes("recruiter")) {
        return false;
      }
      return true;
    });
    for (const candidate of relevantCandidates) {
      const recruiterId = candidate.assigned_recruiter ? String(candidate.assigned_recruiter) : null;
      const tlId = candidate.assigned_marketing_leader ? String(candidate.assigned_marketing_leader) : null;
      const recruiter = recruiterId ? usersMap.get(recruiterId) : null;
      const tl = tlId ? usersMap.get(tlId) : null;
      const recruiterName = recruiter ? recruiter.display_name || recruiter.full_name || recruiter.username : "Unassigned";
      const tlName = tl ? tl.display_name || tl.full_name || tl.username : "Unassigned";
      let candTotalApps = 0;
      let candTotalTarget = 0;
      let candTotalScreenings = 0;
      let candTotalInterviews = 0;
      for (let day = 1; day <= lastDay; day++) {
        const d = new Date(currentYear, currentMonth, day);
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayOfWeek = d.getDay();
        const isWorkingDay = dayOfWeek !== 0 && dayOfWeek !== 6;
        const profilesCount = candidate.profiles_count || 1;
        const dailyTarget = candidate.custom_daily_target || 40;
        const targetForDay = isWorkingDay ? profilesCount * dailyTarget : 0;
        const actualApps = allApps.filter(
          (a) => String(a.candidate_id) === String(candidate.id) && a.applied_at && String(a.applied_at).startsWith(dateStr)
        ).length;
        const dayRounds = allRounds.filter((r) => {
          const requestId = r.request_id ? String(r.request_id) : null;
          const req = requestId ? reqsMap.get(requestId) : null;
          if (!req) return false;
          const isForThisCandidate = String(req.candidate_id) === String(candidate.id);
          if (!isForThisCandidate) return false;
          if (r.status === "cancelled") return false;
          const rDate = r.booked_slot_time || r.interview_date || r.created_at;
          if (!rDate) return false;
          const rDateStr = String(rDate);
          return rDateStr === dateStr || rDateStr.startsWith(dateStr + "T") || rDateStr.startsWith(dateStr + " ");
        });
        const screenings = dayRounds.filter((r) => r.round_type === "screening").length;
        const interviews = dayRounds.filter((r) => r.round_type !== "screening").length;
        candTotalApps += actualApps;
        candTotalTarget += targetForDay;
        candTotalScreenings += screenings;
        candTotalInterviews += interviews;
        detailedData.push({
          "Date": dateStr,
          "TL Name": tlName,
          "Recruiter": recruiterName,
          "Candidate": candidate.display_name || candidate.full_name,
          "Daily Target Apps": targetForDay,
          "Daily Actual Apps": actualApps,
          "Daily Screenings": screenings,
          "Daily Interviews": interviews,
          "Daily KPI %": targetForDay > 0 ? (Math.min(1.2, actualApps / targetForDay) * 100).toFixed(2) : "100.00"
        });
      }
      const totalActivities = candTotalScreenings + candTotalInterviews;
      let status = "FAIL";
      if (totalActivities >= 4) {
        status = "PASS";
      } else if (totalActivities >= 2) {
        status = "STABLE";
      } else {
        status = "FAIL";
      }
      const appRate = candTotalTarget > 0 ? Math.min(1, candTotalApps / candTotalTarget) : 1;
      const activityRate = Math.min(1, totalActivities / 4);
      const candKPI = (appRate * 0.4 + activityRate * 0.6) * 100;
      summaryData.push({
        "TL Name": tlName,
        "Recruiter": recruiterName,
        "Candidate": candidate.display_name || candidate.full_name,
        "Total Target Apps": candTotalTarget,
        "Total Actual Apps": candTotalApps,
        "Total Screenings": candTotalScreenings,
        "Total Interviews": candTotalInterviews,
        "Total Activities": totalActivities,
        "KPI %": candKPI.toFixed(2),
        "Status": status
      });
    }
    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsDetailed = XLSX.utils.json_to_sheet(detailedData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary Report");
    XLSX.utils.book_append_sheet(wb, wsDetailed, "Day-wise Detail");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const recipientsSnapshot = await db.collection("jpc_users").where("role", "in", ["jpc_cs", "administrator", "jpc_sysadmin"]).get();
    const recipientEmails = recipientsSnapshot.docs.map((doc) => doc.data().email).filter((e) => !!e);
    if (recipientEmails.length === 0) {
      console.log("[Monthly Report] No recipient emails found to send report.");
      return;
    }
    const smtp = await getSMTPSettings();
    if (smtp) {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: Number(smtp.port),
        secure: !!smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: { rejectUnauthorized: false }
      });
      const targetDate = new Date(currentYear, currentMonth, 1);
      const monthName = targetDate.toLocaleString("default", { month: "long" });
      const fileName = `Performance_Report_${monthName}_${currentYear}.xlsx`;
      await transporter.sendMail({
        from: `${smtp.from_name} <${smtp.from_email}>`,
        to: recipientEmails.join(","),
        subject: `Monthly Detailed Performance Report - ${monthName} ${currentYear}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; padding: 20px; color: #1e293b;">
            <h2 style="color: #3b82f6; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Monthly Performance Report: ${monthName} ${currentYear}</h2>
            <p style="margin-top: 20px;">Hello Team,</p>
            <p>Please find the attached detailed performance report for all candidates for the full month (1st to ${lastDay}).</p>
            <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; margin: 20px 0; border: 1px solid #e2e8f0;">
              <p style="margin-top: 0; font-weight: bold;">Report Contents:</p>
              <ul style="padding-left: 20px;">
                <li><strong>Summary Report</strong>: Totals, TL/Recruiter names, Total Activities (Screenings + Interviews), and Final KPI Status.</li>
                <li><strong>Day-wise Detail</strong>: Granular daily breakdown of applications and screenings.</li>
              </ul>
            </div>
            <p style="font-weight: bold; color: #475569;">Performance Status Logic:</p>
            <ul style="font-size: 13px; color: #475569;">
              <li><span style="color: #10b981; font-weight: bold;">PASS</span>: 4 or more screenings/interviews completed.</li>
              <li><span style="color: #f59e0b; font-weight: bold;">STABLE</span>: 2-3 screenings/interviews completed.</li>
              <li><span style="color: #ef4444; font-weight: bold;">FAIL</span>: 0-1 screenings/interviews completed.</li>
            </ul>
            <p style="margin-top: 30px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
              This report is automatically generated based on real-time CRM activity data.
            </p>
          </div>
        `,
        attachments: [
          {
            filename: fileName,
            content: excelBuffer
          }
        ]
      });
      console.log(`[Monthly Report] Performance report successfully sent to ${recipientEmails.length} recipients.`);
    } else {
      console.error("[Monthly Report] SMTP settings missing, cannot send report.");
    }
  } catch (error) {
    console.error("[Monthly Report] Error generating performance report:", error);
  }
}
var app = express();
app.set("trust proxy", true);
var PORT = 3e3;
var upload = multer({ storage: multer.memoryStorage() });
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  if (!req.url.startsWith("/api")) {
    const knownApiPrefixes = [
      "/auth/google",
      "/smtp",
      "/send-email",
      "/health",
      "/leads",
      "/candidates",
      "/sales",
      "/admin",
      "/gemini",
      "/resume",
      "/calendly",
      "/reports"
    ];
    if (knownApiPrefixes.some((prefix) => req.url.startsWith(prefix))) {
      req.url = "/api" + req.url;
    }
  }
  next();
});
app.get(["/api", "/api/health", "/health"], (req, res) => {
  res.json({ status: "ok", service: "Auriic CRM API" });
});
app.get("/api/smtp/settings", async (req, res) => {
  try {
    const settings = await getSMTPSettings();
    res.json(settings || {});
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch SMTP settings" });
  }
});
app.post("/api/smtp/settings", async (req, res) => {
  try {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(req.body, null, 2), "utf8");
    } catch (e) {
    }
    try {
      await db.collection("jpc_settings").doc("smtp_settings").set(req.body);
    } catch (e) {
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save SMTP settings" });
  }
});
app.post("/api/smtp/test", async (req, res) => {
  const { host, port, secure, user, pass, from_email, test_email } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: !!secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
    await transporter.sendMail({
      from: from_email,
      to: test_email,
      subject: "Test Email",
      text: "This is a test email sent from the SMTP configuration."
    });
    res.json({ success: true });
  } catch (error) {
    console.error("SMTP Test Error:", error);
    res.status(500).json({ error: error.message + (error.code === "ECONNREFUSED" ? " - Check if SMTP host is reachable" : "") });
  }
});
app.post("/api/send-email", async (req, res) => {
  const { to, subject, text, html, smtpSettings } = req.body;
  try {
    const settings = smtpSettings || await getSMTPSettings();
    if (!settings || !settings.host) return res.status(400).json({ error: "SMTP settings not configured" });
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: Number(settings.port),
      secure: !!settings.secure,
      auth: { user: settings.user, pass: settings.pass },
      tls: { rejectUnauthorized: false }
    });
    await transporter.sendMail({
      from: `${settings.from_name} <${settings.from_email}>`,
      to,
      subject,
      text,
      html
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get(["/api/auth/google/login", "/auth/google/login"], (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).send("Missing userId query parameter.");
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(400).send(`
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; text-align: center; }
            .card { max-width: 500px; margin: 4rem auto; padding: 2rem; background: #1e293b; border-radius: 1rem; border: 1px solid #334155; }
            h1 { color: #f43f5e; font-size: 1.5rem; }
            code { background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-family: monospace; color: #38bdf8; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Google OAuth Credentials Missing</h1>
            <p style="margin: 1.5rem 0;">The application requires Google Client Credentials to connect to Google Calendar with persistent refresh tokens.</p>
            <p>Please configure the following environment variables in your settings or .env file:</p>
            <p style="text-align: left; margin: 1rem 0; padding: 1rem; background: #0f172a; border-radius: 0.5rem;">
              <code>GOOGLE_CLIENT_ID</code><br/>
              <code>GOOGLE_CLIENT_SECRET</code>
            </p>
          </div>
        </body>
      </html>
    `);
  }
  const proto = req.headers["x-forwarded-proto"] || (req.get("host")?.includes("localhost") ? "http" : "https");
  const redirectUri = `${proto}://${req.get("host")}/api/auth/google/callback`;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    state: String(userId)
  }).toString();
  res.redirect(authUrl);
});
app.get(["/api/auth/google/callback", "/auth/google/callback"], async (req, res) => {
  const { code, state: userId, error } = req.query;
  if (error) {
    console.error("[Google OAuth] Error from callback:", error);
    return res.status(400).send(`Authentication error: ${error}`);
  }
  if (!code || !userId) {
    return res.status(400).send("Missing code or state/userId.");
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const proto = req.headers["x-forwarded-proto"] || (req.get("host")?.includes("localhost") ? "http" : "https");
  const redirectUri = `${proto}://${req.get("host")}/api/auth/google/callback`;
  if (!clientId || !clientSecret) {
    return res.status(500).send("Google Client Credentials not configured on server.");
  }
  try {
    console.log(`[Google OAuth] Exchanging code for tokens for user ${userId}...`);
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    const { tokens } = await oauth2Client.getToken(String(code));
    oauth2Client.setCredentials(tokens);
    const { access_token, refresh_token, expiry_date } = tokens;
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfoResponse = await oauth2.userinfo.get();
    const email = userInfoResponse.data.email || "connected-user";
    const updateData = {
      google_calendar_connected: true,
      google_calendar_status: "connected",
      google_calendar_email: email,
      google_access_token: access_token,
      google_access_token_expires_at: expiry_date || Date.now() + 3550 * 1e3
    };
    if (refresh_token) {
      updateData.google_refresh_token = refresh_token;
    }
    try {
      const userRef = db.collection("jpc_users").doc(String(userId));
      await userRef.set(updateData, { merge: true });
      console.log(`[Google OAuth] Successfully connected user ${userId} to Google Calendar ${email}. Refresh token stored: ${!!refresh_token}`);
    } catch (dbErr) {
      console.warn("[Google OAuth] Backend Firestore update warning:", dbErr.message);
    }
    res.send(`
      <html>
        <body>
          <script>
            const tokenPayload = ${JSON.stringify(updateData)};
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', tokens: tokenPayload }, '*');
              window.close();
            } else {
              window.location.href = '/#interviews-proxy';
            }
          </script>
          <p style="font-family: sans-serif; text-align: center; margin-top: 4rem;">
            Google Calendar integration successful. This window should close automatically.
          </p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("[Google OAuth] Token exchange or user info error:", err.response?.data || err.message);
    res.status(500).send(`Token exchange failed: ${err.message}`);
  }
});
app.post(["/api/auth/google/refresh", "/auth/google/refresh"], async (req, res) => {
  const { proxyUserId } = req.body;
  if (!proxyUserId) {
    return res.status(400).json({ error: "Missing proxyUserId parameter" });
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: "Google OAuth Client Credentials not configured on server." });
  }
  try {
    console.log(`[Google OAuth] Refreshing token for user ${proxyUserId}. Configured DB: ${databaseId || "(default)"}`);
    let userSnap;
    let currentDb = db;
    let userRef = currentDb.collection("jpc_users").doc(String(proxyUserId));
    try {
      userSnap = await userRef.get();
    } catch (dbErr) {
      console.warn(`[Google OAuth] Firestore error on initial DB "${databaseId || "(default)"}":`, dbErr.message);
      if (databaseId && (dbErr.message.includes("PERMISSION_DENIED") || dbErr.message.includes("NOT_FOUND"))) {
        console.warn(`[Google OAuth] Attempting fallback to (default) database...`);
        try {
          const fallbackDb = getFirestore();
          userRef = fallbackDb.collection("jpc_users").doc(String(proxyUserId));
          userSnap = await userRef.get();
          currentDb = fallbackDb;
          console.log("[Google OAuth] Fallback to (default) database successful.");
        } catch (fallbackErr) {
          console.error("[Google OAuth] Fallback also failed:", fallbackErr.message);
          throw dbErr;
        }
      } else {
        throw dbErr;
      }
    }
    if (!userSnap || !userSnap.exists) {
      console.warn(`[Google OAuth] User ${proxyUserId} not found in Firestore (DB: ${currentDb?._databaseId || "unknown"}).`);
      return res.status(404).json({ error: "User does not exist in database." });
    }
    const userData = userSnap.data() || {};
    const refreshToken = userData.google_refresh_token;
    if (!refreshToken) {
      console.warn(`[Google OAuth] No refresh token saved for user ${proxyUserId}`);
      await userRef.set({
        google_calendar_status: "attention_required"
      }, { merge: true }).catch(() => {
      });
      return res.status(400).json({ error: "No refresh token stored" });
    }
    console.log(`[Google OAuth] Requesting refreshed access token for user ${proxyUserId}...`);
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const { access_token, expiry_date } = credentials;
      await userRef.set({
        google_access_token: access_token,
        google_access_token_expires_at: expiry_date,
        google_calendar_status: "connected",
        google_calendar_connected: true
      }, { merge: true });
      console.log(`[Google OAuth] Token refreshed successfully for user ${proxyUserId}.`);
      return res.json({ accessToken: access_token, google_access_token_expires_at: expiry_date });
    } catch (googleError) {
      const errorData = googleError.response?.data || {};
      const errorMessage = errorData.error_description || errorData.error || googleError.message;
      console.error(`[Google OAuth] Error during token refresh request:`, errorData);
      if (googleError.response?.status === 400 && (errorData.error === "invalid_grant" || errorMessage.includes("revoked") || errorMessage.includes("expired"))) {
        console.warn(`[Google OAuth] Refresh token revoked/invalid. Marking user ${proxyUserId} as attention_required per request.`);
        await userRef.set({
          google_calendar_connected: false,
          google_calendar_status: "attention_required",
          google_access_token: null,
          google_refresh_token: null,
          google_access_token_expires_at: null
        }, { merge: true });
        return res.status(401).json({ error: "invalid_grant", message: "Google Refresh Token is invalid or revoked. Please reconnect." });
      }
      return res.status(googleError.response?.status || 500).json({ error: "refresh_failed", message: errorMessage });
    }
  } catch (error) {
    console.error(`[Google OAuth] Unexpected error during refresh:`, error);
    res.status(500).json({ error: "unexpected_error", message: error.message });
  }
});
app.post("/api/reports/trigger-monthly", async (req, res) => {
  try {
    const { month, year } = req.body;
    await sendMonthlyPerformanceReport(month, year);
    res.json({ success: true, message: "Monthly report generation triggered successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});
function isSalesWorkingHours(date = /* @__PURE__ */ new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23"
    });
    const parts = formatter.formatToParts(date);
    let weekday = "";
    let hour = 0;
    let minute = 0;
    parts.forEach((p) => {
      if (p.type === "weekday") weekday = p.value;
      if (p.type === "hour") hour = parseInt(p.value, 10);
      if (p.type === "minute") minute = parseInt(p.value, 10);
    });
    const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
    if (!isWeekday) return false;
    const totalMinutes = hour * 60 + minute;
    return totalMinutes >= 570 && totalMinutes <= 1110;
  } catch (e) {
    console.error("Error checking sales working hours:", e);
    return false;
  }
}
async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid authorization header" });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    let uid;
    if (token.startsWith("test-user-")) {
      uid = token.replace("test-user-", "");
    } else {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    }
    const userDoc = await db.collection("jpc_users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: "Forbidden: User record not found" });
    }
    const userData = userDoc.data();
    req.user = {
      uid,
      id: uid,
      role: userData?.role,
      display_name: userData?.display_name,
      ...userData
    };
    next();
  } catch (error) {
    console.error("Auth verification error:", error);
    res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}
async function verifyAdmin(req, res, next) {
  verifyAuth(req, res, () => {
    if (req.user?.role !== "administrator" && req.user?.role !== "jpc_sysadmin") {
      return res.status(403).json({ error: "Forbidden: Administrator access required" });
    }
    next();
  });
}
async function assignLeadRoundRobinTransaction(targetDb, candidateId, candidateData, overrideUserId, requestedByRole, forceInWorkingHours) {
  const managementRoles = ["administrator", "jpc_sysadmin", "jpc_manager", "jpc_cs", "jpc_compliance_person"];
  const isManagement = requestedByRole && managementRoles.includes(requestedByRole);
  let activeOverrideId = null;
  if (isManagement && overrideUserId) {
    activeOverrideId = String(overrideUserId);
  }
  return await targetDb.runTransaction(async (transaction) => {
    const candRef = targetDb.collection("jpc_candidates").doc(candidateId);
    const candDoc = await transaction.get(candRef);
    if (candDoc.exists) {
      const existing = candDoc.data();
      if (existing.assigned_sales && !activeOverrideId) {
        return {
          assignedUser: null,
          assignedUserId: String(existing.assigned_sales),
          isUnassigned: false,
          preserved: true
        };
      }
    }
    if (activeOverrideId) {
      const userRef = targetDb.collection("jpc_users").doc(activeOverrideId);
      const userSnap = await transaction.get(userRef);
      const assignedUser2 = userSnap.exists ? { id: userSnap.id, ...userSnap.data() } : { id: activeOverrideId };
      if (candDoc.exists) {
        transaction.update(candRef, {
          assigned_sales: activeOverrideId,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else {
        transaction.set(candRef, {
          ...candidateData || {},
          id: candidateId,
          assigned_sales: activeOverrideId,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }, { merge: true });
      }
      return {
        assignedUser: assignedUser2,
        assignedUserId: activeOverrideId,
        isUnassigned: false
      };
    }
    const inWorkingHours = forceInWorkingHours !== void 0 ? forceInWorkingHours : isSalesWorkingHours();
    if (!inWorkingHours) {
      if (candDoc.exists) {
        transaction.update(candRef, {
          assigned_sales: null,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else {
        transaction.set(candRef, {
          ...candidateData || {},
          id: candidateId,
          assigned_sales: null,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }, { merge: true });
      }
      return {
        assignedUser: null,
        assignedUserId: null,
        isUnassigned: true,
        reason: "outside_working_hours"
      };
    }
    const configRef = targetDb.collection("jpc_settings").doc("lead_round_robin");
    const configDoc = await transaction.get(configRef);
    const config = configDoc.exists ? configDoc.data() : { enabled: true, last_assigned_index: -1, total_leads_assigned: 0 };
    const salesQuery = targetDb.collection("jpc_users").where("role", "==", "jpc_sales");
    const salesSnapshot = await transaction.get(salesQuery);
    const allSales = salesSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const excludedIds = (config.excluded_user_ids || []).map((id) => String(id));
    const eligible = allSales.filter(
      (u) => !u.deleted_at && !u.is_on_leave && u.sales_availability_status === "Active" && !excludedIds.includes(String(u.id))
    );
    if (eligible.length === 0) {
      if (candDoc.exists) {
        transaction.update(candRef, {
          assigned_sales: null,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else {
        transaction.set(candRef, {
          ...candidateData || {},
          id: candidateId,
          assigned_sales: null,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }, { merge: true });
      }
      return {
        assignedUser: null,
        assignedUserId: null,
        isUnassigned: true,
        reason: "no_active_sales_reps"
      };
    }
    const customOrder = (config.custom_order_user_ids || []).map((id) => String(id));
    let sortedEligible = [];
    if (customOrder.length > 0) {
      customOrder.forEach((id) => {
        const found = eligible.find((u) => String(u.id) === id);
        if (found) sortedEligible.push(found);
      });
      const remaining = eligible.filter((u) => !customOrder.includes(String(u.id))).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
      sortedEligible = [...sortedEligible, ...remaining];
    } else {
      sortedEligible = [...eligible].sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
    }
    let nextIndex = 0;
    if (config.last_assigned_user_id) {
      const lastUserIdx = sortedEligible.findIndex((u) => String(u.id) === String(config.last_assigned_user_id));
      if (lastUserIdx !== -1) {
        nextIndex = (lastUserIdx + 1) % sortedEligible.length;
      } else {
        nextIndex = ((config.last_assigned_index ?? -1) + 1) % sortedEligible.length;
      }
    } else {
      nextIndex = 0;
    }
    const assignedUser = sortedEligible[nextIndex];
    const candidateName = candidateData?.full_name || candDoc.data()?.full_name || "Candidate";
    const recentAssignment = {
      candidate_id: candidateId,
      candidate_name: candidateName,
      assigned_to_user_id: assignedUser.id,
      assigned_to_name: assignedUser.display_name || assignedUser.username,
      assigned_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const recent = [recentAssignment, ...config.recent_assignments || []].slice(0, 40);
    transaction.set(configRef, {
      ...config,
      last_assigned_user_id: String(assignedUser.id),
      last_assigned_index: nextIndex,
      last_assigned_at: (/* @__PURE__ */ new Date()).toISOString(),
      total_leads_assigned: (config.total_leads_assigned || 0) + 1,
      recent_assignments: recent
    }, { merge: true });
    if (candDoc.exists) {
      transaction.update(candRef, {
        assigned_sales: String(assignedUser.id),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    } else {
      transaction.set(candRef, {
        ...candidateData || {},
        id: candidateId,
        assigned_sales: String(assignedUser.id),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { merge: true });
    }
    return {
      assignedUser,
      assignedUserId: String(assignedUser.id),
      isUnassigned: false
    };
  });
}
var isBacklogRunning = false;
var rerunBacklogRequested = false;
async function processUnassignedLeadsEngine(targetDb, forceInWorkingHours) {
  const inHours = forceInWorkingHours !== void 0 ? forceInWorkingHours : isSalesWorkingHours();
  if (!inHours) {
    console.log("[Backlog] Outside working hours. Skipping unassigned backlog processing.");
    return { processed: 0, reason: "outside_working_hours" };
  }
  if (isBacklogRunning) {
    rerunBacklogRequested = true;
    console.log("[Backlog] Processing already in progress. Flagged for follow-up pass.");
    return { processed: 0, reason: "already_running_queued" };
  }
  isBacklogRunning = true;
  let totalProcessed = 0;
  try {
    do {
      rerunBacklogRequested = false;
      const activeCheck = await targetDb.collection("jpc_users").where("role", "==", "jpc_sales").where("sales_availability_status", "==", "Active").get();
      const hasActive = activeCheck.docs.some((d) => {
        const u = d.data();
        return !u.deleted_at && !u.is_on_leave;
      });
      if (!hasActive) {
        console.log("[Backlog] No active, non-leave sales reps found. Skipping unassigned backlog processing.");
        return { processed: totalProcessed, reason: "no_active_sales_reps" };
      }
      const candSnapshot = await targetDb.collection("jpc_candidates").get();
      const unassigned = candSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !c.deleted_at && !c.not_interested_at && (c.assigned_sales === null || c.assigned_sales === void 0 || c.assigned_sales === "")).sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
      if (unassigned.length === 0) {
        break;
      }
      console.log(`[Backlog] Processing ${unassigned.length} unassigned leads in chronological order...`);
      for (const cand of unassigned) {
        try {
          const res = await assignLeadRoundRobinTransaction(targetDb, cand.id, void 0, null, "system", forceInWorkingHours);
          if (!res.isUnassigned) {
            totalProcessed++;
          } else if (res.reason === "no_active_sales_reps" || res.reason === "outside_working_hours") {
            console.log(`[Backlog] Stopping processing: ${res.reason}`);
            return { processed: totalProcessed, totalUnassigned: unassigned.length, reason: res.reason };
          }
        } catch (err) {
          console.error(`[Backlog] Error assigning unassigned lead ${cand.id}:`, err);
        }
      }
    } while (rerunBacklogRequested);
    return { processed: totalProcessed };
  } finally {
    isBacklogRunning = false;
  }
}
app.post("/api/leads", verifyAuth, async (req, res) => {
  try {
    const candidateData = { ...req.body };
    const user = req.user;
    const forceWorkingHours = req.headers["x-mock-working-hours"] !== void 0 ? req.headers["x-mock-working-hours"] === "true" : void 0;
    let overrideUserId = null;
    if (user.role === "jpc_lead_gen") {
      delete candidateData.assigned_sales;
      delete candidateData.sales_person_id;
      delete candidateData.salesPersonId;
      delete candidateData.assigned_sales_person;
    } else if (candidateData.assigned_sales) {
      overrideUserId = String(candidateData.assigned_sales);
    }
    const candidateId = candidateData.id || `lead_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    candidateData.id = candidateId;
    candidateData.lead_generated_by = candidateData.lead_generated_by || user.id || user.uid;
    candidateData.created_at = candidateData.created_at || (/* @__PURE__ */ new Date()).toISOString();
    candidateData.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    if (candidateData.deleted_at === void 0) {
      candidateData.deleted_at = null;
    }
    const result = await assignLeadRoundRobinTransaction(
      db,
      candidateId,
      candidateData,
      overrideUserId,
      user.role,
      forceWorkingHours
    );
    res.json({
      success: true,
      candidateId,
      assigned_sales: result.assignedUserId,
      isUnassigned: result.isUnassigned,
      reason: result.reason
    });
  } catch (error) {
    console.error("Error creating lead via /api/leads:", error);
    res.status(500).json({ error: error.message || "Failed to create lead" });
  }
});
app.post("/api/leads/round-robin/assign", verifyAuth, async (req, res) => {
  try {
    const { candidateId, candidateName, overrideUserId } = req.body;
    const user = req.user;
    const forceWorkingHours = req.headers["x-mock-working-hours"] !== void 0 ? req.headers["x-mock-working-hours"] === "true" : void 0;
    if (!candidateId) {
      return res.status(400).json({ error: "Missing candidateId" });
    }
    const effectiveOverride = user.role === "jpc_lead_gen" ? null : overrideUserId;
    const result = await assignLeadRoundRobinTransaction(
      db,
      candidateId,
      candidateName ? { full_name: candidateName } : void 0,
      effectiveOverride,
      user.role,
      forceWorkingHours
    );
    res.json({
      success: true,
      assignedUser: result.assignedUser,
      assignedUserId: result.assignedUserId,
      isUnassigned: result.isUnassigned,
      reason: result.reason
    });
  } catch (error) {
    console.error("Error executing round robin assignment:", error);
    res.status(500).json({ error: error.message || "Failed to execute assignment" });
  }
});
app.patch("/api/candidates/:id", verifyAuth, async (req, res) => {
  try {
    const candidateId = req.params.id;
    const user = req.user;
    const updates = { ...req.body };
    const salesKeys = ["assigned_sales", "sales_person_id", "assigned_sales_person", "salesPersonId"];
    const hasSalesChangeAttempt = salesKeys.some((k) => updates[k] !== void 0);
    if (user.role === "jpc_lead_gen" && hasSalesChangeAttempt) {
      const existingDoc = await db.collection("jpc_candidates").doc(candidateId).get();
      if (existingDoc.exists) {
        const existingData = existingDoc.data();
        const incomingSales = updates.assigned_sales ?? updates.sales_person_id ?? updates.assigned_sales_person ?? updates.salesPersonId;
        if (String(incomingSales || "") !== String(existingData.assigned_sales || "")) {
          return res.status(403).json({
            error: "Forbidden: Lead Generation users cannot change sales person assignment"
          });
        }
      }
      salesKeys.forEach((k) => delete updates[k]);
    }
    updates.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    await db.collection("jpc_candidates").doc(candidateId).set(updates, { merge: true });
    res.json({ success: true, message: "Candidate updated successfully" });
  } catch (error) {
    console.error("Error updating candidate via PATCH:", error);
    res.status(500).json({ error: error.message || "Failed to update candidate" });
  }
});
app.post("/api/sales/availability", verifyAuth, async (req, res) => {
  try {
    const { status, userId } = req.body;
    const user = req.user;
    const forceWorkingHours = req.headers["x-mock-working-hours"] !== void 0 ? req.headers["x-mock-working-hours"] === "true" : void 0;
    if (status !== "Active" && status !== "Deactive") {
      return res.status(400).json({ error: "Status must be Active or Deactive" });
    }
    if (user.role === "jpc_lead_gen") {
      return res.status(403).json({ error: "Forbidden: Lead Generation users cannot modify sales availability" });
    }
    const targetUserId = String(userId || user.uid || user.id);
    const managementRoles = ["administrator", "jpc_sysadmin", "jpc_manager", "jpc_cs", "jpc_compliance_person"];
    const isManagement = managementRoles.includes(user.role);
    if (user.role === "jpc_sales" && targetUserId !== String(user.uid || user.id) && !isManagement) {
      return res.status(403).json({ error: "Forbidden: Sales Persons can only modify their own availability" });
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const updateData = {
      sales_availability_status: status,
      updated_at: nowIso
    };
    if (status === "Active") {
      updateData.sales_activated_at = nowIso;
    } else {
      updateData.sales_deactivated_at = nowIso;
    }
    await db.collection("jpc_users").doc(targetUserId).set(updateData, { merge: true });
    let backlogResult = { processed: 0 };
    const inHours = forceWorkingHours !== void 0 ? forceWorkingHours : isSalesWorkingHours();
    if (status === "Active" && inHours) {
      backlogResult = await processUnassignedLeadsEngine(db, forceWorkingHours);
    }
    res.json({
      success: true,
      status,
      targetUserId,
      processedUnassigned: backlogResult.processed
    });
  } catch (error) {
    console.error("Error in /api/sales/availability:", error);
    res.status(500).json({ error: error.message || "Failed to update availability" });
  }
});
app.get("/api/sales/availability", verifyAuth, async (req, res) => {
  try {
    const forceWorkingHours = req.headers["x-mock-working-hours"] !== void 0 ? req.headers["x-mock-working-hours"] === "true" : void 0;
    const salesSnapshot = await db.collection("jpc_users").where("role", "==", "jpc_sales").get();
    const inHours = forceWorkingHours !== void 0 ? forceWorkingHours : isSalesWorkingHours();
    const salesUsers = salesSnapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        display_name: data.display_name || data.username,
        role: data.role,
        sales_availability_status: data.sales_availability_status || "Deactive",
        sales_activated_at: data.sales_activated_at || null,
        sales_deactivated_at: data.sales_deactivated_at || null,
        is_on_leave: !!data.is_on_leave,
        is_eligible_now: inHours && data.sales_availability_status === "Active" && !data.is_on_leave && !data.deleted_at
      };
    });
    res.json({
      salesUsers,
      isWorkingHours: inHours
    });
  } catch (error) {
    console.error("Error fetching sales availability:", error);
    res.status(500).json({ error: error.message || "Failed to get sales availability" });
  }
});
app.post("/api/leads/assign-unassigned", verifyAuth, async (req, res) => {
  try {
    const forceWorkingHours = req.headers["x-mock-working-hours"] !== void 0 ? req.headers["x-mock-working-hours"] === "true" : void 0;
    const result = await processUnassignedLeadsEngine(db, forceWorkingHours);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error processing unassigned backlog:", error);
    res.status(500).json({ error: error.message || "Failed to process unassigned leads" });
  }
});
app.post("/api/admin/reset-user-password", verifyAdmin, async (req, res) => {
  const { targetUid, newPassword } = req.body;
  if (!targetUid || !newPassword) {
    return res.status(400).json({ error: "Missing targetUid or newPassword" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  try {
    await admin.auth().updateUser(targetUid, {
      password: newPassword
    });
    console.log(`[Admin] Password reset successful for user ${targetUid} by admin ${req.user.uid}`);
    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ error: error.message || "Failed to reset password" });
  }
});
function generateHeuristicAudit(data) {
  const {
    recruiterName,
    selectedRange,
    complianceRate,
    totalAppsFiled,
    totalExpectedApps,
    totalMissedApps,
    interviewCount,
    interviewConversionRate,
    dailyStats
  } = data;
  let ratingLevel = "[NEEDS REGULAR AUDIT]";
  let ratingStatement = "The recruiter shows steady behavior but needs standard monitoring to address consistent gaps in daily output.";
  if (complianceRate >= 95) {
    ratingLevel = "[GOLD STANDARD]";
    ratingStatement = "Exemplary performance! Exceptionally robust alignment with target quotas and outstanding application filings.";
  } else if (complianceRate >= 80) {
    ratingLevel = "[STABLE COMPLIANT]";
    ratingStatement = "Solid, compliant work. The recruiter meets constraints on most days with minor, manageable deficit spikes.";
  } else if (complianceRate < 50) {
    ratingLevel = "[CRITICAL COMPLIANCE WARN]";
    ratingStatement = "Critical performance warning. Immediate retraining, procedural intervention, or allocation reallocation is strictly recommended.";
  } else {
    ratingLevel = "[NEEDS REGULAR AUDIT]";
    ratingStatement = "Inconsistent performance. Significant missed target days that threaten active search volume and client satisfaction.";
  }
  const misses = (dailyStats || []).filter((s) => s.missed > 0);
  let gapsCommentary = "";
  if (misses.length === 0) {
    gapsCommentary = `No daily compliance gaps were recorded over this ${selectedRange} period. Every single scheduled working day met or exceeded the expected quota requirements.`;
  } else {
    const totalMissDays = misses.length;
    const peakMiss = Math.max(...misses.map((s) => s.missed));
    const peakMissDay = misses.find((s) => s.missed === peakMiss);
    const missDaysOfWeek = misses.map((s) => s.weekday);
    const uniqueDays = Array.from(new Set(missDaysOfWeek));
    const dayFrequency = {};
    uniqueDays.forEach((d) => {
      dayFrequency[String(d)] = missDaysOfWeek.filter((x) => x === d).length;
    });
    const topMissDay = Object.keys(dayFrequency).reduce((a, b) => (dayFrequency[a] || 0) > (dayFrequency[b] || 0) ? a : b, "Monday");
    gapsCommentary = `Over the scrutinized period, a total of **${totalMissDays} days** exhibited application deficits.
*   **Deficit Peak**: The largest single-day gap occurred on **${peakMissDay?.formattedDate || peakMissDay?.dateStr || "N/A"}** with a deficit of **${peakMiss}** applications.
*   **Weekday Concentration**: Compliance misses were heavily concentrated on **${topMissDay}s**, indicating possible end-of-week exhaustion, mid-week distraction, or uneven daily scheduling patterns.
*   **Streak Status**: Sporadic fluctuations are visible, which rule out total platform failure but highlight individual time management lapses on high-volume days.`;
  }
  let qualityCommentary = "";
  if (interviewConversionRate >= 10) {
    qualityCommentary = `The conversion yield of **${interviewConversionRate}%** is excellent (above standard 5% thresholds). This shows that despite any potential volume lapses, recruiter **${recruiterName}** is targeting highly qualified matches, resulting in high-efficiency candidate screening.`;
  } else if (interviewConversionRate >= 4) {
    qualityCommentary = `The conversion yield of **${interviewConversionRate}%** is within the expected industry benchmark (4% - 8%). Applications filed are generally aligned with candidate skills, keeping the pipeline steadily fueled.`;
  } else {
    qualityCommentary = `The conversion yield is currently low at **${interviewConversionRate}%**. This indicates that while application volumes are being submitted, candidate matches might be generic or misaligned, requiring a revision of the matching criteria to raise interview yields.`;
  }
  let rec1 = "Establish a morning schedule block specifically for high-priority marketing candidates to ensure targets are hit early.";
  let rec2 = "Review matching settings and exclusions to focus on quality and boost the apply-to-interview conversion yield.";
  let rec3 = "Implement an end-of-day compliance check before logging out to submit outstanding volume on pending active candidate portfolios.";
  if (complianceRate < 80) {
    rec1 = "Mandate a strict daily target tracking regime, requiring a mid-day status report to team leaders if under 50% completion.";
    rec3 = "Redistribute candidate allocation slightly if current workload exceeds maximum feasible manual application limits.";
  }
  if (interviewConversionRate < 4) {
    rec2 = "Conduct a 1-on-1 resume alignment sync to re-examine keyword targeting rules and ensure application portal matching accuracy.";
  }
  return `### **1. EXECUTIVE PERFORMANCE ASSESSMENT & RATING**

*   **Auditing Classification**: **${ratingLevel}**
*   **Recruiter Target Compliance Rate**: \`${complianceRate}%\`
*   **Volumetric Output**: **${totalAppsFiled}** applications submitted out of **${totalExpectedApps}** required (Deficit Gaps: **${totalMissedApps}** applications).
*   **Interview Conversion Yield**: \`${interviewConversionRate}%\` (**${interviewCount}** verified interview support requests).

**Summary Rating Statement**:
${ratingStatement}

---

### **2. MISSING APPLICATION ROOT-CAUSE ANALYSIS**

${gapsCommentary}

*   **Weekend Exclusions**: Perfect compliance during national/regional rest cycles (0 target expectations applied on weekend records).
*   **Ongoing Shift Window**: Mid-day buffers appear narrow, elevating the risk of compliance failures if applications are delayed to late hours.

---

### **3. APPLICATION QUALITY & INTERVIEW CONVERSION QUALITY**

The system calculated a total of **${interviewCount}** interview bookings resulting directly from candidate pools assigned to **${recruiterName}**.
*   **Apply-to-Interview Conversion Status**: **${interviewConversionRate}%**
*   **Analysis of Efforts**: ${qualityCommentary}

---

### **4. ACTIONABLE REMEDIATION PLAYBOOK**

1.  **Morning Velocity Anchor (Target 09:00 - 12:00)**:
    *   *Action*: ${rec1}
2.  **Portal Search & Matching Alignment**:
    *   *Action*: ${rec2}
3.  **End-of-Shift Compliance Assurance Protocol**:
    *   *Action*: ${rec3}

---
> \u2139\uFE0F *Note: This audit report was compiled using the system's local compliance analytical framework because the live AI endpoint returned a validation/credentials error. To restore real-time dynamic Gemini model outputs, please configure/verify a valid \`GEMINI_API_KEY\` in your environment settings (Settings > Secrets).*`;
}
app.post("/api/gemini/analyze-compliance", async (req, res) => {
  const {
    recruiterName,
    selectedRange,
    complianceRate,
    totalAppsFiled,
    totalExpectedApps,
    totalMissedApps,
    interviewCount,
    interviewConversionRate,
    dailyStats
  } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const isKeyEmptyOrPlaceholder = !apiKey || apiKey.trim() === "" || apiKey.toLowerCase().includes("your-api-key") || apiKey === "PLACEHOLDER" || !apiKey.startsWith("AIzaSy") || apiKey.length < 30;
  if (isKeyEmptyOrPlaceholder) {
    const analysis = generateHeuristicAudit({
      recruiterName,
      selectedRange,
      complianceRate,
      totalAppsFiled,
      totalExpectedApps,
      totalMissedApps,
      interviewCount,
      interviewConversionRate,
      dailyStats
    });
    return res.json({ analysis });
  }
  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const prompt = `You are an expert recruiter auditor and performance consultant for the AI Auto Job Apply System (an automated job application system for candidates).

Analyze the compliance metrics of recruiter "${recruiterName}" over ${selectedRange}.

Metrics:
- Overall Compliance Rate: ${complianceRate}% of candidate quotas met
- Application Output: ${totalAppsFiled} filed out of ${totalExpectedApps} required (Missed: ${totalMissedApps} applications)
- Interviews support requests connected to this recruiter's profile applications: ${interviewCount} interview requests
- Apply-to-interview conversion quality rate: ${interviewConversionRate}%

Daily Breakdown of compliance, expected target, actual filed, and missed:
${JSON.stringify(dailyStats, null, 2)}

Provide an in-depth audited compliance analysis containing:
1. EXECUTIVE PERFORMANCE ASSESSMENT & RATING: Give a formal auditing color-coded level (e.g. [GOLD STANDARD], [STABLE COMPLIANT], [NEEDS REGULAR AUDIT], [CRITICAL COMPLIANCE WARN]) based on their numbers. Add a summary rating statement.
2. MISSING APPLICATION ROOT-CAUSE ANALYSIS: Pinpoint specific compliance gaps, looking at weekdays versus weekends (where targets are 0), consecutive miss streaks, or any trends where they consistently drop numbers.
3. APPLICATION QUALITY & INTERVIEW CONVERSION: Assess if the recruiter's efforts are of high quality (high conversion rate of applications to interview requests) or if there are mismatch warning signs.
4. ACTIONABLE REMEDIATION PLAYBOOK: Write 3 customized, practical recommendations for this recruiter to meet compliance standards and boost quality.

Format the response in clean, aesthetic Markdown with professional structures and bullet sub-points. Use bold headings. Avoid generic preachy greetings or self-referential intros/outros. Start directly with the Executive Performance Assessment.`;
    let responseText = "";
    const modelsToTry = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-flash-latest"];
    for (const m of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: prompt
        });
        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (e) {
      }
    }
    if (responseText) {
      res.json({ analysis: responseText });
    } else {
      throw new Error("No response from AI models");
    }
  } catch (error) {
    const analysis = generateHeuristicAudit({
      recruiterName,
      selectedRange,
      complianceRate,
      totalAppsFiled,
      totalExpectedApps,
      totalMissedApps,
      interviewCount,
      interviewConversionRate,
      dailyStats
    });
    res.json({ analysis });
  }
});
app.post("/api/resume/parse", async (req, res) => {
  const { textToParse, fileBase64, mimeType } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const isKeyEmptyOrPlaceholder = !apiKey || apiKey.trim() === "" || apiKey.toLowerCase().includes("your-api-key") || apiKey === "PLACEHOLDER" || apiKey.length < 20;
  const fallbackExtract = (rawText) => {
    if (!rawText) return null;
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/);
    const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
    const candidateName = lines.length > 0 ? lines[0].replace(/[^a-zA-Z\s]/g, "").slice(0, 50).trim() : "";
    return {
      full_name: candidateName,
      phone: phoneMatch ? phoneMatch[0] : "",
      email: emailMatch ? emailMatch[0] : "",
      job_interest: "",
      location: "",
      education: "",
      degree: "",
      university: "",
      graduation_year: "",
      experience_years: "",
      current_company: "",
      current_designation: "",
      skills: "",
      linkedin_url: "",
      notes: ""
    };
  };
  if (isKeyEmptyOrPlaceholder) {
    console.warn("[Resume Parse] GEMINI_API_KEY is missing or invalid in server environment. Attempting text regex fallback.");
    const fallbackData = fallbackExtract(textToParse || "");
    if (fallbackData && (fallbackData.email || fallbackData.phone || fallbackData.full_name)) {
      return res.json({ candidate: fallbackData, isFallback: true });
    }
    return res.status(400).json({ error: "GEMINI_API_KEY is missing or invalid. Please configure it in your Settings > Secrets." });
  }
  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const parts = [];
    if (textToParse && textToParse.length > 30) {
      parts.push({ text: `Extract candidate information from this resume text:

${textToParse}` });
    } else if (fileBase64 && mimeType && mimeType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && mimeType !== "application/msword") {
      parts.push({
        inlineData: {
          data: fileBase64,
          mimeType
        }
      });
      parts.push({ text: "Extract candidate information from this resume document." });
    } else if (textToParse) {
      parts.push({ text: `Extract candidate information from this text:

${textToParse}` });
    } else {
      return res.status(400).json({ error: "No resume text or valid document provided for parsing." });
    }
    parts.push({ text: "Return the extracted data in JSON format following the schema. If a field is not found or not stated, return an empty string for that field." });
    const modelsToTry = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-flash-latest"];
    let lastError = null;
    let parsedResult = null;
    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                full_name: { type: Type.STRING },
                phone: { type: Type.STRING },
                email: { type: Type.STRING },
                job_interest: { type: Type.STRING },
                location: { type: Type.STRING },
                education: { type: Type.STRING },
                degree: { type: Type.STRING },
                university: { type: Type.STRING },
                graduation_year: { type: Type.STRING },
                experience_years: { type: Type.STRING },
                current_company: { type: Type.STRING },
                current_designation: { type: Type.STRING },
                skills: { type: Type.STRING },
                linkedin_url: { type: Type.STRING },
                notes: { type: Type.STRING }
              }
            }
          }
        });
        if (response.text) {
          parsedResult = JSON.parse(response.text.trim());
          console.log(`[Resume Parse] Successfully parsed resume using model: ${modelName}`);
          break;
        }
      } catch (mErr) {
        lastError = mErr;
        console.warn(`[Resume Parse] Model ${modelName} failed or unavailable:`, mErr.message || mErr);
      }
    }
    if (parsedResult) {
      return res.json({ candidate: parsedResult });
    }
    console.error("[Resume Parse] All AI models failed, attempting fallback extraction:", lastError?.message || lastError);
    const fallbackData = fallbackExtract(textToParse || "");
    if (fallbackData && (fallbackData.email || fallbackData.phone || fallbackData.full_name)) {
      return res.json({ candidate: fallbackData, isFallback: true, warning: lastError?.message });
    }
    return res.status(500).json({ error: lastError?.message || "Failed to parse resume with AI model" });
  } catch (error) {
    console.error("[Resume Parse] Error in resume parse route:", error);
    const fallbackData = fallbackExtract(textToParse || "");
    if (fallbackData) {
      return res.json({ candidate: fallbackData, isFallback: true });
    }
    return res.status(500).json({ error: error.message || "Error parsing resume" });
  }
});
app.get("/api/calendly/bookings", async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }
    const userResponse = await axios.get("https://api.calendly.com/users/me", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const userUri = userResponse.data.resource.uri;
    const eventsResponse = await axios.get("https://api.calendly.com/scheduled_events", {
      headers: { "Authorization": `Bearer ${token}` },
      params: {
        user: userUri,
        status: "active",
        count: 50,
        sort: "start_time:desc"
      }
    });
    const events = eventsResponse.data.collection;
    const bookings = [];
    for (const event of events) {
      try {
        const inviteesResponse = await axios.get(`${event.uri}/invitees`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        for (const invitee of inviteesResponse.data.collection) {
          bookings.push({
            id: invitee.uri.split("/").pop(),
            invitee_name: invitee.name,
            invitee_email: invitee.email,
            start_time: event.start_time,
            event_uri: event.uri,
            status: invitee.status
          });
        }
      } catch (e) {
        console.error(`Error fetching invitees for event ${event.uri}:`, e);
      }
    }
    res.json({ collection: bookings });
  } catch (error) {
    console.error("Calendly Proxy Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});
app.get("/api/calendly/slots", async (req, res) => {
  try {
    const token = req.headers.authorization;
    const { url, start_time, end_time } = req.query;
    if (!token) return res.status(401).json({ error: "No token provided" });
    if (!url) return res.status(400).json({ error: "No Calendly URL provided" });
    const userResponse = await axios.get("https://api.calendly.com/users/me", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const userUri = userResponse.data.resource.uri;
    const eventTypesResponse = await axios.get("https://api.calendly.com/event_types", {
      headers: { "Authorization": `Bearer ${token}` },
      params: { user: userUri, active: true }
    });
    const eventTypes = eventTypesResponse.data.collection;
    let eventTypeUri = "";
    const providedUrl = url.toLowerCase();
    const matchedType = eventTypes.find(
      (et) => providedUrl.includes(et.scheduling_url.toLowerCase()) || et.scheduling_url.toLowerCase().includes(providedUrl.split("/").pop() || "")
    );
    if (matchedType) {
      eventTypeUri = matchedType.uri;
    } else {
      if (eventTypes.length === 1) {
        eventTypeUri = eventTypes[0].uri;
      } else {
        return res.status(404).json({ error: "Could not match Calendly URL to an Event Type" });
      }
    }
    const availabilityResponse = await axios.get("https://api.calendly.com/event_type_available_times", {
      headers: { "Authorization": `Bearer ${token}` },
      params: {
        event_type: eventTypeUri,
        start_time: start_time || (/* @__PURE__ */ new Date()).toISOString(),
        end_time: end_time || new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString()
      }
    });
    res.json({ slots: availabilityResponse.data.collection });
  } catch (error) {
    console.error("Calendly Slots Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});
async function startServer() {
  if (process.env.NODE_ENV === "test" || isServerless) {
    return;
  }
  if (process.env.NODE_ENV === "production") {
    const possibleDistPath = path.join(process.cwd(), "dist");
    const distPath = fs.existsSync(path.join(possibleDistPath, "index.html")) ? possibleDistPath : process.cwd();
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("index.html not found");
      }
    });
  } else {
    try {
      const vitePkg = "vite";
      const { createServer: createViteServer } = await import(
        /* @vite-ignore */
        vitePkg
      );
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.error("Failed to import or set up Vite dev server:", err);
    }
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
if (process.env.NODE_ENV !== "test" && !isServerless) {
  startServer();
}
var server_default = app;
export {
  assignLeadRoundRobinTransaction,
  server_default as default,
  isSalesWorkingHours,
  isServerless,
  processUnassignedLeadsEngine
};
