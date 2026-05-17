import type { Job } from '../types'
import type { ResumeAnalysis } from './api'

export interface FitScore {
  overall: number          // 0–100 weighted total
  skills: number           // skill overlap %
  level: number            // experience level proximity %
  role: number             // job title match %
  matchedSkills: string[]  // skills found in JD
  missingSignals: string[] // JD tags not in resume
}

const LEVEL_MAP: Record<string, number> = {
  Junior: 1, 'Mid-level': 2, Senior: 3, Lead: 4, Staff: 5, Principal: 6,
}

// Score degradation per seniority level of distance
const LEVEL_SCORE = [100, 75, 45, 20, 10, 5]

// Exported so JobsPage can pre-filter the "For You" list before scoring.
// Parse the minimum years of experience required from a job description.
// Handles: "5+ years", "3-5 years", "at least 4 years", "minimum 6 years",
//          "5 years of experience", "5 years experience"
export function parseRequiredYears(text: string): number | null {
  const t = text.toLowerCase()
  const patterns = [
    /\bat\s+least\s+(\d+)\s+years?/,
    /\bminimum\s+(?:of\s+)?(\d+)\s+years?/,
    /(\d+)\s*\+\s*years?\s+(?:of\s+)?(?:experience|exp)/,
    /(\d+)\s*\+\s*years?/,
    /(\d+)\s*[-–]\s*\d+\s*years?\s+(?:of\s+)?(?:experience|exp)/,
    /(\d+)\s*[-–]\s*\d+\s*years?/,
    /(\d+)\s+years?\s+(?:of\s+)?(?:professional\s+)?(?:experience|exp)/,
  ]
  for (const pattern of patterns) {
    const m = t.match(pattern)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

// Map years of experience to a seniority level number
function yearsToLevel(years: number): number {
  if (years >= 10) return 6  // Principal
  if (years >= 7)  return 5  // Staff
  if (years >= 5)  return 4  // Lead / Senior+
  if (years >= 3)  return 3  // Senior
  if (years >= 1)  return 2  // Mid-level
  return 1                   // Junior
}

// Detect the seniority level of a job from its title and description.
// Title keywords take priority; years of experience in description is the fallback.
function detectJobLevel(title: string, description: string): number {
  const t = `${title} ${description}`.toLowerCase()

  if (/\b(principal|distinguished|fellow)\b/.test(t))                        return 6
  if (/\bstaff\s+(engineer|developer|dev)\b/.test(t))                        return 5
  if (/\b(tech\s*lead|lead\s+(engineer|developer|dev)|engineering\s+lead)\b/.test(t)) return 4
  if (/\bsenior\b/.test(t))                                                  return 3
  if (/\b(mid[- ]level|intermediate)\b/.test(t))                             return 2
  if (/\b(junior|entry[- ]level|graduate|intern)\b/.test(t))                 return 1

  // Fallback: infer level from required years mentioned in description
  const requiredYears = parseRequiredYears(description)
  if (requiredYears !== null) return yearsToLevel(requiredYears)

  return 3 // default: mid-senior
}

// Compute a years-based experience penalty on top of level scoring.
// Returns 0 (no penalty) to -40 (severe mismatch) so we don't over-penalise.
function yearsGapPenalty(resumeYears: number | undefined, description: string): number {
  if (!resumeYears) return 0
  const required = parseRequiredYears(description)
  if (required === null) return 0

  const gap = required - resumeYears
  if (gap <= 0) return 0            // candidate meets or exceeds requirement
  // Under by 1–2 years: small penalty. Under by 3+: significant.
  return Math.min(40, gap * 12)
}

export function scoreJob(job: Job, analysis: ResumeAnalysis): FitScore {
  const jobText = `${job.title} ${job.tags ?? ''} ${job.description ?? ''}`.toLowerCase()
  const desc = job.description ?? ''

  // ── 1. Skill overlap (50%) ────────────────────────────────────────────────
  const allSkills = [...new Set([...analysis.skills, ...analysis.searchKeywords])]
  const matchedSkills = allSkills.filter(s => jobText.includes(s.toLowerCase()))
  const skillScore = allSkills.length > 0
    ? Math.min(100, Math.round((matchedSkills.length / allSkills.length) * 130))
    : 50

  // ── 2. Experience level fit (30%) ─────────────────────────────────────────
  const resumeLevel = LEVEL_MAP[analysis.experienceLevel] ?? 3
  const jobLevel    = detectJobLevel(job.title, desc)
  // Base level score from seniority distance
  const baseLevelScore = LEVEL_SCORE[Math.abs(resumeLevel - jobLevel)] ?? 5
  // Subtract years gap penalty (e.g. JD asks 7 yrs, candidate has 2 yrs → -60 → floor 0)
  const penalty    = yearsGapPenalty(analysis.yearsOfExperience, desc)
  const levelScore = Math.max(0, baseLevelScore - penalty)

  // ── 3. Role / title match (20%) ───────────────────────────────────────────
  const jobTitle = job.title.toLowerCase()
  const roleWords = analysis.jobTitles
    .flatMap(t => t.toLowerCase().split(/\s+/))
    .filter(w => w.length > 3)
  const roleHits = roleWords.filter(w => jobTitle.includes(w)).length
  const roleScore = roleWords.length > 0
    ? Math.min(100, Math.round((roleHits / roleWords.length) * 250))
    : 40

  // ── Missing signals ───────────────────────────────────────────────────────
  const resumeSkillsLower = allSkills.map(s => s.toLowerCase())
  const missingSignals = (job.tags ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 2 && !resumeSkillsLower.some(s => s.includes(t.toLowerCase()) || t.toLowerCase().includes(s)))
    .slice(0, 5)

  const overall = Math.min(100, Math.round(skillScore * 0.5 + levelScore * 0.3 + roleScore * 0.2))

  return {
    overall,
    skills: skillScore,
    level: levelScore,
    role: roleScore,
    matchedSkills: matchedSkills.slice(0, 8),
    missingSignals,
  }
}

export function scoreLabel(score: number): string {
  if (score >= 80) return 'Excellent match'
  if (score >= 65) return 'Good match'
  if (score >= 45) return 'Partial match'
  return 'Low match'
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
  if (score >= 65) return 'text-brand-400 bg-brand-500/15 border-brand-500/30'
  if (score >= 45) return 'text-yellow-500 bg-yellow-500/15 border-yellow-500/30'
  return 'text-slate-400 bg-slate-700/50 border-slate-600'
}
