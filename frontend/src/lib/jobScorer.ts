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

// Score degradation for each level of seniority distance
const LEVEL_SCORE = [100, 75, 45, 20, 10, 5]

function detectJobLevel(title: string, description: string): number {
  const t = `${title} ${description}`.toLowerCase()
  if (/\b(principal|distinguished|fellow)\b/.test(t)) return 6
  if (/\bstaff\s+(engineer|developer|dev)\b/.test(t)) return 5
  if (/\b(tech\s*lead|lead\s+(engineer|developer|dev)|engineering\s+lead)\b/.test(t)) return 4
  if (/\bsenior\b/.test(t)) return 3
  if (/\b(mid[- ]level|intermediate)\b/.test(t)) return 2
  if (/\b(junior|entry[- ]level|graduate|intern)\b/.test(t)) return 1
  return 3 // default: mid-senior
}

export function scoreJob(job: Job, analysis: ResumeAnalysis): FitScore {
  const jobText = `${job.title} ${job.tags ?? ''} ${job.description ?? ''}`.toLowerCase()

  // ── 1. Skill overlap (50%) ────────────────────────────────────────────────
  const allSkills = [...new Set([...analysis.skills, ...analysis.searchKeywords])]
  const matchedSkills = allSkills.filter(s => jobText.includes(s.toLowerCase()))
  // Give a slight boost so a 60% raw overlap doesn't feel too low
  const skillScore = allSkills.length > 0
    ? Math.min(100, Math.round((matchedSkills.length / allSkills.length) * 130))
    : 50

  // ── 2. Experience level fit (30%) ─────────────────────────────────────────
  const resumeLevel = LEVEL_MAP[analysis.experienceLevel] ?? 3
  const jobLevel = detectJobLevel(job.title, job.description ?? '')
  const levelScore = LEVEL_SCORE[Math.abs(resumeLevel - jobLevel)] ?? 5

  // ── 3. Role / title match (20%) ───────────────────────────────────────────
  const jobTitle = job.title.toLowerCase()
  const roleWords = analysis.jobTitles
    .flatMap(t => t.toLowerCase().split(/\s+/))
    .filter(w => w.length > 3)
  const roleHits = roleWords.filter(w => jobTitle.includes(w)).length
  // Generous — even 1 word match (e.g. "backend") scores well
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
