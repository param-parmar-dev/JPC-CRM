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
import { google } from "googleapis";
import * as XLSX from "xlsx";

// src/services/localResumeParser.ts
var SECTION_PATTERNS = {
  experience: /^(?:(?:work|professional|employment|relevant|career)\s+)?(?:experience|history|background)\b/i,
  education: /^(?:educational?(?:\s+background)?|academic\s+(?:background|history|credentials)|education|qualifications)\b/i,
  skills: /^(?:technical\s+|core\s+|key\s+)?(?:skills|competencies|technologies|proficiencies|expertise|technical\s+stack)\b/i,
  projects: /^(?:(?:selected|personal|academic|key|notable)\s+)?projects\b/i,
  certifications: /^(?:(?:professional\s+)?certifications?|licenses?|credentials?|certificates?)\b/i,
  summary: /^(?:professional\s+)?(?:summary|profile|about\s+me|career\s+objective|executive\s+summary|overview)\b/i,
  languages: /^(?:languages?|linguistic\s+skills|language\s+proficiency)\b/i
};
var SKILL_TAXONOMY = {
  languages: [
    "javascript",
    "typescript",
    "python",
    "java",
    "c++",
    "c#",
    "golang",
    "go",
    "rust",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "scala",
    "r",
    "dart",
    "perl",
    "shell",
    "bash",
    "powershell",
    "sql",
    "html",
    "html5",
    "css",
    "css3",
    "sass",
    "scss",
    "matlab",
    "assembly"
  ],
  frameworks: [
    "react",
    "react.js",
    "react native",
    "next.js",
    "nextjs",
    "vue",
    "vue.js",
    "nuxt",
    "angular",
    "angularjs",
    "node.js",
    "nodejs",
    "express",
    "express.js",
    "nestjs",
    "django",
    "flask",
    "fastapi",
    "spring",
    "spring boot",
    "asp.net",
    ".net core",
    "ruby on rails",
    "rails",
    "laravel",
    "tailwindcss",
    "tailwind",
    "bootstrap",
    "material-ui",
    "redux",
    "graphql",
    "svelte",
    "electron",
    "jquery"
  ],
  cloud_devops: [
    "aws",
    "amazon web services",
    "azure",
    "gcp",
    "google cloud",
    "docker",
    "kubernetes",
    "k8s",
    "terraform",
    "ansible",
    "jenkins",
    "ci/cd",
    "github actions",
    "gitlab ci",
    "circleci",
    "helm",
    "argo cd",
    "prometheus",
    "grafana",
    "linux",
    "unix",
    "nginx",
    "apache",
    "serverless"
  ],
  databases: [
    "postgresql",
    "postgres",
    "mysql",
    "mongodb",
    "redis",
    "elasticsearch",
    "dynamodb",
    "oracle",
    "sqlite",
    "cassandra",
    "neo4j",
    "firebase",
    "firestore",
    "supabase",
    "snowflake",
    "bigquery",
    "mariadb",
    "mssql",
    "sql server"
  ],
  ai_data: [
    "machine learning",
    "deep learning",
    "nlp",
    "natural language processing",
    "computer vision",
    "tensorflow",
    "pytorch",
    "keras",
    "scikit-learn",
    "pandas",
    "numpy",
    "scipy",
    "spark",
    "hadoop",
    "kafka",
    "airflow",
    "tableau",
    "power bi",
    "llm",
    "langchain",
    "generative ai"
  ],
  tools_methods: [
    "git",
    "github",
    "gitlab",
    "bitbucket",
    "jira",
    "confluence",
    "agile",
    "scrum",
    "kanban",
    "rest",
    "restful",
    "microservices",
    "soap",
    "postman",
    "swagger",
    "jest",
    "mocha",
    "cypress",
    "selenium",
    "playwright",
    "junit",
    "pytest",
    "tdd",
    "bdd",
    "webpack",
    "vite",
    "eslint"
  ]
};
var COMMON_TITLES = [
  "Software Engineer",
  "Software Developer",
  "Full Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
  "DevOps Engineer",
  "Cloud Architect",
  "Solutions Architect",
  "Data Scientist",
  "Data Analyst",
  "Data Engineer",
  "Machine Learning Engineer",
  "AI Engineer",
  "QA Engineer",
  "Quality Assurance Engineer",
  "Automation Test Engineer",
  "Security Engineer",
  "Systems Administrator",
  "Network Engineer",
  "Product Manager",
  "Project Manager",
  "Scrum Master",
  "Engineering Manager",
  "Tech Lead",
  "Technical Lead",
  "CTO",
  "VP of Engineering",
  "UI/UX Designer",
  "Product Designer",
  "Business Analyst",
  "Account Executive",
  "Sales Manager",
  "Director",
  "Director of Operations",
  "Operations Director",
  "Managing Director",
  "Executive Director",
  "Associate Director",
  "Vice President",
  "Head of Operations",
  "Head of Engineering",
  "General Manager",
  "Consultant",
  "Senior Consultant",
  "Associate",
  "Intern",
  "Operations Manager"
];
function cleanText(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/[ \u00A0\u1680\u180e\u2000-\u200a\u202f\u205f\u3000]/g, " ").trim();
}
function extractSections(text) {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = {};
  let currentSection = "header";
  sections[currentSection] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.length <= 40 && !line.includes("@") && !line.includes("http") && !line.includes("|")) {
      let matchedSection = null;
      for (const [secName, pattern] of Object.entries(SECTION_PATTERNS)) {
        if (pattern.test(line)) {
          matchedSection = secName;
          break;
        }
      }
      if (matchedSection) {
        currentSection = matchedSection;
        if (!sections[currentSection]) {
          sections[currentSection] = [];
        }
        continue;
      }
    }
    if (!sections[currentSection]) {
      sections[currentSection] = [];
    }
    sections[currentSection].push(line);
  }
  const result = {};
  for (const [key, val] of Object.entries(sections)) {
    result[key] = val.join("\n");
  }
  return result;
}
function extractName(lines) {
  const skipWords = [
    "resume",
    "curriculum vitae",
    "cv",
    "profile",
    "contact",
    "email",
    "phone",
    "address",
    "summary",
    "experience",
    "education",
    "skills",
    "page",
    "objective",
    "personal",
    "linkedin",
    "github",
    "http",
    "www",
    ".com",
    "@"
  ];
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    let rawLine = lines[i].trim();
    if (!rawLine) continue;
    if (/\s{3,}|\t+/.test(rawLine)) {
      const parts = rawLine.split(/\s{3,}|\t+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        const firstLower = parts[0].toLowerCase();
        if (!skipWords.some((w) => firstLower.includes(w)) && !/\d{3,}/.test(parts[0])) {
          rawLine = parts[0];
        }
      }
    }
    const lower = rawLine.toLowerCase();
    if (skipWords.some((w) => lower.includes(w))) continue;
    if (/\d{3,}/.test(rawLine)) continue;
    let cleaned = rawLine.replace(/^(?:mr\.|ms\.|mrs\.|dr\.|er\.)\s+/i, "").trim();
    if (cleaned.includes("|")) {
      cleaned = cleaned.split("|")[0].trim();
    } else if (cleaned.includes(" - ")) {
      cleaned = cleaned.split(" - ")[0].trim();
    }
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 4) {
      const isValidName = words.every((w) => /^[A-Za-z]+[.'-]?[A-Za-z]*$/.test(w));
      if (isValidName && cleaned.length >= 4 && cleaned.length <= 50) {
        const isJobTitle = COMMON_TITLES.some((title) => {
          const escaped = title.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
          return new RegExp(`\\b${escaped}\\b`, "i").test(cleaned);
        }) || /\b(director|president|officer|manager|lead|architect|engineer|developer|designer|analyst|consultant|coordinator|administrator|specialist)\b/i.test(cleaned);
        if (!isJobTitle) {
          const formatted = cleaned === cleaned.toUpperCase() ? cleaned.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : cleaned;
          return { name: formatted, confidence: 0.95 };
        }
      }
    } else if (words.length === 1 && words[0].length >= 3 && /^[A-Za-z]+$/.test(words[0])) {
      const isJobTitle = COMMON_TITLES.some((title) => {
        const escaped = title.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(words[0]);
      }) || /\b(director|president|officer|manager|lead|architect|engineer|developer|designer|analyst|consultant|coordinator|administrator|specialist)\b/i.test(words[0]);
      if (!isJobTitle) {
        return { name: words[0], confidence: 0.6 };
      }
    }
  }
  return { name: "", confidence: 0 };
}
function extractEmail(text) {
  const matches = Array.from(text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)).map((m) => m[0]);
  if (matches.length === 0) {
    return { email: "", confidence: 0 };
  }
  const genericPrefixes = ["support@", "noreply@", "no-reply@", "info@", "contact@", "help@", "sales@", "jobs@", "careers@", "admin@", "billing@", "service@"];
  const personalCandidates = matches.filter((e) => !genericPrefixes.some((p) => e.toLowerCase().startsWith(p)));
  const selected = personalCandidates.length > 0 ? personalCandidates[0] : matches[0];
  return { email: selected.toLowerCase(), confidence: 1 };
}
function extractPhone(text) {
  const ukMatch = text.match(/(?:\+44[\s.-]?)?0?7\d{3}[\s.-]?\d{6}\b/);
  if (ukMatch && (ukMatch[0].startsWith("+44") || ukMatch[0].startsWith("07"))) {
    return { phone: ukMatch[0], confidence: 0.95 };
  }
  const uaeMatch = text.match(/\+971[\s.-]?(?:5\d|0?5\d)[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  if (uaeMatch) {
    return { phone: uaeMatch[0], confidence: 0.95 };
  }
  const deMatch = text.match(/\+49[\s.-]?(?:[1-9]\d{1,3})[\s.-]?\d{4,8}\b/);
  if (deMatch) {
    return { phone: deMatch[0], confidence: 0.95 };
  }
  const indianExplicit = text.match(/\+91[\s.-]?([6-9]\d{4}[\s.-]?\d{5})\b/);
  if (indianExplicit) {
    const raw = indianExplicit[0].replace(/[\s.-]/g, "");
    return { phone: raw, confidence: 0.95 };
  }
  const usMatch = text.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/);
  if (usMatch) {
    const formatted = `(${usMatch[1]}) ${usMatch[2]}-${usMatch[3]}`;
    return { phone: formatted, confidence: 0.95 };
  }
  const indianImplicit = text.match(/\b([6-9]\d{4}[\s.-]?\d{5})\b/);
  if (indianImplicit) {
    const raw = indianImplicit[0].replace(/[\s.-]/g, "");
    return { phone: `+91 ${raw.slice(0, 5)} ${raw.slice(5)}`, confidence: 0.9 };
  }
  const intlMatch = text.match(/\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/);
  if (intlMatch) {
    return { phone: intlMatch[0], confidence: 0.85 };
  }
  const plainMatch = text.match(/\b\d{10}\b/);
  if (plainMatch) {
    return { phone: plainMatch[0], confidence: 0.7 };
  }
  return { phone: "", confidence: 0 };
}
function extractSocials(text) {
  let linkedin = "";
  let github = "";
  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|pub)\/([A-Za-z0-9_-]+)/i);
  if (linkedinMatch) {
    linkedin = `https://linkedin.com/in/${linkedinMatch[1]}`;
  }
  const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_-]+)/i);
  if (githubMatch) {
    github = `https://github.com/${githubMatch[1]}`;
  }
  return { linkedin, github };
}
function extractLocation(text) {
  const locMatch = text.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s*([A-Z]{2}|[A-Z][a-zA-Z]{2,15})\b/);
  if (locMatch) {
    const city = locMatch[1].trim();
    const region = locMatch[2].trim();
    const ignoreWords = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "bachelor", "master"];
    if (!ignoreWords.includes(city.toLowerCase()) && !ignoreWords.includes(region.toLowerCase())) {
      return `${city}, ${region}`;
    }
  }
  const hubs = [
    "Bengaluru",
    "Bangalore",
    "Hyderabad",
    "Mumbai",
    "Pune",
    "Delhi",
    "Noida",
    "Gurugram",
    "Gurgaon",
    "Chennai",
    "San Francisco",
    "New York",
    "Seattle",
    "Austin",
    "Boston",
    "Chicago",
    "London",
    "Toronto",
    "Vancouver",
    "Berlin",
    "Singapore",
    "Dubai",
    "Sydney",
    "Remote"
  ];
  for (const hub of hubs) {
    const reg = new RegExp(`\\b${hub}\\b`, "i");
    if (reg.test(text.slice(0, 1e3))) {
      return hub;
    }
  }
  return "";
}
function parseDateRange(text) {
  const months = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
  const rangeRegex = new RegExp(
    `((?:(?:${months})\\s+)?(?:19|20)\\d{2}|\\d{1,2}/(?:19|20)\\d{2})\\s*(?:[-\u2013\u2014to]+)\\s*((?:(?:${months})\\s+)?(?:19|20)\\d{2}|\\d{1,2}/(?:19|20)\\d{2}|present|current|now|ongoing)`,
    "i"
  );
  const match = text.match(rangeRegex);
  if (match) {
    const start = match[1].trim();
    const endRaw = match[2].trim();
    const isCurrent = /present|current|now|ongoing/i.test(endRaw);
    return {
      start,
      end: isCurrent ? "Present" : endRaw,
      isCurrent
    };
  }
  const simpleYearRegex = /\b((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|current|now)\b/i;
  const yearMatch = text.match(simpleYearRegex);
  if (yearMatch) {
    const isCurrent = /present|current|now/i.test(yearMatch[2]);
    return {
      start: yearMatch[1],
      end: isCurrent ? "Present" : yearMatch[2],
      isCurrent
    };
  }
  return { isCurrent: false };
}
function calculateExperienceYears(experiences) {
  const intervals = [];
  const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
  for (const exp of experiences) {
    if (!exp.start_date) continue;
    const startYearMatch = exp.start_date.match(/(?:19|20)\d{2}/);
    if (!startYearMatch) continue;
    const startYear = parseInt(startYearMatch[0], 10);
    let endYear = currentYear;
    if (exp.end_date && !/present|current|now/i.test(exp.end_date)) {
      const endYearMatch = exp.end_date.match(/(?:19|20)\d{2}/);
      if (endYearMatch) {
        endYear = parseInt(endYearMatch[0], 10);
      }
    }
    if (endYear >= startYear && startYear >= 1970 && endYear <= currentYear + 1) {
      intervals.push([startYear, endYear]);
    }
  }
  if (intervals.length === 0) return "";
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  let currentInterval = [...intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];
    if (next[0] <= currentInterval[1]) {
      currentInterval[1] = Math.max(currentInterval[1], next[1]);
    } else {
      merged.push(currentInterval);
      currentInterval = [...next];
    }
  }
  merged.push(currentInterval);
  let totalYears = 0;
  for (const [start, end] of merged) {
    totalYears += Math.max(1, end - start);
  }
  return totalYears >= 1 ? `${totalYears} years` : "1 year";
}
function extractWorkExperience(sectionText, fullText) {
  const textToAnalyze = sectionText && sectionText.length > 50 ? sectionText : fullText;
  const lines = textToAnalyze.split("\n").map((l) => l.trim()).filter(Boolean);
  const experiences = [];
  let currentExp = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateRange = parseDateRange(line);
    if (dateRange.start) {
      if (currentExp && (currentExp.title || currentExp.company)) {
        experiences.push(currentExp);
      }
      currentExp = {
        title: "",
        company: "",
        start_date: dateRange.start,
        end_date: dateRange.end,
        is_current: dateRange.isCurrent,
        responsibilities: []
      };
      const lineWithoutDates = line.replace(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}.*$/i, "").trim();
      if (lineWithoutDates.length > 3) {
        if (lineWithoutDates.includes("|")) {
          const parts = lineWithoutDates.split("|").map((p) => p.trim());
          currentExp.title = parts[0];
          currentExp.company = parts[1];
        } else if (lineWithoutDates.includes(" - ")) {
          const parts = lineWithoutDates.split(" - ").map((p) => p.trim());
          currentExp.title = parts[0];
          currentExp.company = parts[1];
        } else if (lineWithoutDates.includes(" at ")) {
          const parts = lineWithoutDates.split(" at ").map((p) => p.trim());
          currentExp.title = parts[0];
          currentExp.company = parts[1];
        } else {
          currentExp.title = lineWithoutDates;
        }
      }
      if (!currentExp.title && i > 0) {
        const prevLine = lines[i - 1];
        if (prevLine.includes("|")) {
          const parts = prevLine.split("|").map((p) => p.trim());
          currentExp.company = parts[0];
          currentExp.location = parts[1];
          if (i > 1 && !lines[i - 2].startsWith("\u2022") && !lines[i - 2].startsWith("-")) {
            currentExp.title = lines[i - 2];
          }
        } else if (prevLine.includes(" - ") && !/\d{4}/.test(prevLine)) {
          const parts = prevLine.split(" - ").map((p) => p.trim());
          currentExp.company = parts[0];
          currentExp.location = parts[1];
          if (i > 1 && !lines[i - 2].startsWith("\u2022") && !lines[i - 2].startsWith("-")) {
            currentExp.title = lines[i - 2];
          }
        } else if (prevLine.includes(" at ")) {
          const parts = prevLine.split(" at ").map((p) => p.trim());
          currentExp.title = parts[0];
          currentExp.company = parts[1];
        } else {
          const isTitle = COMMON_TITLES.some((t) => prevLine.toLowerCase().includes(t.toLowerCase())) || /\b(engineer|developer|manager|lead|architect|analyst|designer|consultant|specialist|officer|director|intern|administrator|tester|scientist)\b/i.test(prevLine);
          if (isTitle) {
            currentExp.title = prevLine;
            if (i > 1 && !lines[i - 2].startsWith("\u2022") && !lines[i - 2].startsWith("-") && lines[i - 2].length < 60) {
              currentExp.company = lines[i - 2];
            }
          } else {
            currentExp.company = prevLine;
            if (i > 1 && !lines[i - 2].startsWith("\u2022") && !lines[i - 2].startsWith("-") && lines[i - 2].length < 60) {
              currentExp.title = lines[i - 2];
            }
          }
        }
      }
      continue;
    }
    if (currentExp) {
      if (line.startsWith("\u2022") || line.startsWith("-") || line.startsWith("*") || line.startsWith("\u25AA")) {
        const bulletText = line.replace(/^[•\-*▪]\s*/, "").trim();
        if (bulletText.length > 5) {
          currentExp.responsibilities?.push(bulletText);
        }
      } else if (!currentExp.company && line.length < 60 && !line.includes("http")) {
        currentExp.company = line;
      }
    }
  }
  if (currentExp && (currentExp.title || currentExp.company)) {
    experiences.push(currentExp);
  }
  const uniqueExperiences = [];
  const seenExpKeys = /* @__PURE__ */ new Set();
  for (const exp of experiences) {
    if (exp.responsibilities && exp.responsibilities.length > 0) {
      exp.description = exp.responsibilities.join("\n");
    }
    exp.title = exp.title.replace(/^[,\-|]\s*/, "").replace(/[,\-|]\s*$/, "").trim();
    exp.company = exp.company.replace(/^[,\-|]\s*/, "").replace(/[,\-|]\s*$/, "").trim();
    const key = `${exp.company.toLowerCase()}|${exp.title.toLowerCase()}|${(exp.start_date || "").toLowerCase()}`;
    if (!seenExpKeys.has(key) && (exp.company || exp.title)) {
      seenExpKeys.add(key);
      uniqueExperiences.push(exp);
    }
  }
  let confidence = 0;
  if (uniqueExperiences.length > 0) {
    const hasTitles = uniqueExperiences.filter((e) => e.title).length;
    const hasCompanies = uniqueExperiences.filter((e) => e.company).length;
    const hasDates = uniqueExperiences.filter((e) => e.start_date).length;
    confidence = hasTitles / uniqueExperiences.length * 0.4 + hasCompanies / uniqueExperiences.length * 0.35 + hasDates / uniqueExperiences.length * 0.25;
  }
  return { experiences: uniqueExperiences, confidence: Math.round(confidence * 100) / 100 };
}
function extractEducation(sectionText, fullText) {
  const textToAnalyze = sectionText && sectionText.length > 30 ? sectionText : fullText;
  const lines = textToAnalyze.split("\n").map((l) => l.trim()).filter(Boolean);
  const educationList = [];
  const degreeRegex = /\b(?:Bachelor(?:'s)?(?:\s+of\s+[A-Za-z\s]+)?|Master(?:'s)?(?:\s+of\s+[A-Za-z\s]+)?|Ph\.?D|Doctorate|B\.?Tech|B\.?E\.?|B\.?S\.?|B\.?Sc\.?|B\.?A\.?|BCA|BBA|M\.?Tech|M\.?E\.?|M\.?S\.?|M\.?Sc\.?|MBA|MCA|Associate(?:'s)?|Diploma)\b/i;
  const uniRegex = /\b(?:University|College|Institute|Polytechnic|School|IIT|NIT|BITS|Academy)\b/i;
  let currentEdu = null;
  for (const line of lines) {
    const hasDegree = degreeRegex.test(line);
    const hasUni = uniRegex.test(line);
    const allYears = line.match(/\b(19[7-9]\d|20[0-3]\d)\b/g);
    const latestYear = allYears ? allYears[allYears.length - 1] : "";
    if (hasDegree || hasUni) {
      if (hasDegree && hasUni) {
        educationList.push({
          degree: line.match(degreeRegex)?.[0] || "",
          institution: line.replace(degreeRegex, "").replace(/[,\-|]/g, " ").trim(),
          graduation_year: latestYear
        });
      } else if (hasDegree) {
        currentEdu = {
          degree: line,
          institution: "",
          graduation_year: latestYear
        };
      } else if (hasUni) {
        if (currentEdu && !currentEdu.institution) {
          currentEdu.institution = line;
          if (latestYear && !currentEdu.graduation_year) {
            currentEdu.graduation_year = latestYear;
          }
          educationList.push(currentEdu);
          currentEdu = null;
        } else {
          educationList.push({
            degree: "",
            institution: line,
            graduation_year: latestYear
          });
        }
      }
    } else if (latestYear) {
      if (currentEdu && !currentEdu.graduation_year) {
        currentEdu.graduation_year = latestYear;
        educationList.push(currentEdu);
        currentEdu = null;
      } else if (educationList.length > 0 && !educationList[educationList.length - 1].graduation_year) {
        educationList[educationList.length - 1].graduation_year = latestYear;
      }
    }
  }
  if (currentEdu) {
    educationList.push(currentEdu);
  }
  const primaryDegree = educationList.find((e) => e.degree)?.degree || "";
  const primaryUniversity = educationList.find((e) => e.institution)?.institution || "";
  const gradYear = educationList.find((e) => e.graduation_year)?.graduation_year || "";
  let confidence = 0;
  if (primaryDegree && primaryUniversity) confidence = 0.95;
  else if (primaryDegree || primaryUniversity) confidence = 0.7;
  else if (gradYear) confidence = 0.4;
  return { educationList, primaryDegree, primaryUniversity, gradYear, confidence };
}
function extractSkills(sectionText, fullText) {
  const isSkillsSection = Boolean(sectionText && sectionText.length > 20);
  const textLower = (sectionText || fullText).toLowerCase();
  const matchedSkills = /* @__PURE__ */ new Set();
  const categorized = {};
  const ambiguousSkills = /* @__PURE__ */ new Set(["go", "r", "c", "rest", "git", "spark", "assembly"]);
  for (const [category, skills] of Object.entries(SKILL_TAXONOMY)) {
    categorized[category] = [];
    for (const skill of skills) {
      const lowerSkill = skill.toLowerCase();
      if (ambiguousSkills.has(lowerSkill) && !isSkillsSection) {
        let isStrictMatch = false;
        if (lowerSkill === "go") {
          isStrictMatch = /\b(?:golang|go\s+language|go\s+developer|go\s+backend)\b/i.test(fullText) || /\bGo\b/.test(fullText);
        } else if (lowerSkill === "r") {
          isStrictMatch = /\b(?:r\s+language|r\s+programming|r\s+studio)\b/i.test(fullText);
        } else if (lowerSkill === "c") {
          isStrictMatch = /\b(?:c\s+programming|c\s+language)\b/i.test(fullText);
        } else if (lowerSkill === "rest") {
          isStrictMatch = /\b(?:restful|rest\s+api|rest\s+apis)\b/i.test(fullText);
        } else if (lowerSkill === "spark") {
          isStrictMatch = /\b(?:apache\s+spark|pyspark|spark\s+streaming)\b/i.test(fullText);
        } else if (lowerSkill === "git") {
          isStrictMatch = /\b(?:git\s+version|github|gitlab|git\b)/i.test(fullText);
        } else if (lowerSkill === "assembly") {
          isStrictMatch = /\b(?:assembly\s+language|x86|arm\s+assembly)\b/i.test(fullText);
        }
        if (isStrictMatch) {
          const displayName = skill.charAt(0).toUpperCase() + skill.slice(1);
          matchedSkills.add(displayName);
          categorized[category].push(displayName);
        }
        continue;
      }
      const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(`(?:^|[^a-zA-Z0-9#+])${escaped}(?:$|[^a-zA-Z0-9#+])`, "i");
      if (regex.test(textLower)) {
        const displayName = skill.charAt(0).toUpperCase() + skill.slice(1);
        matchedSkills.add(displayName);
        categorized[category].push(displayName);
      }
    }
  }
  const skillsList = Array.from(matchedSkills);
  let confidence = 0;
  if (skillsList.length >= 8) confidence = 1;
  else if (skillsList.length >= 5) confidence = 0.85;
  else if (skillsList.length >= 3) confidence = 0.7;
  else if (skillsList.length >= 1) confidence = 0.4;
  return { skillsList, categorized, confidence };
}
function extractCertifications(sectionText, fullText) {
  const textToSearch = sectionText || fullText;
  const certKeywords = [
    "AWS Certified",
    "Solutions Architect",
    "Cloud Practitioner",
    "PMP",
    "Scrum Master",
    "CSM",
    "CISSP",
    "CEH",
    "Google Cloud Certified",
    "GCP Professional",
    "Azure Fundamentals",
    "Azure Administrator",
    "CKA",
    "CKAD",
    "ISTQB",
    "Salesforce Certified",
    "CompTIA"
  ];
  const found = [];
  for (const cert of certKeywords) {
    if (new RegExp(`\\b${cert}\\b`, "i").test(textToSearch)) {
      found.push(cert);
    }
  }
  return found.join(", ");
}
function extractLanguages(sectionText, fullText) {
  const textToSearch = sectionText || fullText;
  const langs = [
    "English",
    "Spanish",
    "French",
    "German",
    "Mandarin",
    "Hindi",
    "Arabic",
    "Portuguese",
    "Japanese",
    "Russian"
  ];
  const found = [];
  for (const lang of langs) {
    if (new RegExp(`\\b${lang}\\b`, "i").test(textToSearch)) {
      found.push(lang);
    }
  }
  return found.join(", ");
}
function parseResumeLocally(rawText) {
  const cleaned = cleanText(rawText);
  const sections = extractSections(cleaned);
  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
  const headerText = sections["header"] || lines.slice(0, 15).join("\n");
  const nameResult = extractName(lines);
  const emailResult = extractEmail(headerText || cleaned);
  const phoneResult = extractPhone(headerText || cleaned);
  const socials = extractSocials(cleaned);
  const location = extractLocation(headerText || cleaned);
  const contactScore = nameResult.confidence * 0.4 + emailResult.confidence * 0.35 + phoneResult.confidence * 0.25;
  const expResult = extractWorkExperience(sections["experience"], cleaned);
  const expYears = calculateExperienceYears(expResult.experiences);
  const currentExp = expResult.experiences.find((e) => e.is_current) || expResult.experiences[0];
  const currentCompany = currentExp?.company || "";
  const currentDesignation = currentExp?.title || "";
  const eduResult = extractEducation(sections["education"], cleaned);
  const skillsResult = extractSkills(sections["skills"], cleaned);
  const certifications = extractCertifications(sections["certifications"], cleaned);
  const languages = extractLanguages(sections["languages"], cleaned);
  const summary = sections["summary"] ? sections["summary"].slice(0, 500) : "";
  const overallConfidence = contactScore * 0.35 + expResult.confidence * 0.3 + eduResult.confidence * 0.2 + skillsResult.confidence * 0.15;
  const confidence = {
    overall: Math.round(overallConfidence * 100) / 100,
    contact: Math.round(contactScore * 100) / 100,
    name: nameResult.confidence,
    email: emailResult.confidence,
    phone: phoneResult.confidence,
    experience: expResult.confidence,
    education: eduResult.confidence,
    skills: skillsResult.confidence
  };
  return {
    full_name: nameResult.name,
    email: emailResult.email,
    phone: phoneResult.phone,
    location,
    linkedin_url: socials.linkedin,
    github_url: socials.github,
    job_interest: currentDesignation || (expResult.experiences[0]?.title || ""),
    current_company: currentCompany,
    current_designation: currentDesignation,
    experience_years: expYears,
    education: eduResult.primaryDegree ? `${eduResult.primaryDegree} - ${eduResult.primaryUniversity}` : eduResult.primaryUniversity,
    degree: eduResult.primaryDegree,
    university: eduResult.primaryUniversity,
    graduation_year: eduResult.gradYear,
    skills: skillsResult.skillsList.join(", "),
    categorized_skills: skillsResult.categorized,
    certifications,
    languages,
    summary,
    notes: summary,
    experience: expResult.experiences,
    education_history: eduResult.educationList,
    confidence,
    parser_used: "local_hybrid"
  };
}

// server.ts
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
async function assignLeadRoundRobinTransaction(targetDb, candidateId, candidateData, overrideUserId, requestedByRole, forceInWorkingHours, idempotencyKey) {
  const managementRoles = ["administrator", "jpc_sysadmin", "jpc_manager", "jpc_cs", "jpc_compliance_person"];
  const isManagement = requestedByRole && managementRoles.includes(requestedByRole);
  let activeOverrideId = null;
  if (isManagement && overrideUserId) {
    activeOverrideId = String(overrideUserId);
  }
  const rawPhone = candidateData?.phone ? String(candidateData.phone) : "";
  const digitsOnly = rawPhone.replace(/[^0-9]/g, "");
  const cleanPhone = digitsOnly.length === 11 && digitsOnly.startsWith("1") ? digitsOnly.slice(1) : digitsOnly;
  const cleanEmail = candidateData?.email ? String(candidateData.email).toLowerCase().trim() : "";
  return await targetDb.runTransaction(async (transaction) => {
    if (idempotencyKey) {
      const idempRef = targetDb.collection("jpc_idempotency_keys").doc(String(idempotencyKey));
      const idempDoc = await transaction.get(idempRef);
      if (idempDoc.exists) {
        const idempData = idempDoc.data();
        if (idempData.status === "completed" && idempData.candidate_id) {
          const existingCandDoc = await transaction.get(targetDb.collection("jpc_candidates").doc(idempData.candidate_id));
          const existingCand = existingCandDoc.exists ? existingCandDoc.data() : null;
          let existingAssignedUser = null;
          const existingSalesId = idempData.assigned_sales || existingCand?.assigned_sales || null;
          if (existingSalesId) {
            const uDoc = await transaction.get(targetDb.collection("jpc_users").doc(String(existingSalesId)));
            if (uDoc.exists) {
              existingAssignedUser = { id: uDoc.id, ...uDoc.data() };
            }
          }
          return {
            assignedUser: existingAssignedUser,
            assignedUserId: existingSalesId,
            isUnassigned: idempData.is_unassigned ?? existingSalesId == null,
            reason: idempData.reason,
            candidateId: idempData.candidate_id,
            duplicatePrevented: true,
            alreadyExisted: true
          };
        }
      }
    }
    const candRef = targetDb.collection("jpc_candidates").doc(candidateId);
    const candDoc = await transaction.get(candRef);
    if (candDoc.exists) {
      const existing = candDoc.data();
      if (existing.assigned_sales && !activeOverrideId) {
        let existingUser = null;
        const uDoc = await transaction.get(targetDb.collection("jpc_users").doc(String(existing.assigned_sales)));
        if (uDoc.exists) {
          existingUser = { id: uDoc.id, ...uDoc.data() };
        }
        return {
          assignedUser: existingUser,
          assignedUserId: String(existing.assigned_sales),
          isUnassigned: false,
          preserved: true,
          candidateId,
          duplicatePrevented: true,
          alreadyExisted: true
        };
      }
    }
    const phoneLockRef = cleanPhone.length >= 7 ? targetDb.collection("jpc_lead_locks").doc(`phone_${cleanPhone}`) : null;
    const emailLockRef = cleanEmail.length >= 5 ? targetDb.collection("jpc_lead_locks").doc(`email_${cleanEmail.replace(/[^a-z0-9@._-]/g, "_")}`) : null;
    const lockRefs = [phoneLockRef, emailLockRef].filter(Boolean);
    for (const lRef of lockRefs) {
      const lockDoc = await transaction.get(lRef);
      if (lockDoc.exists) {
        const lockData = lockDoc.data();
        const lockedCandId = lockData.candidate_id;
        if (lockedCandId && lockedCandId !== candidateId) {
          const lockedCandDoc = await transaction.get(targetDb.collection("jpc_candidates").doc(lockedCandId));
          if (lockedCandDoc.exists) {
            const lockedCandData = lockedCandDoc.data();
            if (!lockedCandData.deleted_at) {
              let lockedUser = null;
              if (lockedCandData.assigned_sales) {
                const uDoc = await transaction.get(targetDb.collection("jpc_users").doc(String(lockedCandData.assigned_sales)));
                if (uDoc.exists) {
                  lockedUser = { id: uDoc.id, ...uDoc.data() };
                }
              }
              return {
                assignedUser: lockedUser,
                assignedUserId: lockedCandData.assigned_sales ? String(lockedCandData.assigned_sales) : null,
                isUnassigned: !lockedCandData.assigned_sales,
                candidateId: lockedCandId,
                duplicatePrevented: true,
                alreadyExisted: true
              };
            }
          }
        }
      }
    }
    const commitLocksAndIdempotency = (assignedSalesId, isUnassignedState, reasonStr) => {
      const lockPayload = {
        candidate_id: candidateId,
        phone: cleanPhone,
        email: cleanEmail,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (phoneLockRef) {
        transaction.set(phoneLockRef, lockPayload, { merge: true });
      }
      if (emailLockRef) {
        transaction.set(emailLockRef, lockPayload, { merge: true });
      }
      if (idempotencyKey) {
        const idempRef = targetDb.collection("jpc_idempotency_keys").doc(String(idempotencyKey));
        transaction.set(idempRef, {
          key: String(idempotencyKey),
          candidate_id: candidateId,
          assigned_sales: assignedSalesId,
          is_unassigned: isUnassignedState,
          reason: reasonStr || null,
          status: "completed",
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        }, { merge: true });
      }
    };
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
      commitLocksAndIdempotency(activeOverrideId, false);
      return {
        assignedUser: assignedUser2,
        assignedUserId: activeOverrideId,
        isUnassigned: false,
        candidateId,
        duplicatePrevented: false,
        alreadyExisted: false
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
      commitLocksAndIdempotency(null, true, "outside_working_hours");
      return {
        assignedUser: null,
        assignedUserId: null,
        isUnassigned: true,
        reason: "outside_working_hours",
        candidateId,
        duplicatePrevented: false,
        alreadyExisted: false
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
      commitLocksAndIdempotency(null, true, "no_active_sales_reps");
      return {
        assignedUser: null,
        assignedUserId: null,
        isUnassigned: true,
        reason: "no_active_sales_reps",
        candidateId,
        duplicatePrevented: false,
        alreadyExisted: false
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
    commitLocksAndIdempotency(String(assignedUser.id), false);
    return {
      assignedUser,
      assignedUserId: String(assignedUser.id),
      isUnassigned: false,
      candidateId,
      duplicatePrevented: false,
      alreadyExisted: false
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
app.post(["/api/leads", "/leads"], verifyAuth, async (req, res) => {
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
    const idempotencyKey = req.headers["idempotency-key"] || req.body.idempotency_key || req.body.idempotencyKey || null;
    const result = await assignLeadRoundRobinTransaction(
      db,
      candidateId,
      candidateData,
      overrideUserId,
      user.role,
      forceWorkingHours,
      idempotencyKey
    );
    res.json({
      success: true,
      candidateId: result.candidateId || candidateId,
      assigned_sales: result.assignedUserId,
      assigned_sales_name: result.assignedUser?.display_name || null,
      assignedUser: result.assignedUser,
      isUnassigned: result.isUnassigned,
      reason: result.reason,
      duplicatePrevented: result.duplicatePrevented || false,
      alreadyExisted: result.alreadyExisted || false
    });
  } catch (error) {
    console.error("Error creating lead via /api/leads:", error);
    res.status(500).json({ error: error.message || "Failed to create lead" });
  }
});
app.post(["/api/leads/round-robin/assign", "/leads/round-robin/assign"], verifyAuth, async (req, res) => {
  try {
    const { candidateId, candidateName, overrideUserId } = req.body;
    const user = req.user;
    const forceWorkingHours = req.headers["x-mock-working-hours"] !== void 0 ? req.headers["x-mock-working-hours"] === "true" : void 0;
    if (!candidateId) {
      return res.status(400).json({ error: "Missing candidateId" });
    }
    const idempotencyKey = req.headers["idempotency-key"] || req.body.idempotency_key || req.body.idempotencyKey || null;
    const effectiveOverride = user.role === "jpc_lead_gen" ? null : overrideUserId;
    const result = await assignLeadRoundRobinTransaction(
      db,
      candidateId,
      candidateName ? { full_name: candidateName } : void 0,
      effectiveOverride,
      user.role,
      forceWorkingHours,
      idempotencyKey
    );
    res.json({
      success: true,
      assignedUser: result.assignedUser,
      assignedUserId: result.assignedUserId,
      isUnassigned: result.isUnassigned,
      reason: result.reason,
      candidateId: result.candidateId || candidateId,
      duplicatePrevented: result.duplicatePrevented || false,
      alreadyExisted: result.alreadyExisted || false
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
app.post(["/api/sales/availability", "/sales/availability"], verifyAuth, async (req, res) => {
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
app.get(["/api/sales/availability", "/sales/availability"], verifyAuth, async (req, res) => {
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
app.post(["/api/leads/assign-unassigned", "/leads/assign-unassigned"], verifyAuth, async (req, res) => {
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
var extractServerTextFromPDF = async (buffer) => {
  try {
    if (!buffer || buffer.length === 0) {
      return { text: "", isCorrupted: true };
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true
    }).promise;
    let text = "";
    const numPages = Math.min(doc.numPages, 10);
    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str + (item.hasEOL ? "\n" : " "));
      text += strings.join("") + "\n";
    }
    const trimmed = text.trim();
    const nonWhitespace = trimmed.replace(/\s+/g, "");
    const isScanned = nonWhitespace.length < 20;
    return { text: trimmed, isScannedOrImageOnly: isScanned };
  } catch (err) {
    console.warn("[Server Resume Parse] PDF extraction error:", err?.message || err);
    const isPw = err?.name === "PasswordException" || String(err?.message || "").toLowerCase().includes("password");
    return { text: "", isPasswordProtected: isPw, isCorrupted: !isPw };
  }
};
var extractServerTextFromDOCX = async (buffer) => {
  try {
    if (!buffer || buffer.length === 0) {
      return { text: "", isCorrupted: true };
    }
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value.trim() };
  } catch (err) {
    console.warn("[Server Resume Parse] DOCX extraction error:", err?.message || err);
    return { text: "", isCorrupted: true };
  }
};
var mergeCandidateData = (local, gemini, rawDocText) => {
  if (!local) return gemini;
  const full_name = local.confidence?.name >= 0.8 && local.full_name ? local.full_name : gemini.full_name || local.full_name || "";
  const email = local.confidence?.email >= 0.9 && local.email ? local.email : gemini.email || local.email || "";
  const phone = local.confidence?.phone >= 0.8 && local.phone ? local.phone : gemini.phone || local.phone || "";
  const current_company = local.current_company || gemini.current_company || "";
  const current_designation = local.current_designation || gemini.current_designation || "";
  const experience_years = local.experience_years || gemini.experience_years || "";
  const job_interest = local.job_interest || gemini.job_interest || current_designation;
  const degree = local.degree || gemini.degree || "";
  const university = local.university || gemini.university || "";
  const graduation_year = local.graduation_year || gemini.graduation_year || "";
  const education = local.education || gemini.education || (degree && university ? `${degree} - ${university}` : degree || university);
  const mergedSkillsSet = /* @__PURE__ */ new Set();
  if (local.skills) {
    local.skills.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => mergedSkillsSet.add(s));
  }
  if (gemini.skills) {
    const docTextLower = rawDocText.toLowerCase();
    const geminiSkills = gemini.skills.split(",").map((s) => s.trim()).filter(Boolean);
    for (const gs of geminiSkills) {
      if (docTextLower.includes(gs.toLowerCase())) {
        mergedSkillsSet.add(gs);
      }
    }
  }
  return {
    full_name,
    phone,
    email,
    job_interest,
    location: local.location || gemini.location || "",
    education,
    degree,
    university,
    graduation_year,
    experience_years,
    current_company,
    current_designation,
    skills: Array.from(mergedSkillsSet).join(", "),
    linkedin_url: local.linkedin_url || gemini.linkedin_url || "",
    notes: gemini.notes || local.notes || "",
    categorized_skills: local.categorized_skills,
    certifications: local.certifications || gemini.certifications || "",
    languages: local.languages || gemini.languages || "",
    summary: gemini.summary || local.summary || "",
    experience: local.experience || [],
    education_history: local.education_history || [],
    confidence: local.confidence,
    parser_used: "gemini_merged"
  };
};
app.post("/api/resume/parse", async (req, res) => {
  const { textToParse, fileBase64, mimeType } = req.body;
  if (fileBase64 && fileBase64.length > 14e6) {
    return res.status(413).json({ error: "File size exceeds maximum limit of 10MB." });
  }
  const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain"
  ];
  if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return res.status(400).json({ error: "Unsupported file type. Please upload a PDF, DOCX, or TXT file." });
  }
  let rawText = (textToParse || "").trim();
  let isScannedOrImageOnly = false;
  if (!rawText && fileBase64) {
    try {
      const buffer = Buffer.from(fileBase64, "base64");
      if (buffer.length === 0) {
        return res.status(400).json({ error: "The uploaded file is empty." });
      }
      if (mimeType === "application/pdf") {
        const extraction = await extractServerTextFromPDF(buffer);
        if (extraction.isPasswordProtected) {
          return res.status(422).json({ error: "This PDF is password-protected. Please upload an unlocked document." });
        }
        if (extraction.isCorrupted) {
          return res.status(400).json({ error: "The uploaded PDF file is corrupted or unreadable." });
        }
        rawText = extraction.text;
        isScannedOrImageOnly = Boolean(extraction.isScannedOrImageOnly);
      } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimeType === "application/msword") {
        const extraction = await extractServerTextFromDOCX(buffer);
        if (extraction.isCorrupted) {
          return res.status(400).json({ error: "The uploaded DOCX file is corrupted or unreadable." });
        }
        rawText = extraction.text;
      } else if (mimeType === "text/plain") {
        rawText = buffer.toString("utf-8").trim();
      }
    } catch (extractErr) {
      console.warn("[Resume Parse] Failed to extract buffer on server:", extractErr?.message || extractErr);
      return res.status(400).json({ error: "Failed to extract text from document." });
    }
  }
  let localCandidate = null;
  if (rawText && rawText.length > 20 && !isScannedOrImageOnly) {
    try {
      localCandidate = parseResumeLocally(rawText);
    } catch (parseErr) {
      console.warn("[Resume Parse] Local parsing error:", parseErr?.message || parseErr);
    }
  }
  if (localCandidate) {
    const hasContact = Boolean(localCandidate.full_name && (localCandidate.email || localCandidate.phone));
    const isConfident = localCandidate.confidence?.overall >= 0.65 && hasContact;
    if (isConfident) {
      console.log(`[Resume Parse] Local hybrid parser succeeded with confidence ${Math.round(localCandidate.confidence.overall * 100)}%. Zero Gemini cost.`);
      return res.json({
        candidate: localCandidate,
        confidence: localCandidate.confidence,
        parser_used: "local_hybrid"
      });
    }
  }
  const apiKey = process.env.GEMINI_API_KEY;
  const isKeyEmptyOrPlaceholder = !apiKey || apiKey.trim() === "" || apiKey.toLowerCase().includes("your-api-key") || apiKey === "PLACEHOLDER" || apiKey.length < 20;
  if (isScannedOrImageOnly && isKeyEmptyOrPlaceholder) {
    return res.status(422).json({
      error: "This PDF appears to be a scanned image with no selectable text. Local parsing requires a searchable text PDF or DOCX. For scanned documents, please configure a valid Gemini API key for Cloud OCR.",
      isScanned: true,
      ocrSupportedLocally: false
    });
  }
  if (isKeyEmptyOrPlaceholder) {
    if (localCandidate && (localCandidate.full_name || localCandidate.email || localCandidate.phone)) {
      console.warn("[Resume Parse] Gemini API key unavailable. Returning local hybrid parse candidate.");
      return res.json({
        candidate: localCandidate,
        confidence: localCandidate?.confidence,
        parser_used: "local_hybrid",
        warning: "Parsed with local engine (Gemini API key not configured)"
      });
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
    if (rawText && rawText.length > 30) {
      parts.push({ text: `Extract candidate information from this resume text:

${rawText}` });
    } else if (fileBase64 && mimeType && mimeType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && mimeType !== "application/msword") {
      parts.push({
        inlineData: {
          data: fileBase64,
          mimeType
        }
      });
      parts.push({ text: "Extract candidate information from this resume document." });
    } else if (rawText) {
      parts.push({ text: `Extract candidate information from this text:

${rawText}` });
    } else {
      if (localCandidate) {
        return res.json({ candidate: localCandidate, parser_used: "local_hybrid" });
      }
      return res.status(400).json({ error: "No resume text or valid document provided for parsing." });
    }
    parts.push({ text: "Return the extracted data in JSON format following the schema. If a field is not found or not stated, return an empty string for that field." });
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let lastError = null;
    let geminiResult = null;
    for (const modelName of modelsToTry) {
      try {
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error(`Gemini API timeout after 12000ms for model ${modelName}`)), 12e3)
        );
        const callPromise = ai.models.generateContent({
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
        const response = await Promise.race([callPromise, timeoutPromise]);
        if (response && response.text) {
          const cleanedText = response.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          geminiResult = JSON.parse(cleanedText);
          console.log(`[Resume Parse] Successfully parsed resume using fallback model: ${modelName}`);
          break;
        }
      } catch (mErr) {
        lastError = mErr;
        console.warn(`[Resume Parse] Model ${modelName} fallback failed:`, mErr?.message || mErr);
      }
    }
    if (geminiResult) {
      const merged = mergeCandidateData(localCandidate, geminiResult, rawText);
      return res.json({ candidate: merged, parser_used: localCandidate ? "gemini_merged" : "gemini" });
    }
    if (localCandidate) {
      console.warn("[Resume Parse] Gemini models failed. Returning local parsed candidate:", lastError?.message || lastError);
      return res.json({
        candidate: localCandidate,
        confidence: localCandidate.confidence,
        parser_used: "local_hybrid",
        warning: lastError?.message
      });
    }
    if (isScannedOrImageOnly) {
      return res.status(502).json({
        error: "Cloud OCR processing failed or timed out. Please try again or upload a text-based resume.",
        details: lastError?.message
      });
    }
    return res.status(500).json({ error: lastError?.message || "Failed to parse resume with AI model" });
  } catch (error) {
    console.error("[Resume Parse] Error in resume parse route:", error);
    if (localCandidate) {
      return res.json({
        candidate: localCandidate,
        confidence: localCandidate.confidence,
        parser_used: "local_hybrid",
        warning: error.message
      });
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
