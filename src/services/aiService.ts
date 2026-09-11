import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import { parseResumeLocally, LocalParsedResume } from './localResumeParser';

// Configure the worker for pdfjs safely across environments
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

export interface ParsedCandidate {
  full_name: string;
  phone: string;
  email: string;
  job_interest: string;
  location: string;
  education: string;
  degree: string;
  university: string;
  graduation_year: string;
  experience_years: string;
  current_company: string;
  current_designation: string;
  skills: string;
  linkedin_url: string;
  notes: string;
  github_url?: string;
  certifications?: string;
  languages?: string;
  summary?: string;
  categorized_skills?: Record<string, string[]>;
  confidence?: any;
  parser_used?: 'local_hybrid' | 'gemini' | 'gemini_merged' | 'heuristic';
}


const extractTextFromPDF = async (base64: string): Promise<string> => {
  try {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    let text = '';
    // Only parse the first 5 pages to save time/tokens if it's super long
    const numPages = Math.min(pdf.numPages, 5); 
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str);
      text += strings.join(' ') + '\n';
    }
    return text.trim();
  } catch (error) {
    console.error("PDF Extraction error:", error);
    return "";
  }
};

const extractTextFromDOCX = async (base64: string): Promise<string> => {
  try {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
    return result.value.trim();
  } catch (error) {
    console.error("DOCX Extraction error:", error);
    return "";
  }
};

const extractTextFromTXT = (base64: string): string => {
  try {
    return window.atob(base64).trim();
  } catch (error) {
    console.error("TXT Extraction error:", error);
    return "";
  }
};

export async function parseResume(fileBase64: string, mimeType: string): Promise<ParsedCandidate | null> {
  try {
    let textToParse = "";

    if (mimeType === 'application/pdf') {
      textToParse = await extractTextFromPDF(fileBase64);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/msword') {
      textToParse = await extractTextFromDOCX(fileBase64);
    } else if (mimeType === 'text/plain') {
      textToParse = extractTextFromTXT(fileBase64);
    }

    // 1. Primary approach: Server-side API endpoint with local hybrid + Gemini fallback
    try {
      const response = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          textToParse,
          fileBase64: textToParse.length > 50 ? '' : fileBase64,
          mimeType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.candidate) {
          return data.candidate as ParsedCandidate;
        }
      } else {
        const errJson = await response.json().catch(() => ({}));
        if (errJson.candidate) {
          return errJson.candidate as ParsedCandidate;
        }

        // Handle specific server-side errors with clear user-friendly messages
        if (response.status === 422) {
          throw new Error(errJson.error || 'This PDF appears to be a scanned image with no readable text layer. Please upload a searchable text-based PDF/DOCX or configure Cloud OCR.');
        }
        if (response.status === 413) {
          throw new Error('File size exceeds the 10MB limit. Please upload a smaller document.');
        }
        if (response.status === 400 && errJson.error) {
          throw new Error(errJson.error);
        }
        if (response.status === 502 && errJson.error) {
          throw new Error(errJson.error);
        }
        console.warn('Server resume parse route returned non-OK status:', response.status, errJson);
      }
    } catch (apiErr: any) {
      // If error was explicitly thrown above with an intentional user-facing message, propagate it
      if (apiErr?.message && (
        apiErr.message.includes('scanned') ||
        apiErr.message.includes('readable text') ||
        apiErr.message.includes('password') ||
        apiErr.message.includes('10MB') ||
        apiErr.message.includes('corrupted') ||
        apiErr.message.includes('Cloud OCR')
      )) {
        throw apiErr;
      }
      console.warn('Could not reach /api/resume/parse, using client-side local parser fallback:', apiErr);
    }

    // 2. Client-side local deterministic parser (Zero network, < 10ms, offline resilient)
    if (textToParse && textToParse.length > 20) {
      const localResult: LocalParsedResume = parseResumeLocally(textToParse);
      // If we have contact info or candidate name, return local result immediately
      if (localResult.full_name || localResult.email || localResult.phone) {
        return localResult as ParsedCandidate;
      }
    }

    // 3. Fallback: if client extracted some text, return whatever the local parser extracted
    if (textToParse && textToParse.trim().length > 0) {
      return parseResumeLocally(textToParse) as ParsedCandidate;
    }

    // 4. If no text was extracted at all (e.g. image-only PDF while server was unreachable)
    throw new Error('This document contains no readable text layer. Please upload a searchable text-based PDF or DOCX file.');
  } catch (error: any) {
    console.error("Error in parseResume:", error);
    throw error;
  }
}
