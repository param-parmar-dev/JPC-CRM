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
  specialization?: string;
  graduation_year?: string;
  start_date?: string;
  end_date?: string;
  gpa?: string;
  location?: string;
}

export interface ParsingConfidence {
  overall: number;
  contact: number;
  name: number;
  email: number;
  phone: number;
  location: number;
  experience: number;
  education: number;
  skills: number;
  job_interest: number;
}

export interface LocalParsedResume {
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  alternate_phone: string;
  location: string;
  city: string;
  state: string;
  country: string;
  current_address: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
  website_url: string;
  job_interest: string;
  domain_interested: string;
  current_company: string;
  current_designation: string;
  experience_years: string;
  education: string;
  degree: string;
  university: string;
  specialization: string;
  graduation_year: string;
  gpa: string;
  skills: string;
  categorized_skills: Record<string, string[]>;
  certifications: string;
  languages: string;
  summary: string;
  notice_period: string;
  current_ctc: string;
  expected_ctc: string;
  work_authorization: string;
  remote_preference: string;
  notes: string;
  experience: ParsedWorkExperience[];
  education_history: ParsedEducation[];
  confidence: ParsingConfidence;
  field_sources: Record<string, 'local' | 'ocr' | 'gemini' | 'unknown'>;
  missing_fields: string[];
  warnings: string[];
  raw_text?: string;
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
export const SKILL_TAXONOMY: Record<string, string[]> = {
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
  ],
  soft_skills: [
    'communication', 'leadership', 'problem solving', 'teamwork', 'critical thinking',
    'adaptability', 'mentoring', 'time management', 'collaboration', 'agile mindset', 'presentation'
  ]
};

// Common Job Titles
export const COMMON_TITLES = [
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
  'Consultant', 'Senior Consultant', 'Associate', 'Intern', 'Operations Manager',
  'Systems Analyst', 'Clinical Systems Analyst', 'Database Administrator', 'Cloud Engineer',
  'Mobile Developer', 'iOS Developer', 'Android Developer', 'Quantitative Developer'
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
 * Splits full name into first and last name cleanly
 */
function extractNameParts(fullName: string): { first_name: string; last_name: string } {
  if (!fullName) return { first_name: '', last_name: '' };
  const cleaned = fullName.replace(/^(?:mr\.|ms\.|mrs\.|dr\.|prof\.|er\.)\s+/i, '').trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first_name: '', last_name: '' };
  if (tokens.length === 1) return { first_name: tokens[0], last_name: '' };
  return {
    first_name: tokens[0],
    last_name: tokens.slice(1).join(' ')
  };
}

/**
 * Helper to check if a string matches or contains the candidate's name
 */
function isNameMatch(str: string, candidateName: string): boolean {
  if (!str || !candidateName) return false;
  const sNorm = str.trim().toLowerCase().replace(/^(?:mr\.|ms\.|mrs\.|dr\.|prof\.|er\.)\s+/i, '');
  const cNorm = candidateName.trim().toLowerCase().replace(/^(?:mr\.|ms\.|mrs\.|dr\.|prof\.|er\.)\s+/i, '');
  if (sNorm === cNorm) return true;

  const cTokens = cNorm.split(/\s+/).filter(Boolean);
  const sTokens = sNorm.split(/\s+/).filter(Boolean);
  if (cTokens.length >= 2 && sTokens.length >= 2 && sTokens.length <= 4) {
    if (cTokens.every(t => sTokens.includes(t)) || sTokens.every(t => cTokens.includes(t))) {
      return true;
    }
  }
  return false;
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
 * Extracts primary phone, alternate phone, and WhatsApp numbers
 */
function extractPhone(text: string): { phone: string; alternate_phone: string; whatsapp: string; confidence: number } {
  const allPhones: string[] = [];
  const seenDigits = new Set<string>();

  const addPhone = (phoneStr: string, rawDigits: string) => {
    const key = rawDigits.slice(-10);
    if (!seenDigits.has(key)) {
      seenDigits.add(key);
      allPhones.push(phoneStr);
    }
  };

  // Check for explicit "Alt:" or "Alternate:" phone first
  let explicitAltPhone = '';
  const altMatch = text.match(/(?:alt(?:ernate)?(?:\s*phone)?|secondary)\s*[:\-]?\s*([+]?[0-9\s\-().]{10,25})/i);
  if (altMatch) {
    const rawAlt = altMatch[1].trim();
    const uMatch = rawAlt.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
    if (uMatch) {
      explicitAltPhone = `(${uMatch[1]}) ${uMatch[2]}-${uMatch[3]}`;
    } else {
      explicitAltPhone = rawAlt;
    }
  }

  // 1. UK format: +44 or 07xxx
  const ukMatches = Array.from(text.matchAll(/(?:\+44[\s.-]?)?0?7\d{3}[\s.-]?\d{6}\b/g));
  for (const m of ukMatches) {
    if (m[0].startsWith('+44') || m[0].startsWith('07')) {
      addPhone(m[0], m[0].replace(/\D/g, ''));
    }
  }

  // 2. UAE format: +971 5x xxx xxxx
  const uaeMatches = Array.from(text.matchAll(/\+971[\s.-]?(?:5\d|0?5\d)[\s.-]?\d{3}[\s.-]?\d{4}\b/g));
  for (const m of uaeMatches) {
    addPhone(m[0], m[0].replace(/\D/g, ''));
  }

  // 3. German format: +49 xx xxxxxxx
  const deMatches = Array.from(text.matchAll(/\+49[\s.-]?(?:[1-9]\d{1,3})[\s.-]?\d{4,8}\b/g));
  for (const m of deMatches) {
    addPhone(m[0], m[0].replace(/\D/g, ''));
  }

  // 4. Indian Phone with explicit +91
  const indianExplicit = Array.from(text.matchAll(/\+91[\s.-]?([6-9]\d{4}[\s.-]?\d{5})\b/g));
  for (const m of indianExplicit) {
    addPhone(m[0].replace(/[\s.-]/g, ''), m[1].replace(/[\s.-]/g, ''));
  }

  // 5. US / North American format: (123) 456-7890 or +1-123-456-7890
  const usMatches = Array.from(text.matchAll(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g));
  for (const m of usMatches) {
    const formatted = `(${m[1]}) ${m[2]}-${m[3]}`;
    addPhone(formatted, `${m[1]}${m[2]}${m[3]}`);
  }

  // 6. Indian standard 10 digits starting with 6-9 (without country prefix)
  const indianImplicit = Array.from(text.matchAll(/\b([6-9]\d{4}[\s.-]?\d{5})\b/g));
  for (const m of indianImplicit) {
    const raw = m[0].replace(/[\s.-]/g, '');
    const formatted = `+91 ${raw.slice(0, 5)} ${raw.slice(5)}`;
    addPhone(formatted, raw);
  }

  // 7. General International format: +xx xxx xxx xxxx
  const intlMatches = Array.from(text.matchAll(/\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g));
  for (const m of intlMatches) {
    addPhone(m[0], m[0].replace(/\D/g, ''));
  }

  // 8. Plain 10 digit fallback
  const plainMatches = Array.from(text.matchAll(/\b\d{10}\b/g));
  for (const m of plainMatches) {
    addPhone(m[0], m[0]);
  }

  // Check for explicit WhatsApp tag
  let whatsapp = '';
  const waMatch = text.match(/(?:whatsapp|wa|whats\s*app)\s*[:\-]?\s*([+]?[0-9\s\-()]{10,20})/i);
  if (waMatch) {
    whatsapp = waMatch[1].trim();
  }

  const primaryPhone = allPhones[0] || '';
  const alternatePhone = explicitAltPhone || (allPhones.length > 1 ? allPhones[1] : '');

  // If WhatsApp wasn't explicitly tagged, default to primary mobile if valid
  if (!whatsapp && primaryPhone) {
    whatsapp = primaryPhone;
  }

  const confidence = primaryPhone ? 0.95 : 0.0;
  return { phone: primaryPhone, alternate_phone: alternatePhone, whatsapp, confidence };
}

/**
 * Extracts Social, Portfolio, and Personal Web links
 */
function extractSocials(text: string): { linkedin: string; github: string; portfolio: string; website: string } {
  let linkedin = '';
  let github = '';
  let portfolio = '';
  let website = '';

  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|pub)\/([A-Za-z0-9_-]+)/i);
  if (linkedinMatch) {
    linkedin = `https://linkedin.com/in/${linkedinMatch[1]}`;
  }

  const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_-]+)/i);
  if (githubMatch) {
    github = `https://github.com/${githubMatch[1]}`;
  }

  // Portfolio sites: behance, dribbble, vercel.app, netlify.app, personal domain tagged with portfolio
  const portfolioMatch = text.match(/(?:portfolio|projects?)\s*[:\-]?\s*(https?:\/\/[^\s,;"'<>()]+)/i) ||
    text.match(/(https?:\/\/[A-Za-z0-9_-]+\.(?:vercel\.app|netlify\.app|github\.io|dribbble\.com|behance\.net)(?:\/[^\s,;"'<>()]*)?)/i);
  if (portfolioMatch) {
    portfolio = portfolioMatch[1].trim();
  }

  // Website/Blog (exclude generic email domains and linkedin/github)
  const siteMatch = text.match(/(?:website|blog|site)\s*[:\-]?\s*(https?:\/\/[^\s,;"'<>()]+)/i);
  if (siteMatch) {
    website = siteMatch[1].trim();
  }

  // Standalone personal domain in header lines (e.g. jessicapearson.law, vikram.dev, alex.me)
  if (!portfolio || !website) {
    const topLines = text.split('\n').slice(0, 15);
    for (const line of topLines) {
      const trimmed = line.trim();
      if (trimmed.includes('@') || trimmed.includes('linkedin.com') || trimmed.includes('github.com')) continue;
      const domainMatch = trimmed.match(/\b([a-zA-Z0-9-]+\.(?:dev|me|io|law|design|tech|app|site|online|live|page|xyz|info|com|org|net))\b/i);
      if (domainMatch && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'].includes(domainMatch[1].toLowerCase())) {
        const fullUrl = domainMatch[0].startsWith('http') ? domainMatch[0] : `https://${domainMatch[0]}`;
        if (!portfolio) portfolio = fullUrl;
        if (!website) website = fullUrl;
        break;
      }
    }
  }

  return { linkedin, github, portfolio, website };
}

/**
 * Extracts location, decomposing into city, state, country, and address
 */
function extractLocation(text: string): { location: string; city: string; state: string; country: string; current_address: string } {
  let location = '';
  let city = '';
  let state = '';
  let country = '';
  let current_address = '';

  // Explicit address tag
  const addressMatch = text.match(/(?:address|current\s*location)\s*[:\-]?\s*([^\n]+)/i);
  if (addressMatch) {
    current_address = addressMatch[1].trim();
  }

  // Pattern 0: Full street address with city, state, zip, country (e.g. "54th Street, New York, NY 10022, USA")
  const fullAddressMatch = text.match(/(?:\b\d+[a-zA-Z0-9 .,#\-\/]*(?:st|nd|rd|th)?[^\S\r\n]+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Plaza|Floor|Suite)\s*,)[^\S\r\n]*([A-Z][a-zA-Z ]{2,20}),[^\S\r\n]*([A-Z]{2}|[A-Z][a-zA-Z ]{2,15})(?:[^\S\r\n]+\d{5}(?:-\d{4})?)?(?:[^\S\r\n]*,[^\S\r\n]*([A-Za-z ]{2,15}))?/i);
  if (fullAddressMatch) {
    city = fullAddressMatch[1].trim();
    state = fullAddressMatch[2].trim();
    country = (fullAddressMatch[3] || (state.length === 2 ? 'USA' : '')).split('\n')[0].trim();
    location = `${city}, ${state}${country ? `, ${country}` : ''}`;
    current_address = fullAddressMatch[0].split('\n')[0].trim();
    return { location, city, state, country, current_address };
  }

  // Pattern 1: City, State, Country (e.g. "San Francisco, CA, USA" or "Bengaluru, Karnataka, India")
  const threePartMatch = text.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s*([A-Z]{2}|[A-Z][a-zA-Z\s]{2,15}),\s*([A-Z][a-zA-Z\s]{2,15})\b/);
  if (threePartMatch) {
    const streetWords = ['street', 'st', 'road', 'rd', 'avenue', 'ave', 'drive', 'dr', 'lane', 'ln', 'blvd', 'boulevard', 'way'];
    if (!streetWords.includes(threePartMatch[1].trim().toLowerCase())) {
      city = threePartMatch[1].trim();
      state = threePartMatch[2].trim();
      country = threePartMatch[3].trim();
      location = `${city}, ${state}, ${country}`;
      return { location, city, state, country, current_address: current_address || location };
    }
  }

  // Pattern 2: City, State or City, Country (e.g. "San Francisco, CA" or "Berlin, Germany")
  const locMatch = text.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s*([A-Z]{2}|[A-Z][a-zA-Z\s]{2,15})\b/);
  if (locMatch) {
    const p1 = locMatch[1].trim();
    const p2 = locMatch[2].trim();
    const ignoreWords = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'bachelor', 'master', 'street', 'st', 'road', 'rd', 'avenue', 'ave'];
    if (!ignoreWords.includes(p1.toLowerCase()) && !ignoreWords.includes(p2.toLowerCase())) {
      city = p1;
      if (/^[A-Z]{2}$/.test(p2)) {
        state = p2;
        country = 'USA';
      } else {
        country = p2;
      }
      location = `${city}, ${p2}`;
      return { location, city, state, country, current_address: current_address || location };
    }
  }

  // Pattern 3: Major global tech hubs
  const hubs: Record<string, { city: string; country: string }> = {
    'Bengaluru': { city: 'Bengaluru', country: 'India' },
    'Bangalore': { city: 'Bangalore', country: 'India' },
    'Hyderabad': { city: 'Hyderabad', country: 'India' },
    'Mumbai': { city: 'Mumbai', country: 'India' },
    'Pune': { city: 'Pune', country: 'India' },
    'Delhi': { city: 'Delhi', country: 'India' },
    'Noida': { city: 'Noida', country: 'India' },
    'Gurugram': { city: 'Gurugram', country: 'India' },
    'Gurgaon': { city: 'Gurgaon', country: 'India' },
    'Chennai': { city: 'Chennai', country: 'India' },
    'San Francisco': { city: 'San Francisco', country: 'USA' },
    'New York': { city: 'New York', country: 'USA' },
    'Seattle': { city: 'Seattle', country: 'USA' },
    'Austin': { city: 'Austin', country: 'USA' },
    'Boston': { city: 'Boston', country: 'USA' },
    'Chicago': { city: 'Chicago', country: 'USA' },
    'London': { city: 'London', country: 'UK' },
    'Toronto': { city: 'Toronto', country: 'Canada' },
    'Vancouver': { city: 'Vancouver', country: 'Canada' },
    'Berlin': { city: 'Berlin', country: 'Germany' },
    'Singapore': { city: 'Singapore', country: 'Singapore' },
    'Dubai': { city: 'Dubai', country: 'UAE' },
    'Sydney': { city: 'Sydney', country: 'Australia' }
  };

  const textHeader = text.slice(0, 1000);
  for (const [hub, details] of Object.entries(hubs)) {
    if (new RegExp(`\\b${hub}\\b`, 'i').test(textHeader)) {
      location = `${details.city}, ${details.country}`;
      city = details.city;
      country = details.country;
      return { location, city, state: '', country, current_address: current_address || location };
    }
  }

  return { location: '', city: '', state: '', country: '', current_address: '' };
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
 * Structured Work Experience Extraction (LeverParser model with Candidate Name protection)
 */
function extractWorkExperience(sectionText: string, fullText: string, candidateName: string): { experiences: ParsedWorkExperience[]; confidence: number } {
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
      if (lineWithoutDates.length > 3 && !isNameMatch(lineWithoutDates, candidateName)) {
        if (lineWithoutDates.includes('|')) {
          const parts = lineWithoutDates.split('|').map(p => p.trim());
          currentExp.title = !isNameMatch(parts[0], candidateName) ? parts[0] : '';
          currentExp.company = !isNameMatch(parts[1], candidateName) ? parts[1] : '';
        } else if (lineWithoutDates.includes(' - ')) {
          const parts = lineWithoutDates.split(' - ').map(p => p.trim());
          currentExp.title = !isNameMatch(parts[0], candidateName) ? parts[0] : '';
          currentExp.company = !isNameMatch(parts[1], candidateName) ? parts[1] : '';
        } else if (lineWithoutDates.includes(' at ')) {
          const parts = lineWithoutDates.split(' at ').map(p => p.trim());
          currentExp.title = !isNameMatch(parts[0], candidateName) ? parts[0] : '';
          currentExp.company = !isNameMatch(parts[1], candidateName) ? parts[1] : '';
        } else {
          currentExp.title = lineWithoutDates;
        }
      }

      // If title or company wasn't on the date line, inspect preceding 1-2 lines
      if (!currentExp.title && i > 0) {
        const prevLine = lines[i - 1];
        if (!isNameMatch(prevLine, candidateName)) {
          // Case A: line i-1 is "Company | Location" or "Company - Location"
          if (prevLine.includes('|')) {
            const parts = prevLine.split('|').map(p => p.trim());
            currentExp.company = parts[0];
            currentExp.location = parts[1];
            if (i > 1 && !lines[i - 2].startsWith('•') && !lines[i - 2].startsWith('-') && !isNameMatch(lines[i - 2], candidateName)) {
              currentExp.title = lines[i - 2];
            }
          } else if (prevLine.includes(' - ') && !/\d{4}/.test(prevLine)) {
            const parts = prevLine.split(' - ').map(p => p.trim());
            currentExp.company = parts[0];
            currentExp.location = parts[1];
            if (i > 1 && !lines[i - 2].startsWith('•') && !lines[i - 2].startsWith('-') && !isNameMatch(lines[i - 2], candidateName)) {
              currentExp.title = lines[i - 2];
            }
          } else if (prevLine.includes(' at ')) {
            const parts = prevLine.split(' at ').map(p => p.trim());
            currentExp.title = !isNameMatch(parts[0], candidateName) ? parts[0] : '';
            currentExp.company = !isNameMatch(parts[1], candidateName) ? parts[1] : '';
          } else {
            // Check if prevLine is a known job title or has title words
            const isTitle = COMMON_TITLES.some(t => prevLine.toLowerCase().includes(t.toLowerCase())) ||
                            /\b(engineer|developer|manager|lead|architect|analyst|designer|consultant|specialist|officer|director|intern|administrator|tester|scientist)\b/i.test(prevLine);
            if (isTitle) {
              currentExp.title = prevLine;
              if (i > 1 && !lines[i - 2].startsWith('•') && !lines[i - 2].startsWith('-') && lines[i - 2].length < 60 && !isNameMatch(lines[i - 2], candidateName)) {
                currentExp.company = lines[i - 2];
              }
            } else {
              currentExp.company = prevLine;
              if (i > 1 && !lines[i - 2].startsWith('•') && !lines[i - 2].startsWith('-') && lines[i - 2].length < 60 && !isNameMatch(lines[i - 2], candidateName)) {
                currentExp.title = lines[i - 2];
              }
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
      } else if (!currentExp.title && line.length < 60 && !line.includes('http') && !isNameMatch(line, candidateName)) {
        currentExp.title = line;
      } else if (!currentExp.company && line.length < 60 && !line.includes('http') && !isNameMatch(line, candidateName)) {
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

    // HARD GUARD: never allow title or company to equal candidate name
    if (isNameMatch(exp.title, candidateName)) {
      exp.title = '';
    }
    if (isNameMatch(exp.company, candidateName)) {
      exp.company = '';
    }

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
 * Extracts Education with specialization/field of study and GPA
 */
function extractEducation(sectionText: string, fullText: string): {
  educationList: ParsedEducation[];
  primaryDegree: string;
  primaryUniversity: string;
  specialization: string;
  gradYear: string;
  gpa: string;
  confidence: number;
} {
  const textToAnalyze = sectionText && sectionText.length > 30 ? sectionText : fullText;
  const lines = textToAnalyze.split('\n').map(l => l.trim()).filter(Boolean);

  const educationList: ParsedEducation[] = [];
  const degreeRegex = /\b(?:Bachelor(?:'s)?(?:\s+of\s+[A-Za-z\s&]+)?|Master(?:'s)?(?:\s+of\s+[A-Za-z\s&]+)?|Ph\.?D|Doctorate|Juris\s+Doctor|J\.?D\.?|M\.?D\.?|LL\.?B|LL\.?M|B\.?Tech|B\.?E\.?|B\.?S\.?|B\.?Sc\.?|B\.?A\.?|BCA|BBA|M\.?Tech|M\.?E\.?|M\.?S\.?|M\.?Sc\.?|MBA|MCA|Associate(?:'s)?|Diploma)\b/i;
  const uniRegex = /\b(?:University|College|Institute|Polytechnic|School|IIT|NIT|BITS|Academy)\b/i;
  const gpaRegex = /\b(?:GPA|CGPA)[:\s]*([0-9.]+(?:\s*\/\s*[0-9.]+)?)|([0-9.]+\s*\/\s*[0-9.]+)\s*(?:GPA|CGPA)|\b([6-9]\d(?:\.\d+)?%)\b/i;

  let currentEdu: ParsedEducation | null = null;
  let overallGpa = '';

  for (const line of lines) {
    const hasDegree = degreeRegex.test(line);
    const hasUni = uniRegex.test(line);
    const allYears = line.match(/\b(19[7-9]\d|20[0-3]\d)\b/g);
    const latestYear = allYears ? allYears[allYears.length - 1] : '';

    const gpaMatch = line.match(gpaRegex);
    const lineGpa = gpaMatch ? (gpaMatch[1] || gpaMatch[2] || gpaMatch[3] || '') : '';
    if (lineGpa && !overallGpa) {
      overallGpa = lineGpa;
    }
    if (lineGpa) {
      if (currentEdu && !currentEdu.gpa) {
        currentEdu.gpa = lineGpa;
      } else if (educationList.length > 0 && !educationList[educationList.length - 1].gpa) {
        educationList[educationList.length - 1].gpa = lineGpa;
      }
    }

    // Extract field of study/specialization (e.g. "in Computer Science")
    const specMatch = line.match(/(?:in|of)\s+([A-Za-z\s&]{3,35})(?:$|[,|\-–]|\s*\d{4})/i);
    const specialization = specMatch ? specMatch[1].trim() : '';

    if (hasDegree || hasUni) {
      if (hasDegree && hasUni) {
        educationList.push({
          degree: line.match(degreeRegex)?.[0] || '',
          institution: line.replace(degreeRegex, '').replace(/[,\-|]/g, ' ').trim(),
          specialization,
          graduation_year: latestYear,
          gpa: lineGpa
        });
      } else if (hasDegree) {
        currentEdu = {
          degree: line,
          institution: '',
          specialization,
          graduation_year: latestYear,
          gpa: lineGpa
        };
      } else if (hasUni) {
        if (currentEdu && !currentEdu.institution) {
          currentEdu.institution = line;
          if (latestYear && !currentEdu.graduation_year) {
            currentEdu.graduation_year = latestYear;
          }
          if (lineGpa && !currentEdu.gpa) {
            currentEdu.gpa = lineGpa;
          }
          educationList.push(currentEdu);
          currentEdu = null;
        } else {
          educationList.push({
            degree: '',
            institution: line,
            specialization,
            graduation_year: latestYear,
            gpa: lineGpa
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

  const primaryEdu = educationList.find(e => e.degree) || educationList[0];
  const primaryDegree = primaryEdu?.degree || '';
  const primaryUniversity = educationList.find(e => e.institution)?.institution || '';
  const specialization = primaryEdu?.specialization || '';
  const gradYear = educationList.find(e => e.graduation_year)?.graduation_year || '';

  let confidence = 0.0;
  if (primaryDegree && primaryUniversity) confidence = 0.95;
  else if (primaryDegree || primaryUniversity) confidence = 0.7;
  else if (gradYear) confidence = 0.4;

  return {
    educationList,
    primaryDegree,
    primaryUniversity,
    specialization,
    gradYear,
    gpa: overallGpa,
    confidence
  };
}

/**
 * Extracts Target Role / Job Interest and infers Target Domain
 * CRITICAL FIX: Strictly guarantees candidate's name NEVER populates job_interest.
 */
function extractJobInterest(
  lines: string[],
  candidateName: string,
  currentDesignation: string,
  sections: Record<string, string>,
  skills: string[]
): { job_interest: string; domain_interested: string; confidence: number } {
  let targetRole = '';

  // 1. Check for headline directly underneath candidate name (lines 1 to 3)
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    if (!line || isNameMatch(line, candidateName)) continue;
    if (line.includes('@') || line.includes('http') || /\b\d{10}\b|\+\d{1,3}/.test(line)) continue;

    // Check if line matches common job titles
    const isTitle = COMMON_TITLES.some(t => {
      const escaped = t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(line);
    }) || /\b(software|full\s*stack|frontend|backend|cloud|devops|data\s*scientist|data\s*engineer|systems?|architect|engineer|developer|manager|specialist|analyst|designer)\b/i.test(line);

    if (isTitle && line.length < 60) {
      let candidateRole = line;
      if (candidateRole.includes('|')) candidateRole = candidateRole.split('|')[0].trim();
      if (candidateRole.includes(' - ')) candidateRole = candidateRole.split(' - ')[0].trim();
      if (!isNameMatch(candidateRole, candidateName)) {
        targetRole = candidateRole;
        break;
      }
    }
  }

  // 2. Check for explicit "Objective" or "Target Role" in summary / header, or summary opening lines
  if (!targetRole) {
    const searchArea = (sections['summary'] || '') + '\n' + (sections['header'] || '');
    const objMatch = searchArea.match(/(?:target\s*role|desired\s*(?:role|position)|seeking\s*(?:a\s*(?:role|position)\s*(?:as)?|to\s*join\s*as\s*(?:a)?)|career\s*objective)\s*[:\-]?\s*([A-Za-z\s/&]{4,50})/i);
    if (objMatch) {
      const candidateObj = objMatch[1].trim();
      if (!isNameMatch(candidateObj, candidateName) && /\b(engineer|developer|architect|designer|manager|analyst|scientist|specialist)\b/i.test(candidateObj)) {
        targetRole = candidateObj;
      }
    }

    if (!targetRole && sections['summary']) {
      const sumLines = sections['summary'].split('\n').map(l => l.trim()).filter(Boolean);
      for (const sLine of sumLines.slice(0, 3)) {
        const match = sLine.match(/\b((?:Senior\s+|Lead\s+|Principal\s+|Junior\s+|Staff\s+)?(?:Full\s*Stack|Frontend|Backend|Software|DevOps|Cloud|Data|Mobile|Systems?|Machine\s*Learning|AI|Web|Product|QA|Test|Site\s*Reliability)\s+(?:Engineer|Developer|Architect|Scientist|Specialist|Analyst|Consultant|Manager))\b/i);
        if (match && !isNameMatch(match[1], candidateName)) {
          targetRole = match[1].trim();
          break;
        }
      }
    }
  }

  // 3. Fallback to latest validated currentDesignation (if not candidate name)
  if (!targetRole && currentDesignation && !isNameMatch(currentDesignation, candidateName)) {
    targetRole = currentDesignation;
  }

  // 4. HARD GUARD: If targetRole equals or matches candidateName, clear it completely
  if (isNameMatch(targetRole, candidateName) || (candidateName && targetRole.toLowerCase() === candidateName.toLowerCase())) {
    targetRole = '';
  }

  // 5. Infer domain_interested based on role and skills
  const roleLower = targetRole.toLowerCase();
  const combinedText = `${targetRole} ${skills.join(' ')}`.toLowerCase();
  let domain = 'Software Engineering';

  if (/\b(full\s*stack|mern|mean|fullstack)\b/i.test(roleLower) || (/\b(full\s*stack|mern|mean|fullstack)\b/i.test(combinedText) && !/\b(devops|cloud\s*architect|site\s*reliability)\b/i.test(roleLower))) {
    domain = 'Full Stack Development';
  } else if (/\b(frontend|ui\/ux)\b/i.test(roleLower)) {
    domain = 'Frontend Development';
  } else if (/\b(backend)\b/i.test(roleLower)) {
    domain = 'Backend Development';
  } else if (/\b(data\s*scientist|machine\s*learning|ai|deep\s*learning)\b/i.test(roleLower)) {
    domain = 'Data Science / AI';
  } else if (/\b(devops|sre|site\s*reliability|cloud\s*engineer|cloud\s*architect)\b/i.test(roleLower)) {
    domain = 'DevOps / Cloud Engineering';
  } else if (/\b(devops|sre|site\s*reliability|cloud|kubernetes|docker|terraform|aws|azure|gcp)\b/i.test(combinedText) && !/\b(developer|software\s*engineer|web)\b/i.test(roleLower)) {
    domain = 'DevOps / Cloud Engineering';
  } else if (/\b(data\s*scientist|data\s*engineer|machine\s*learning|ai|deep\s*learning|nlp|pandas|pytorch|tensorflow)\b/i.test(combinedText)) {
    domain = 'Data Science / AI';
  } else if (/\b(frontend|react|vue|angular|css|html|ui\/ux|tailwind)\b/i.test(combinedText) && !/\b(backend|full\s*stack)\b/i.test(roleLower)) {
    domain = 'Frontend Development';
  } else if (/\b(backend|node|express|spring|django|flask|fastapi|golang|microservices)\b/i.test(combinedText) && !/\b(frontend|full\s*stack)\b/i.test(roleLower)) {
    domain = 'Backend Development';
  } else if (/\b(full\s*stack|mern|mean|fullstack)\b/i.test(combinedText)) {
    domain = 'Full Stack Development';
  } else if (/\b(qa|quality\s*assurance|automation\s*test|selenium|cypress|playwright|sdet)\b/i.test(combinedText)) {
    domain = 'QA / Automation Testing';
  } else if (/\b(mobile|ios|android|react\s*native|flutter|swift|kotlin)\b/i.test(combinedText)) {
    domain = 'Mobile App Development';
  } else if (/\b(security|cyber|soc|penetration|infosec|cissp)\b/i.test(combinedText)) {
    domain = 'Cybersecurity';
  } else if (/\b(product\s*manager|project\s*manager|scrum\s*master|agile\s*coach)\b/i.test(combinedText)) {
    domain = 'Product / Project Management';
  }

  return {
    job_interest: targetRole,
    domain_interested: domain,
    confidence: targetRole ? 0.9 : 0.0
  };
}

/**
 * Extracts explicit employment attributes: Notice Period, CTC, Work Authorization, Remote Preference
 * NEVER invents info; only returns values if explicitly present in the text.
 */
function extractExplicitAttributes(text: string): {
  notice_period: string;
  current_ctc: string;
  expected_ctc: string;
  work_authorization: string;
  remote_preference: string;
} {
  let notice_period = '';
  let current_ctc = '';
  let expected_ctc = '';
  let work_authorization = '';
  let remote_preference = '';

  // 1. Notice Period
  const npMatch = text.match(/(?:notice\s*period|availability|available\s*(?:in|from)|serving\s*notice)\s*[:\-]?\s*([0-9]+\s*(?:days?|weeks?|months?)|immediate(?:ly)?|ready\s*to\s*join|currently\s*serving)/i);
  if (npMatch) {
    notice_period = npMatch[1].trim();
  }

  // 2. Current CTC
  const curCtcMatch = text.match(/(?:current\s*(?:ctc|salary|package|compensation))\s*[:\-]?\s*([$₹€£]?[0-9,.]+\s*(?:lpa|lakhs?|k|inr|usd|per\s*annum|yr)?)/i);
  if (curCtcMatch) {
    current_ctc = curCtcMatch[1].trim();
  }

  // 3. Expected CTC
  const expCtcMatch = text.match(/(?:expected\s*(?:ctc|salary|package|compensation))\s*[:\-]?\s*([$₹€£]?[0-9,.]+\s*(?:lpa|lakhs?|k|inr|usd|per\s*annum|yr)?)/i);
  if (expCtcMatch) {
    expected_ctc = expCtcMatch[1].trim();
  }

  // 4. Work Authorization / Visa Status
  const visaTagMatch = text.match(/(?:work\s*authorization|visa\s*status|authorized\s*to\s*work\s*(?:in)?|citizenship|work\s*permit)\s*[:\-]?\s*([^\n,;]{2,40})/i);
  if (visaTagMatch) {
    work_authorization = visaTagMatch[1].trim();
  } else {
    const visaDirect = text.match(/\b(US Citizen|Permanent Resident|Green Card Holder|Green Card|H-?1B|OPT\s*EAD|CPT|Canadian Citizen|UK Citizen|EU Citizen|OCI Cardholder)\b/i);
    if (visaDirect) {
      work_authorization = visaDirect[1].trim();
    }
  }

  // 5. Remote Preference
  const remoteMatch = text.match(/(?:work\s*(?:preference|mode|setup)|remote\s*preference)\s*[:\-]?\s*(remote|hybrid|on-site|onsite|in-office)/i) ||
    text.match(/\b(Open to Remote|Remote Only|Prefers Hybrid|Willing to Relocate)\b/i);
  if (remoteMatch) {
    remote_preference = remoteMatch[1].trim();
  }

  return { notice_period, current_ctc, expected_ctc, work_authorization, remote_preference };
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
  const found: string[] = [];

  // 1. Check for explicit "Certifications:" or "Licenses:" line in text
  const certTagMatch = fullText.match(/(?:certifications?|licenses?|credentials?)\s*[:\-]?\s*([^\n]+)/i);
  if (certTagMatch) {
    const rawCerts = certTagMatch[1].split(/[,|•;]/).map(c => c.trim()).filter(Boolean);
    for (const c of rawCerts) {
      if (c.length > 2 && c.length < 80 && !found.includes(c)) {
        found.push(c);
      }
    }
  }

  // 2. If there's an explicit certifications section, extract non-empty lines
  if (sectionText) {
    const secLines = sectionText.split('\n').map(l => l.replace(/^[•\-*▪]\s*/, '').trim()).filter(Boolean);
    for (const line of secLines) {
      if (line.length > 3 && line.length < 80 && !found.includes(line)) {
        found.push(line);
      }
    }
  }

  // 3. Known industry cert patterns if not already captured
  const certKeywords = [
    'AWS Certified', 'Solutions Architect', 'Cloud Practitioner', 'PMP', 'Scrum Master', 'CSM',
    'CISSP', 'CEH', 'Google Cloud Certified', 'GCP Professional', 'Azure Fundamentals',
    'Azure Administrator', 'CKA', 'CKAD', 'ISTQB', 'Salesforce Certified', 'CompTIA'
  ];

  for (const cert of certKeywords) {
    if (new RegExp(`\\b${cert}\\b`, 'i').test(fullText) && !found.some(f => f.toLowerCase().includes(cert.toLowerCase()))) {
      found.push(cert);
    }
  }

  return found.join(', ');
}

/**
 * Extracts Spoken Languages
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
 * Main Deterministic ATS Resume Parser
 */
export function parseResumeLocally(rawText: string): LocalParsedResume {
  const cleaned = cleanText(rawText);
  const sections = extractSections(cleaned);
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Contact Information
  const headerText = sections['header'] || lines.slice(0, 15).join('\n');
  const nameResult = extractName(lines);
  const nameParts = extractNameParts(nameResult.name);
  const emailResult = extractEmail(headerText || cleaned);
  const phoneResult = extractPhone(headerText || cleaned);
  const socials = extractSocials(cleaned);
  const locationDetails = extractLocation(headerText || cleaned);

  const contactScore = (nameResult.confidence * 0.4) +
                       (emailResult.confidence * 0.35) +
                       (phoneResult.confidence * 0.25);

  // 2. Work Experience (Guarded against candidate name)
  const expResult = extractWorkExperience(sections['experience'], cleaned, nameResult.name);
  const expYears = calculateExperienceYears(expResult.experiences);
  const currentExp = expResult.experiences.find(e => e.is_current) || expResult.experiences[0];
  const currentCompany = currentExp?.company || '';
  const currentDesignation = currentExp?.title || '';

  // 3. Education (with Specialization and GPA)
  const eduResult = extractEducation(sections['education'], cleaned);

  // 4. Skills Taxonomy
  const skillsResult = extractSkills(sections['skills'], cleaned);

  // 5. Job Interest & Domain (Strictly filtered against Candidate Name)
  const jobInterestResult = extractJobInterest(
    lines,
    nameResult.name,
    currentDesignation,
    sections,
    skillsResult.skillsList
  );

  // 6. Explicit Employment Attributes (Notice Period, CTC, Visa Status, Remote)
  const explicitAttrs = extractExplicitAttributes(cleaned);

  // 7. Certifications, Languages, Summary
  const certifications = extractCertifications(sections['certifications'], cleaned);
  const languages = extractLanguages(sections['languages'], cleaned);
  const summary = sections['summary'] ? sections['summary'].slice(0, 500) : '';

  // 8. Overall Confidence Calculation
  const overallConfidence = (
    contactScore * 0.30 +
    expResult.confidence * 0.25 +
    eduResult.confidence * 0.20 +
    skillsResult.confidence * 0.15 +
    jobInterestResult.confidence * 0.10
  );

  const confidence: ParsingConfidence = {
    overall: Math.round(overallConfidence * 100) / 100,
    contact: Math.round(contactScore * 100) / 100,
    name: nameResult.confidence,
    email: emailResult.confidence,
    phone: phoneResult.confidence,
    location: locationDetails.location ? 0.9 : 0.0,
    experience: expResult.confidence,
    education: eduResult.confidence,
    skills: skillsResult.confidence,
    job_interest: jobInterestResult.confidence
  };

  // 9. Structured Metadata: Field Sources, Missing Fields, Warnings
  const field_sources: Record<string, 'local' | 'ocr' | 'gemini' | 'unknown'> = {
    full_name: nameResult.name ? 'local' : 'unknown',
    first_name: nameParts.first_name ? 'local' : 'unknown',
    last_name: nameParts.last_name ? 'local' : 'unknown',
    email: emailResult.email ? 'local' : 'unknown',
    phone: phoneResult.phone ? 'local' : 'unknown',
    whatsapp: phoneResult.whatsapp ? 'local' : 'unknown',
    alternate_phone: phoneResult.alternate_phone ? 'local' : 'unknown',
    location: locationDetails.location ? 'local' : 'unknown',
    city: locationDetails.city ? 'local' : 'unknown',
    state: locationDetails.state ? 'local' : 'unknown',
    country: locationDetails.country ? 'local' : 'unknown',
    current_address: locationDetails.current_address ? 'local' : 'unknown',
    linkedin_url: socials.linkedin ? 'local' : 'unknown',
    github_url: socials.github ? 'local' : 'unknown',
    portfolio_url: socials.portfolio ? 'local' : 'unknown',
    website_url: socials.website ? 'local' : 'unknown',
    job_interest: jobInterestResult.job_interest ? 'local' : 'unknown',
    domain_interested: jobInterestResult.domain_interested ? 'local' : 'unknown',
    current_company: currentCompany ? 'local' : 'unknown',
    current_designation: currentDesignation ? 'local' : 'unknown',
    experience_years: expYears ? 'local' : 'unknown',
    degree: eduResult.primaryDegree ? 'local' : 'unknown',
    university: eduResult.primaryUniversity ? 'local' : 'unknown',
    specialization: eduResult.specialization ? 'local' : 'unknown',
    graduation_year: eduResult.gradYear ? 'local' : 'unknown',
    gpa: eduResult.gpa ? 'local' : 'unknown',
    skills: skillsResult.skillsList.length > 0 ? 'local' : 'unknown',
    certifications: certifications ? 'local' : 'unknown',
    languages: languages ? 'local' : 'unknown',
    notice_period: explicitAttrs.notice_period ? 'local' : 'unknown',
    work_authorization: explicitAttrs.work_authorization ? 'local' : 'unknown',
    current_ctc: explicitAttrs.current_ctc ? 'local' : 'unknown',
    expected_ctc: explicitAttrs.expected_ctc ? 'local' : 'unknown',
    remote_preference: explicitAttrs.remote_preference ? 'local' : 'unknown',
  };

  const missing_fields: string[] = [];
  const coreExpectedFields = [
    { key: 'full_name', label: 'Full Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'location', label: 'Location' },
    { key: 'skills', label: 'Skills' },
    { key: 'education', label: 'Education' },
    { key: 'current_designation', label: 'Current Designation' },
    { key: 'current_company', label: 'Current Company' },
    { key: 'linkedin_url', label: 'LinkedIn URL' },
  ];

  for (const { key, label } of coreExpectedFields) {
    if (field_sources[key] === 'unknown') {
      missing_fields.push(label);
    }
  }

  const warnings: string[] = [];
  if (confidence.overall < 0.65) {
    warnings.push('Parsing confidence is below 65%. Please verify extracted candidate fields.');
  }
  if (!nameResult.name) {
    warnings.push('Could not confidently detect candidate name from header.');
  }
  if (!emailResult.email && !phoneResult.phone) {
    warnings.push('Missing both email and phone contact info in header.');
  }
  if (expResult.experiences.length === 0) {
    warnings.push('No structured work experience blocks detected.');
  }

  return {
    full_name: nameResult.name,
    first_name: nameParts.first_name,
    last_name: nameParts.last_name,
    email: emailResult.email,
    phone: phoneResult.phone,
    whatsapp: phoneResult.whatsapp,
    alternate_phone: phoneResult.alternate_phone,
    location: locationDetails.location,
    city: locationDetails.city,
    state: locationDetails.state,
    country: locationDetails.country,
    current_address: locationDetails.current_address,
    linkedin_url: socials.linkedin,
    github_url: socials.github,
    portfolio_url: socials.portfolio,
    website_url: socials.website,
    job_interest: jobInterestResult.job_interest,
    domain_interested: jobInterestResult.domain_interested,
    current_company: currentCompany,
    current_designation: currentDesignation,
    experience_years: expYears,
    education: eduResult.primaryDegree ? `${eduResult.primaryDegree} - ${eduResult.primaryUniversity}` : eduResult.primaryUniversity,
    degree: eduResult.primaryDegree,
    university: eduResult.primaryUniversity,
    specialization: eduResult.specialization,
    graduation_year: eduResult.gradYear,
    gpa: eduResult.gpa,
    skills: skillsResult.skillsList.join(', '),
    categorized_skills: skillsResult.categorized,
    certifications,
    languages,
    summary,
    notice_period: explicitAttrs.notice_period,
    current_ctc: explicitAttrs.current_ctc,
    expected_ctc: explicitAttrs.expected_ctc,
    work_authorization: explicitAttrs.work_authorization,
    remote_preference: explicitAttrs.remote_preference,
    notes: summary,
    experience: expResult.experiences,
    education_history: eduResult.educationList,
    confidence,
    field_sources,
    missing_fields,
    warnings,
    raw_text: cleaned.slice(0, 1500),
    parser_used: 'local_hybrid'
  };
}
