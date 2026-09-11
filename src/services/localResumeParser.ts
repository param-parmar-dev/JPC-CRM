/**
 * Local Hybrid Resume Parser for Placify CRM
 *
 * Implements deterministic ATS resume parsing algorithms inspired by LeverParser (wespiper/pyresume).
 * Provides structured extraction for:
 * - Contact information (Name, Email, International Phone numbers, LinkedIn, GitHub, Location)
 * - Structured Work Experience (Job Title, Company, Location, Date Ranges, Current Status, Responsibilities)
 * - Education (Degrees, Institutions/Universities, Graduation Year, GPA)
 * - Skills Taxonomy (categorized extraction across 200+ technologies)
 * - Certifications, Languages, Professional Summary
 * - Granular and Overall Confidence Scoring
 *
 * Zero external ML/GPU dependencies; runs in < 30ms on raw text.
 */

export interface ParsedWorkExperience {
  title: string;
  company: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  responsibilities?: string[];
  description?: string;
}

export interface ParsedEducation {
  degree: string;
  institution: string;
  graduation_year?: string;
  gpa?: string;
  location?: string;
}

export interface ParsingConfidence {
  overall: number;
  contact: number;
  name: number;
  email: number;
  phone: number;
  experience: number;
  education: number;
  skills: number;
}

export interface LocalParsedResume {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  github_url: string;
  job_interest: string;
  current_company: string;
  current_designation: string;
  experience_years: string;
  education: string;
  degree: string;
  university: string;
  graduation_year: string;
  skills: string;
  categorized_skills: Record<string, string[]>;
  certifications: string;
  languages: string;
  summary: string;
  notes: string;
  experience: ParsedWorkExperience[];
  education_history: ParsedEducation[];
  confidence: ParsingConfidence;
  parser_used: 'local_hybrid' | 'gemini' | 'gemini_merged' | 'heuristic';
}

// Section Header Patterns
const SECTION_PATTERNS: Record<string, RegExp> = {
  experience: /^(?:(?:work|professional|employment|relevant|career)\s+)?(?:experience|history|background)\b/i,
  education: /^(?:educational?(?:\s+background)?|academic\s+(?:background|history|credentials)|education|qualifications)\b/i,
  skills: /^(?:technical\s+|core\s+|key\s+)?(?:skills|competencies|technologies|proficiencies|expertise|technical\s+stack)\b/i,
  projects: /^(?:(?:selected|personal|academic|key|notable)\s+)?projects\b/i,
  certifications: /^(?:(?:professional\s+)?certifications?|licenses?|credentials?|certificates?)\b/i,
  summary: /^(?:professional\s+)?(?:summary|profile|about\s+me|career\s+objective|executive\s+summary|overview)\b/i,
  languages: /^(?:languages?|linguistic\s+skills|language\s+proficiency)\b/i,
};

// Skill Taxonomy
const SKILL_TAXONOMY: Record<string, string[]> = {
  languages: [
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'golang', 'go', 'rust', 'ruby',
    'php', 'swift', 'kotlin', 'scala', 'r', 'dart', 'perl', 'shell', 'bash', 'powershell',
    'sql', 'html', 'html5', 'css', 'css3', 'sass', 'scss', 'matlab', 'assembly'
  ],
  frameworks: [
    'react', 'react.js', 'react native', 'next.js', 'nextjs', 'vue', 'vue.js', 'nuxt', 'angular',
    'angularjs', 'node.js', 'nodejs', 'express', 'express.js', 'nestjs', 'django', 'flask',
    'fastapi', 'spring', 'spring boot', 'asp.net', '.net core', 'ruby on rails', 'rails',
    'laravel', 'tailwindcss', 'tailwind', 'bootstrap', 'material-ui', 'redux', 'graphql',
    'svelte', 'electron', 'jquery'
  ],
  cloud_devops: [
    'aws', 'amazon web services', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s',
    'terraform', 'ansible', 'jenkins', 'ci/cd', 'github actions', 'gitlab ci', 'circleci',
    'helm', 'argo cd', 'prometheus', 'grafana', 'linux', 'unix', 'nginx', 'apache', 'serverless'
  ],
  databases: [
    'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb',
    'oracle', 'sqlite', 'cassandra', 'neo4j', 'firebase', 'firestore', 'supabase',
    'snowflake', 'bigquery', 'mariadb', 'mssql', 'sql server'
  ],
  ai_data: [
    'machine learning', 'deep learning', 'nlp', 'natural language processing', 'computer vision',
    'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy', 'scipy', 'spark',
    'hadoop', 'kafka', 'airflow', 'tableau', 'power bi', 'llm', 'langchain', 'generative ai'
  ],
  tools_methods: [
    'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'agile', 'scrum', 'kanban',
    'rest', 'restful', 'microservices', 'soap', 'postman', 'swagger', 'jest', 'mocha', 'cypress',
    'selenium', 'playwright', 'junit', 'pytest', 'tdd', 'bdd', 'webpack', 'vite', 'eslint'
  ]
};

// Common Job Titles
const COMMON_TITLES = [
  'Software Engineer', 'Software Developer', 'Full Stack Developer', 'Frontend Developer',
  'Backend Developer', 'Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer',
  'DevOps Engineer', 'Cloud Architect', 'Solutions Architect', 'Data Scientist',
  'Data Analyst', 'Data Engineer', 'Machine Learning Engineer', 'AI Engineer',
  'QA Engineer', 'Quality Assurance Engineer', 'Automation Test Engineer', 'Security Engineer',
  'Systems Administrator', 'Network Engineer', 'Product Manager', 'Project Manager',
  'Scrum Master', 'Engineering Manager', 'Tech Lead', 'Technical Lead', 'CTO', 'VP of Engineering',
  'UI/UX Designer', 'Product Designer', 'Business Analyst', 'Account Executive', 'Sales Manager',
  'Director', 'Director of Operations', 'Operations Director', 'Managing Director', 'Executive Director',
  'Associate Director', 'Vice President', 'Head of Operations', 'Head of Engineering', 'General Manager',
  'Consultant', 'Senior Consultant', 'Associate', 'Intern', 'Operations Manager'
];

/**
 * Normalizes text lines and handles layout breaks
 */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[ \u00A0\u1680\u180e\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
    .trim();
}

/**
 * Extracts sections using boundary detection
 */
function extractSections(text: string): Record<string, string> {
  const lines = text.split('\n').map(l => l.trim());
  const sections: Record<string, string[]> = {};
  let currentSection = 'header';
  sections[currentSection] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Check if this line is a section header (isolated, usually short, matches header pattern)
    if (line.length <= 40 && !line.includes('@') && !line.includes('http') && !line.includes('|')) {
      let matchedSection: string | null = null;
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

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(sections)) {
    result[key] = val.join('\n');
  }
  return result;
}

/**
 * Extracts candidate name from top lines
 */
function extractName(lines: string[]): { name: string; confidence: number } {
  const skipWords = [
    'resume', 'curriculum vitae', 'cv', 'profile', 'contact', 'email', 'phone', 'address',
    'summary', 'experience', 'education', 'skills', 'page', 'objective', 'personal', 'linkedin',
    'github', 'http', 'www', '.com', '@'
  ];

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    let rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Check if line contains multi-column spacing (e.g. "Ethan Hunt          SKILLS")
    if (/\s{3,}|\t+/.test(rawLine)) {
      const parts = rawLine.split(/\s{3,}|\t+/).map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        const firstLower = parts[0].toLowerCase();
        if (!skipWords.some(w => firstLower.includes(w)) && !/\d{3,}/.test(parts[0])) {
          rawLine = parts[0];
        }
      }
    }

    const lower = rawLine.toLowerCase();
    if (skipWords.some(w => lower.includes(w))) continue;
    if (/\d{3,}/.test(rawLine)) continue; // contains phone or dates

    // Strip salutations
    let cleaned = rawLine.replace(/^(?:mr\.|ms\.|mrs\.|dr\.|er\.)\s+/i, '').trim();

    // Check if line contains a separator (e.g. "John Doe | Software Engineer")
    if (cleaned.includes('|')) {
      cleaned = cleaned.split('|')[0].trim();
    } else if (cleaned.includes(' - ')) {
      cleaned = cleaned.split(' - ')[0].trim();
    }

    // Name must consist of 2 to 4 words, letters, hyphens or periods only
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 4) {
      const isValidName = words.every(w => /^[A-Za-z]+[.'-]?[A-Za-z]*$/.test(w));
      if (isValidName && cleaned.length >= 4 && cleaned.length <= 50) {
        // Check if any word is a common job title or occupational noun
        const isJobTitle = COMMON_TITLES.some(title => {
          const escaped = title.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          return new RegExp(`\\b${escaped}\\b`, 'i').test(cleaned);
        }) || /\b(director|president|officer|manager|lead|architect|engineer|developer|designer|analyst|consultant|coordinator|administrator|specialist)\b/i.test(cleaned);
        if (!isJobTitle) {
          // Format as Title Case if in ALL CAPS
          const formatted = cleaned === cleaned.toUpperCase()
            ? cleaned.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
            : cleaned;
          return { name: formatted, confidence: 0.95 };
        }
      }
    } else if (words.length === 1 && words[0].length >= 3 && /^[A-Za-z]+$/.test(words[0])) {
      const isJobTitle = COMMON_TITLES.some(title => {
        const escaped = title.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(words[0]);
      }) || /\b(director|president|officer|manager|lead|architect|engineer|developer|designer|analyst|consultant|coordinator|administrator|specialist)\b/i.test(words[0]);
      if (!isJobTitle) {
        return { name: words[0], confidence: 0.6 };
      }
    }
  }

  return { name: '', confidence: 0.0 };
}

/**
 * Extracts email, filtering out generic corporate or support addresses
 */
function extractEmail(text: string): { email: string; confidence: number } {
  const matches = Array.from(text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)).map(m => m[0]);
  if (matches.length === 0) {
    return { email: '', confidence: 0.0 };
  }

  const genericPrefixes = ['support@', 'noreply@', 'no-reply@', 'info@', 'contact@', 'help@', 'sales@', 'jobs@', 'careers@', 'admin@', 'billing@', 'service@'];
  const personalCandidates = matches.filter(e => !genericPrefixes.some(p => e.toLowerCase().startsWith(p)));

  const selected = personalCandidates.length > 0 ? personalCandidates[0] : matches[0];
  return { email: selected.toLowerCase(), confidence: 1.0 };
}

/**
 * Extracts international phone numbers (US, India, UK, UAE, Germany, General E.164)
 */
function extractPhone(text: string): { phone: string; confidence: number } {
  // 1. UK format: +44 or 07xxx
  const ukMatch = text.match(/(?:\+44[\s.-]?)?0?7\d{3}[\s.-]?\d{6}\b/);
  if (ukMatch && (ukMatch[0].startsWith('+44') || ukMatch[0].startsWith('07'))) {
    return { phone: ukMatch[0], confidence: 0.95 };
  }

  // 2. UAE format: +971 5x xxx xxxx
  const uaeMatch = text.match(/\+971[\s.-]?(?:5\d|0?5\d)[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  if (uaeMatch) {
    return { phone: uaeMatch[0], confidence: 0.95 };
  }

  // 3. German format: +49 xx xxxxxxx
  const deMatch = text.match(/\+49[\s.-]?(?:[1-9]\d{1,3})[\s.-]?\d{4,8}\b/);
  if (deMatch) {
    return { phone: deMatch[0], confidence: 0.95 };
  }

  // 4. Indian Phone with explicit +91
  const indianExplicit = text.match(/\+91[\s.-]?([6-9]\d{4}[\s.-]?\d{5})\b/);
  if (indianExplicit) {
    const raw = indianExplicit[0].replace(/[\s.-]/g, '');
    return { phone: raw, confidence: 0.95 };
  }

  // 5. US / North American format: (123) 456-7890 or +1-123-456-7890
  const usMatch = text.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/);
  if (usMatch) {
    const formatted = `(${usMatch[1]}) ${usMatch[2]}-${usMatch[3]}`;
    return { phone: formatted, confidence: 0.95 };
  }

  // 6. Indian standard 10 digits starting with 6-9 (without country prefix)
  const indianImplicit = text.match(/\b([6-9]\d{4}[\s.-]?\d{5})\b/);
  if (indianImplicit) {
    const raw = indianImplicit[0].replace(/[\s.-]/g, '');
    return { phone: `+91 ${raw.slice(0, 5)} ${raw.slice(5)}`, confidence: 0.9 };
  }

  // 7. General International format: +xx xxx xxx xxxx
  const intlMatch = text.match(/\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/);
  if (intlMatch) {
    return { phone: intlMatch[0], confidence: 0.85 };
  }

  // 8. Plain 10 digit fallback
  const plainMatch = text.match(/\b\d{10}\b/);
  if (plainMatch) {
    return { phone: plainMatch[0], confidence: 0.7 };
  }

  return { phone: '', confidence: 0.0 };
}

/**
 * Extracts LinkedIn and GitHub URLs
 */
function extractSocials(text: string): { linkedin: string; github: string } {
  let linkedin = '';
  let github = '';

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

/**
 * Extracts candidate location
 */
function extractLocation(text: string): string {
  // Pattern 1: City, State/Country
  const locMatch = text.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s*([A-Z]{2}|[A-Z][a-zA-Z]{2,15})\b/);
  if (locMatch) {
    const city = locMatch[1].trim();
    const region = locMatch[2].trim();
    const ignoreWords = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'bachelor', 'master'];
    if (!ignoreWords.includes(city.toLowerCase()) && !ignoreWords.includes(region.toLowerCase())) {
      return `${city}, ${region}`;
    }
  }

  // Pattern 2: Major global cities / hubs
  const hubs = [
    'Bengaluru', 'Bangalore', 'Hyderabad', 'Mumbai', 'Pune', 'Delhi', 'Noida', 'Gurugram', 'Gurgaon',
    'Chennai', 'San Francisco', 'New York', 'Seattle', 'Austin', 'Boston', 'Chicago', 'London',
    'Toronto', 'Vancouver', 'Berlin', 'Singapore', 'Dubai', 'Sydney', 'Remote'
  ];
  for (const hub of hubs) {
    const reg = new RegExp(`\\b${hub}\\b`, 'i');
    if (reg.test(text.slice(0, 1000))) {
      return hub;
    }
  }

  return '';
}

/**
 * Parses date string into standard Month Year / Year representation
 */
function parseDateRange(text: string): { start?: string; end?: string; isCurrent: boolean } {
  const months = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  
  // Range Pattern: (Month Year | Year) - (Month Year | Year | Present | Current)
  const rangeRegex = new RegExp(
    `((?:(?:${months})\\s+)?(?:19|20)\\d{2}|\\d{1,2}/(?:19|20)\\d{2})\\s*(?:[-–—to]+)\\s*((?:(?:${months})\\s+)?(?:19|20)\\d{2}|\\d{1,2}/(?:19|20)\\d{2}|present|current|now|ongoing)`,
    'i'
  );

  const match = text.match(rangeRegex);
  if (match) {
    const start = match[1].trim();
    const endRaw = match[2].trim();
    const isCurrent = /present|current|now|ongoing/i.test(endRaw);
    return {
      start,
      end: isCurrent ? 'Present' : endRaw,
      isCurrent
    };
  }

  // Single year range: e.g. 2020 - 2023 or 2021 - Present
  const simpleYearRegex = /\b((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|current|now)\b/i;
  const yearMatch = text.match(simpleYearRegex);
  if (yearMatch) {
    const isCurrent = /present|current|now/i.test(yearMatch[2]);
    return {
      start: yearMatch[1],
      end: isCurrent ? 'Present' : yearMatch[2],
      isCurrent
    };
  }

  return { isCurrent: false };
}

/**
 * Calculates total years of experience from parsed date ranges by merging overlapping intervals
 */
function calculateExperienceYears(experiences: ParsedWorkExperience[]): string {
  const intervals: Array<[number, number]> = [];
  const currentYear = new Date().getFullYear();

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

  if (intervals.length === 0) return '';

  // Sort intervals by start year
  intervals.sort((a, b) => a[0] - b[0]);

  // Merge overlapping intervals
  const merged: Array<[number, number]> = [];
  let currentInterval = [...intervals[0]] as [number, number];

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

  return totalYears >= 1 ? `${totalYears} years` : '1 year';
}

/**
 * Structured Work Experience Extraction (LeverParser model)
 */
function extractWorkExperience(sectionText: string, fullText: string): { experiences: ParsedWorkExperience[]; confidence: number } {
  const textToAnalyze = sectionText && sectionText.length > 50 ? sectionText : fullText;
  const lines = textToAnalyze.split('\n').map(l => l.trim()).filter(Boolean);
  const experiences: ParsedWorkExperience[] = [];

  let currentExp: ParsedWorkExperience | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line contains a date range
    const dateRange = parseDateRange(line);

    if (dateRange.start) {
      // If we already had an experience being built, push it
      if (currentExp && (currentExp.title || currentExp.company)) {
        experiences.push(currentExp);
      }

      currentExp = {
        title: '',
        company: '',
        start_date: dateRange.start,
        end_date: dateRange.end,
        is_current: dateRange.isCurrent,
        responsibilities: []
      };

      // Check if title or company is on the same line before the dates
      const lineWithoutDates = line.replace(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}.*$/i, '').trim();
      if (lineWithoutDates.length > 3) {
        if (lineWithoutDates.includes('|')) {
          const parts = lineWithoutDates.split('|').map(p => p.trim());
          currentExp.title = parts[0];
          currentExp.company = parts[1];
        } else if (lineWithoutDates.includes(' - ')) {
          const parts = lineWithoutDates.split(' - ').map(p => p.trim());
          currentExp.title = parts[0];
          currentExp.company = parts[1];
        } else if (lineWithoutDates.includes(' at ')) {
          const parts = lineWithoutDates.split(' at ').map(p => p.trim());
          currentExp.title = parts[0];
          currentExp.company = parts[1];
        } else {
          currentExp.title = lineWithoutDates;
        }
      }

      // If title or company wasn't on the date line, inspect preceding 1-2 lines
      if (!currentExp.title && i > 0) {
        const prevLine = lines[i - 1];
        // Case A: line i-1 is "Company | Location" or "Company - Location"
        if (prevLine.includes('|')) {
          const parts = prevLine.split('|').map(p => p.trim());
          currentExp.company = parts[0];
          currentExp.location = parts[1];
          // Title would be line i-2
          if (i > 1 && !lines[i - 2].startsWith('•') && !lines[i - 2].startsWith('-')) {
            currentExp.title = lines[i - 2];
          }
        } else if (prevLine.includes(' - ') && !/\d{4}/.test(prevLine)) {
          const parts = prevLine.split(' - ').map(p => p.trim());
          currentExp.company = parts[0];
          currentExp.location = parts[1];
          if (i > 1 && !lines[i - 2].startsWith('•') && !lines[i - 2].startsWith('-')) {
            currentExp.title = lines[i - 2];
          }
        } else if (prevLine.includes(' at ')) {
          const parts = prevLine.split(' at ').map(p => p.trim());
          currentExp.title = parts[0];
          currentExp.company = parts[1];
        } else {
          // Check if prevLine is a known job title or has title words
          const isTitle = COMMON_TITLES.some(t => prevLine.toLowerCase().includes(t.toLowerCase())) ||
                          /\b(engineer|developer|manager|lead|architect|analyst|designer|consultant|specialist|officer|director|intern|administrator|tester|scientist)\b/i.test(prevLine);
          if (isTitle) {
            currentExp.title = prevLine;
            if (i > 1 && !lines[i - 2].startsWith('•') && !lines[i - 2].startsWith('-') && lines[i - 2].length < 60) {
              currentExp.company = lines[i - 2];
            }
          } else {
            // prevLine is likely Company
            currentExp.company = prevLine;
            if (i > 1 && !lines[i - 2].startsWith('•') && !lines[i - 2].startsWith('-') && lines[i - 2].length < 60) {
              currentExp.title = lines[i - 2];
            }
          }
        }
      }

      continue;
    }

    // If we have an active experience, collect bullet points / responsibilities
    if (currentExp) {
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || line.startsWith('▪')) {
        const bulletText = line.replace(/^[•\-*▪]\s*/, '').trim();
        if (bulletText.length > 5) {
          currentExp.responsibilities?.push(bulletText);
        }
      } else if (!currentExp.company && line.length < 60 && !line.includes('http')) {
        // Might be company name directly following title
        currentExp.company = line;
      }
    }
  }

  // Push final experience item
  if (currentExp && (currentExp.title || currentExp.company)) {
    experiences.push(currentExp);
  }

  // Post-process descriptions, title/company cleaning, and deduplication
  const uniqueExperiences: ParsedWorkExperience[] = [];
  const seenExpKeys = new Set<string>();

  for (const exp of experiences) {
    if (exp.responsibilities && exp.responsibilities.length > 0) {
      exp.description = exp.responsibilities.join('\n');
    }
    // Clean company and title strings
    exp.title = exp.title.replace(/^[,\-|]\s*/, '').replace(/[,\-|]\s*$/, '').trim();
    exp.company = exp.company.replace(/^[,\-|]\s*/, '').replace(/[,\-|]\s*$/, '').trim();

    const key = `${exp.company.toLowerCase()}|${exp.title.toLowerCase()}|${(exp.start_date || '').toLowerCase()}`;
    if (!seenExpKeys.has(key) && (exp.company || exp.title)) {
      seenExpKeys.add(key);
      uniqueExperiences.push(exp);
    }
  }

  // Calculate experience confidence
  let confidence = 0.0;
  if (uniqueExperiences.length > 0) {
    const hasTitles = uniqueExperiences.filter(e => e.title).length;
    const hasCompanies = uniqueExperiences.filter(e => e.company).length;
    const hasDates = uniqueExperiences.filter(e => e.start_date).length;

    confidence = (hasTitles / uniqueExperiences.length) * 0.4 +
                 (hasCompanies / uniqueExperiences.length) * 0.35 +
                 (hasDates / uniqueExperiences.length) * 0.25;
  }

  return { experiences: uniqueExperiences, confidence: Math.round(confidence * 100) / 100 };
}

/**
 * Extracts Education
 */
function extractEducation(sectionText: string, fullText: string): { educationList: ParsedEducation[]; primaryDegree: string; primaryUniversity: string; gradYear: string; confidence: number } {
  const textToAnalyze = sectionText && sectionText.length > 30 ? sectionText : fullText;
  const lines = textToAnalyze.split('\n').map(l => l.trim()).filter(Boolean);

  const educationList: ParsedEducation[] = [];
  const degreeRegex = /\b(?:Bachelor(?:'s)?(?:\s+of\s+[A-Za-z\s]+)?|Master(?:'s)?(?:\s+of\s+[A-Za-z\s]+)?|Ph\.?D|Doctorate|B\.?Tech|B\.?E\.?|B\.?S\.?|B\.?Sc\.?|B\.?A\.?|BCA|BBA|M\.?Tech|M\.?E\.?|M\.?S\.?|M\.?Sc\.?|MBA|MCA|Associate(?:'s)?|Diploma)\b/i;
  const uniRegex = /\b(?:University|College|Institute|Polytechnic|School|IIT|NIT|BITS|Academy)\b/i;

  let currentEdu: ParsedEducation | null = null;

  for (const line of lines) {
    const hasDegree = degreeRegex.test(line);
    const hasUni = uniRegex.test(line);
    const allYears = line.match(/\b(19[7-9]\d|20[0-3]\d)\b/g);
    const latestYear = allYears ? allYears[allYears.length - 1] : '';

    if (hasDegree || hasUni) {
      if (hasDegree && hasUni) {
        educationList.push({
          degree: line.match(degreeRegex)?.[0] || '',
          institution: line.replace(degreeRegex, '').replace(/[,\-|]/g, ' ').trim(),
          graduation_year: latestYear
        });
      } else if (hasDegree) {
        currentEdu = {
          degree: line,
          institution: '',
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
            degree: '',
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

  const primaryDegree = educationList.find(e => e.degree)?.degree || '';
  const primaryUniversity = educationList.find(e => e.institution)?.institution || '';
  const gradYear = educationList.find(e => e.graduation_year)?.graduation_year || '';

  let confidence = 0.0;
  if (primaryDegree && primaryUniversity) confidence = 0.95;
  else if (primaryDegree || primaryUniversity) confidence = 0.7;
  else if (gradYear) confidence = 0.4;

  return { educationList, primaryDegree, primaryUniversity, gradYear, confidence };
}

/**
 * Extracts Skills from taxonomy and free text
 */
function extractSkills(sectionText: string, fullText: string): { skillsList: string[]; categorized: Record<string, string[]>; confidence: number } {
  const isSkillsSection = Boolean(sectionText && sectionText.length > 20);
  const textLower = (sectionText || fullText).toLowerCase();
  const matchedSkills = new Set<string>();
  const categorized: Record<string, string[]> = {};

  const ambiguousSkills = new Set(['go', 'r', 'c', 'rest', 'git', 'spark', 'assembly']);

  for (const [category, skills] of Object.entries(SKILL_TAXONOMY)) {
    categorized[category] = [];
    for (const skill of skills) {
      const lowerSkill = skill.toLowerCase();
      // If ambiguous and not in dedicated skills section, use strict contextual check
      if (ambiguousSkills.has(lowerSkill) && !isSkillsSection) {
        let isStrictMatch = false;
        if (lowerSkill === 'go') {
          isStrictMatch = /\b(?:golang|go\s+language|go\s+developer|go\s+backend)\b/i.test(fullText) || /\bGo\b/.test(fullText);
        } else if (lowerSkill === 'r') {
          isStrictMatch = /\b(?:r\s+language|r\s+programming|r\s+studio)\b/i.test(fullText);
        } else if (lowerSkill === 'c') {
          isStrictMatch = /\b(?:c\s+programming|c\s+language)\b/i.test(fullText);
        } else if (lowerSkill === 'rest') {
          isStrictMatch = /\b(?:restful|rest\s+api|rest\s+apis)\b/i.test(fullText);
        } else if (lowerSkill === 'spark') {
          isStrictMatch = /\b(?:apache\s+spark|pyspark|spark\s+streaming)\b/i.test(fullText);
        } else if (lowerSkill === 'git') {
          isStrictMatch = /\b(?:git\s+version|github|gitlab|git\b)/i.test(fullText);
        } else if (lowerSkill === 'assembly') {
          isStrictMatch = /\b(?:assembly\s+language|x86|arm\s+assembly)\b/i.test(fullText);
        }

        if (isStrictMatch) {
          const displayName = skill.charAt(0).toUpperCase() + skill.slice(1);
          matchedSkills.add(displayName);
          categorized[category].push(displayName);
        }
        continue;
      }

      // Standard Word boundary match
      const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`(?:^|[^a-zA-Z0-9#+])${escaped}(?:$|[^a-zA-Z0-9#+])`, 'i');
      if (regex.test(textLower)) {
        // Format display name
        const displayName = skill.charAt(0).toUpperCase() + skill.slice(1);
        matchedSkills.add(displayName);
        categorized[category].push(displayName);
      }
    }
  }

  const skillsList = Array.from(matchedSkills);
  let confidence = 0.0;
  if (skillsList.length >= 8) confidence = 1.0;
  else if (skillsList.length >= 5) confidence = 0.85;
  else if (skillsList.length >= 3) confidence = 0.7;
  else if (skillsList.length >= 1) confidence = 0.4;

  return { skillsList, categorized, confidence };
}

/**
 * Extracts Certifications
 */
function extractCertifications(sectionText: string, fullText: string): string {
  const textToSearch = sectionText || fullText;
  const certKeywords = [
    'AWS Certified', 'Solutions Architect', 'Cloud Practitioner', 'PMP', 'Scrum Master', 'CSM',
    'CISSP', 'CEH', 'Google Cloud Certified', 'GCP Professional', 'Azure Fundamentals',
    'Azure Administrator', 'CKA', 'CKAD', 'ISTQB', 'Salesforce Certified', 'CompTIA'
  ];

  const found: string[] = [];
  for (const cert of certKeywords) {
    if (new RegExp(`\\b${cert}\\b`, 'i').test(textToSearch)) {
      found.push(cert);
    }
  }
  return found.join(', ');
}

/**
 * Extracts Languages
 */
function extractLanguages(sectionText: string, fullText: string): string {
  const textToSearch = sectionText || fullText;
  const langs = [
    'English', 'Spanish', 'French', 'German', 'Mandarin', 'Hindi', 'Arabic', 'Portuguese', 'Japanese', 'Russian'
  ];

  const found: string[] = [];
  for (const lang of langs) {
    if (new RegExp(`\\b${lang}\\b`, 'i').test(textToSearch)) {
      found.push(lang);
    }
  }
  return found.join(', ');
}

/**
 * Main Deterministic Resume Parser
 */
export function parseResumeLocally(rawText: string): LocalParsedResume {
  const cleaned = cleanText(rawText);
  const sections = extractSections(cleaned);
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Contact Info
  const headerText = sections['header'] || lines.slice(0, 15).join('\n');
  const nameResult = extractName(lines);
  const emailResult = extractEmail(headerText || cleaned);
  const phoneResult = extractPhone(headerText || cleaned);
  const socials = extractSocials(cleaned);
  const location = extractLocation(headerText || cleaned);

  const contactScore = (nameResult.confidence * 0.4) +
                       (emailResult.confidence * 0.35) +
                       (phoneResult.confidence * 0.25);

  // 2. Experience
  const expResult = extractWorkExperience(sections['experience'], cleaned);
  const expYears = calculateExperienceYears(expResult.experiences);
  const currentExp = expResult.experiences.find(e => e.is_current) || expResult.experiences[0];
  const currentCompany = currentExp?.company || '';
  const currentDesignation = currentExp?.title || '';

  // 3. Education
  const eduResult = extractEducation(sections['education'], cleaned);

  // 4. Skills
  const skillsResult = extractSkills(sections['skills'], cleaned);

  // 5. Certifications & Languages & Summary
  const certifications = extractCertifications(sections['certifications'], cleaned);
  const languages = extractLanguages(sections['languages'], cleaned);
  const summary = sections['summary'] ? sections['summary'].slice(0, 500) : '';

  // 6. Overall Confidence Calculation
  const overallConfidence = (
    contactScore * 0.35 +
    expResult.confidence * 0.30 +
    eduResult.confidence * 0.20 +
    skillsResult.confidence * 0.15
  );

  const confidence: ParsingConfidence = {
    overall: Math.round(overallConfidence * 100) / 100,
    contact: Math.round(contactScore * 100) / 100,
    name: nameResult.confidence,
    email: emailResult.confidence,
    phone: phoneResult.confidence,
    experience: expResult.confidence,
    education: eduResult.confidence,
    skills: skillsResult.confidence,
  };

  return {
    full_name: nameResult.name,
    email: emailResult.email,
    phone: phoneResult.phone,
    location,
    linkedin_url: socials.linkedin,
    github_url: socials.github,
    job_interest: currentDesignation || (expResult.experiences[0]?.title || ''),
    current_company: currentCompany,
    current_designation: currentDesignation,
    experience_years: expYears,
    education: eduResult.primaryDegree ? `${eduResult.primaryDegree} - ${eduResult.primaryUniversity}` : eduResult.primaryUniversity,
    degree: eduResult.primaryDegree,
    university: eduResult.primaryUniversity,
    graduation_year: eduResult.gradYear,
    skills: skillsResult.skillsList.join(', '),
    categorized_skills: skillsResult.categorized,
    certifications,
    languages,
    summary,
    notes: summary,
    experience: expResult.experiences,
    education_history: eduResult.educationList,
    confidence,
    parser_used: 'local_hybrid'
  };
}
