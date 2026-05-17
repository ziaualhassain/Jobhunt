import type { Job } from '../types'
import type { ResumeAnalysis } from './api'

export interface FitScore {
  overall: number        // 0–100 weighted total
  skills: number         // skill overlap %
  level: number          // experience level proximity %
  role: number           // job title match % (0 when no target titles set)
  location: number       // region/remote match %
  roleActive: boolean    // false when jobTitles was empty — role excluded from formula
  matchedSkills: string[]
  missingSignals: string[]
  reasons: string[]
}

export const LEVEL_MAP: Record<string, number> = {
  Junior: 1, 'Mid-level': 2, Senior: 3, Lead: 4, Staff: 5, Principal: 6,
}

// Score degradation table indexed by seniority distance (0 = perfect match)
const LEVEL_SCORE = [100, 80, 50, 25, 10, 5]

// Skills that earn an extra bonus when matched — high-value signals
const PRIMARY_SKILLS = new Set([
  'python', 'typescript', 'javascript', 'java', 'golang', 'go', 'rust',
  'kotlin', 'scala', 'c++', 'c#', 'php', 'ruby', 'swift',
  'react', 'vue', 'angular', 'nextjs', 'next.js', 'node.js', 'nodejs',
  'aws', 'azure', 'gcp', 'google cloud',
  'kubernetes', 'k8s', 'docker', 'terraform', 'ansible',
  'machine learning', 'deep learning', 'pytorch', 'tensorflow', 'llm',
  'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
  'graphql', 'grpc', 'rest api',
  'spring', 'django', 'flask', 'fastapi', 'rails', 'express',
])

// Word-boundary match — prevents 'java' matching 'javascript', etc.
function wordBoundaryTest(text: string, term: string): boolean {
  if (!term || !text) return false
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
  } catch {
    return text.toLowerCase().includes(term.toLowerCase())
  }
}

// Filler adjectives that precede a real title in natural-language descriptions
const FILLER_PREFIX = /^(?:(?:highly|very|extremely|well|truly)\s+)?(?:skilled|experienced|talented|passionate|dynamic|proven|dedicated|motivated|results.?driven|detail.?oriented|hard.?working)\s+/i

// Strip trailing location/mode noise and leading filler adjectives
function cleanExtracted(s: string): string {
  return s
    .replace(/\s*\((?:remote|on.?site|hybrid|work from|anywhere|full.?time|part.?time|contract)[^)]*\)/gi, '')
    .replace(FILLER_PREFIX, '')
    .replace(/\s*[-–|,]\s*$/, '')
    .trim()
}

export function extractTitleFromDescription(desc: string): string | null {
  if (!desc) return null

  const try1 = (re: RegExp): string | null => {
    const m = desc.match(re)
    if (!m) return null
    const t = cleanExtracted(m[1])
    return t.length >= 4 && t.length <= 100 ? t : null
  }

  // Ranked by reliability — first non-null wins
  return (
    // **Job Title: Foo**  (inline bold)
    try1(/\*\*Job\s+Title\s*:\s*([^*\n]{4,100}?)\*\*/i) ??
    // Job Title: Foo  (plain or partial bold)
    try1(/\*{0,2}Job\s+Title\s*:\s*\*{0,2}\s*([^\n*]{4,100}?)(?:\n|$)/i) ??
    // **Role** : Foo  or  **Role**: Foo
    try1(/\*\*Role\*\*\s*:\s*([^*\n(]{4,80})/i) ??
    try1(/\bRole\s*:\s*\*?\s*([A-Z][^\n*(]{4,80})/i) ??
    // **Position:** Foo
    try1(/\*{0,2}Position\*{0,2}\s*:\s*([A-Z][^\n*(]{4,80})/i) ??
    // **Title:** Foo  or  Title: Foo
    try1(/\*{0,2}Title\s*:\s*\*{0,2}\s*([A-Z][^\n*(]{4,80})/i) ??
    // **Job Description** - Foo - **...**
    try1(/\*\*Job Description\*\*\s*-\s*(.+?)\s*-\s*\*\*/i) ??
    // *Job Description: Foo**
    try1(/\*{1,2}Job\s+Description\s*:\s*(.+?)\*{1,2}/i) ??
    // Plain "Job Description - Foo" or "Job Description: Foo"
    try1(/Job\s+Description\s*[-:]\s*([A-Z][^\n\-*]{4,80}?)(?:\s*[-*\n]|$)/i) ??
    // Title at start followed by metadata key (Location:, Experience:, etc.)
    try1(/^([A-Z][a-zA-Z]+(?:[ \t]+[A-Z][a-zA-Z()\/-]+){0,4})[ \t]*(?=[ \t]*\n|[ \t]*[-–]|[ \t]+(?:Location|Experience|Salary|CTC|Type|Notice|Mode)\s*:)/m) ??
    // Natural language: "looking for a [adj] X to/who/with"
    try1(/\blooking\s+for\s+(?:a|an)\s+([\w][^\n]{4,80}?)(?=\s+(?:to\b|who\b|with\b|that\b))/i) ??
    // "seeking a [adj] X to/who/with/for"
    try1(/\bseeking\s+(?:a|an)\s+([\w][^\n]{4,80}?)(?=\s+(?:to\b|who\b|with\b|for\b))/i) ??
    // "we're/we are hiring/recruiting a X"
    try1(/(?:we'?re?|we are)\s+(?:hiring|seeking|recruiting)\s+(?:a|an)\s+([\w][^\n]{4,80}?)(?=\s+(?:to\b|who\b|for\b)|\n|$)/i) ??
    // Markdown heading: ## Foo
    try1(/^#{1,3}\s+([A-Z][^\n#]{4,80})$/m) ??
    // First bold block at description start
    try1(/^\*\*([A-Z][^*\n]{4,60})\*\*/) ??
    null
  )
}

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

function yearsToLevel(years: number): number {
  if (years >= 10) return 6
  if (years >= 7)  return 5
  if (years >= 5)  return 4
  if (years >= 3)  return 3
  if (years >= 1)  return 2
  return 1
}

function detectJobLevel(title: string, description: string): number {
  const t = `${title} ${description}`.toLowerCase()
  if (/\b(principal|distinguished|fellow)\b/.test(t))                                return 6
  if (/\bstaff\s+(engineer|developer|dev)\b/.test(t))                                return 5
  if (/\b(tech\s*lead|lead\s+(engineer|developer|dev)|engineering\s+lead)\b/.test(t)) return 4
  if (/\bsenior\b/.test(t))                                                          return 3
  if (/\b(mid[- ]level|intermediate)\b/.test(t))                                     return 2
  if (/\b(junior|entry[- ]level|graduate|intern)\b/.test(t))                         return 1
  const requiredYears = parseRequiredYears(description)
  if (requiredYears !== null) return yearsToLevel(requiredYears)
  return 2 // default: mid-level
}

function yearsGapPenalty(resumeYears: number | undefined, description: string): number {
  if (!resumeYears) return 0
  const required = parseRequiredYears(description)
  if (required === null) return 0
  const gap = required - resumeYears
  if (gap <= 0) return 0
  return Math.min(40, gap * 12)
}

// Base weights when job titles are available for role matching
const W_WITH_ROLE    = { skills: 0.40, level: 0.25, role: 0.20, location: 0.15 }
// When no job titles set (profile-only, no resume), Role is meaningless —
// redistribute its 20% evenly to Skills and Level
const W_WITHOUT_ROLE = { skills: 0.50, level: 0.35, role: 0,    location: 0.15 }

export function scoreJob(job: Job, analysis: ResumeAnalysis, profileRegion?: string): FitScore {
  const desc = job.description ?? ''
  const effectiveTitle = job.title?.trim() || extractTitleFromDescription(desc) || ''
  const jobTextFull = `${effectiveTitle} ${job.tags ?? ''} ${desc}`
  const allSkills = [...new Set([...analysis.skills, ...analysis.searchKeywords])]

  // ── 1. Skill overlap (40%) ────────────────────────────────────────────────
  // Word-boundary regex prevents 'java' → 'javascript' false positives
  const matchedSkills = allSkills.filter(s => wordBoundaryTest(jobTextFull, s))

  // Title match = primary tech stack signal → bonus up to +20
  const titleMatches = matchedSkills.filter(s => wordBoundaryTest(effectiveTitle, s))
  const titleBonus = Math.min(20, titleMatches.length * 7)

  // High-value skill hit → bonus up to +15
  const primaryMatches = matchedSkills.filter(s => PRIMARY_SKILLS.has(s.toLowerCase()))
  const primaryBonus = Math.min(15, primaryMatches.length * 4)

  const rawSkillPct = allSkills.length > 0
    ? (matchedSkills.length / allSkills.length) * 100
    : 50
  const skillScore = Math.min(100, Math.round(rawSkillPct + titleBonus + primaryBonus))

  // ── 2. Experience level fit (25%) ─────────────────────────────────────────
  const resumeLevel = LEVEL_MAP[analysis.experienceLevel] ?? 2
  const jobLevel    = detectJobLevel(effectiveTitle, desc)
  const baseLevelScore = LEVEL_SCORE[Math.abs(resumeLevel - jobLevel)] ?? 5
  const penalty    = yearsGapPenalty(analysis.yearsOfExperience, desc)
  const levelScore = Math.max(0, baseLevelScore - penalty)

  // ── 3. Role / title match (only when job titles are available) ───────────
  const jobTitleLower = effectiveTitle.toLowerCase()
  const roleWords = analysis.jobTitles
    .flatMap(t => t.toLowerCase().split(/\s+/))
    .filter(w => w.length > 3)
  const roleActive = roleWords.length > 0

  const exactTitleMatch = analysis.jobTitles.some(t =>
    effectiveTitle.toLowerCase().includes(t.toLowerCase())
  )
  const roleHits = roleWords.filter(w => wordBoundaryTest(jobTitleLower, w)).length
  const rawRoleScore = roleActive
    ? Math.round((roleHits / roleWords.length) * 200)
    : 0
  const roleScore = Math.min(100, rawRoleScore + (exactTitleMatch ? 20 : 0))

  // ── 4. Location match (15%) ───────────────────────────────────────────────
  let locationScore = 60 // neutral — no preference set → not penalised
  if (profileRegion) {
    const jobLoc = `${job.location ?? ''} ${job.region ?? ''}`.toLowerCase()
    const pRegion = profileRegion.toLowerCase()
    const isRemote = /remote|anywhere|worldwide|global/.test(jobLoc)
    const regionMatch = jobLoc.includes(pRegion)

    if (pRegion === 'remote') {
      locationScore = isRemote ? 100 : 30
    } else if (regionMatch) {
      locationScore = 100
    } else if (isRemote) {
      locationScore = 70 // remote acceptable even when user prefers a region
    } else {
      locationScore = 15 // clear location mismatch
    }
  }

  // ── Missing signals ───────────────────────────────────────────────────────
  const resumeSkillsLower = allSkills.map(s => s.toLowerCase())
  const missingSignals = (job.tags ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 2 && !resumeSkillsLower.some(s =>
      s.includes(t.toLowerCase()) || t.toLowerCase().includes(s)
    ))
    .slice(0, 6)

  // ── Human-readable reasons ────────────────────────────────────────────────
  const reasons: string[] = []
  if (titleMatches.length > 0)
    reasons.push(`${titleMatches.slice(0, 3).join(', ')} in job title`)
  if (matchedSkills.length >= 5)
    reasons.push(`${matchedSkills.length} of your skills found`)
  else if (matchedSkills.length > 0)
    reasons.push(`${matchedSkills.length} skill${matchedSkills.length > 1 ? 's' : ''} matched`)
  else
    reasons.push('No skill overlap detected')
  if (roleActive && exactTitleMatch)
    reasons.push('Title matches your target role')
  if (levelScore >= 80)
    reasons.push('Experience level is a great fit')
  else if (levelScore < 30)
    reasons.push('Experience level gap')
  if (profileRegion && locationScore >= 100)
    reasons.push(`Located in ${profileRegion}`)
  else if (profileRegion && locationScore < 30)
    reasons.push('Location outside preference')
  if (job.salary)
    reasons.push('Salary listed')

  const W = roleActive ? W_WITH_ROLE : W_WITHOUT_ROLE
  const overall = Math.min(100, Math.round(
    skillScore    * W.skills   +
    levelScore    * W.level    +
    roleScore     * W.role     +
    locationScore * W.location
  ))

  return {
    overall,
    skills: skillScore,
    level: levelScore,
    role: roleScore,
    location: locationScore,
    roleActive,
    matchedSkills: matchedSkills.slice(0, 8),
    missingSignals,
    reasons,
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
