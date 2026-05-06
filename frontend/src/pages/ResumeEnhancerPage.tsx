import { useState, useRef } from 'react'
import {
  Upload, FileText, Loader2, AlertCircle, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronUp, Target, Sparkles, Wand2,
  ArrowRight, ArrowLeft, Copy, Check, Mail, Phone, MapPin,
  Linkedin, Github, Globe, ExternalLink, BookOpen, Award, Download,
  FileCode,
} from 'lucide-react'
import { enhanceResume, rewriteResume, downloadResumePdf, downloadResumeLatex } from '../lib/api'
import type { ResumeEnhancement, GeneratedResume } from '../lib/api'

// ─── score helpers ────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  ats_compatibility: 'ATS Compatibility',
  keyword_match: 'Keyword Match',
  experience_presentation: 'Experience',
  skills_section: 'Skills',
  quantification: 'Quantification',
}

const SEVERITY_CONFIG = {
  high:   { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-900/20 border-red-800',       label: 'High'   },
  medium: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800', label: 'Medium' },
  low:    { icon: AlertCircle,   color: 'text-blue-400',   bg: 'bg-blue-900/20 border-blue-800',     label: 'Low'    },
}

function scoreColor(s: number) {
  return s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-yellow-400' : 'text-red-400'
}
function scoreBar(s: number) {
  return s >= 80 ? 'bg-emerald-500' : s >= 60 ? 'bg-yellow-500' : 'bg-red-500'
}
function scoreRing(s: number) {
  return s >= 80 ? '#10b981' : s >= 60 ? '#eab308' : '#ef4444'
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const r = 44
  const circ = 2 * Math.PI * r
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(30,41,59)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={scoreRing(score)} strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score / 100)}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold leading-none ${scoreColor(score)}`}>{score}</span>
        <span className={`text-xs font-bold mt-0.5 ${scoreColor(score)}`}>{grade}</span>
      </div>
    </div>
  )
}

// ─── SectionBar ──────────────────────────────────────────────────────────────

function SectionBar({ label, score, feedback }: { label: string; score: number; feedback: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 hover:bg-slate-800/50 px-2 py-1 rounded-lg transition-colors"
      >
        <span className="text-sm text-slate-300 w-44 text-left shrink-0">{label}</span>
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${scoreBar(score)} rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
        </div>
        <span className={`text-sm font-bold w-8 text-right shrink-0 ${scoreColor(score)}`}>{score}</span>
        {open ? <ChevronUp size={12} className="text-slate-500 shrink-0" /> : <ChevronDown size={12} className="text-slate-500 shrink-0" />}
      </button>
      {open && <p className="text-xs text-slate-400 pl-2 pb-1 leading-relaxed">{feedback}</p>}
    </div>
  )
}

// ─── Rewrite wizard ───────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  {
    id: 'achievements',
    title: 'Key Achievements',
    subtitle: 'What did you actually accomplish? Numbers make bullets powerful.',
    placeholder: `Examples:
• Reduced API latency by 40% by introducing Redis caching
• Led a team of 6 engineers to deliver a payments module on time
• Grew monthly active users from 10k to 80k in 12 months
• Saved $200k/year by migrating infrastructure to AWS Lambda`,
    field: 'achievements' as const,
  },
  {
    id: 'projects',
    title: 'Notable Projects',
    subtitle: 'Highlight your best projects — personal, open source, or professional.',
    placeholder: `Examples:
• Real-time chat app (Node.js, Redis, WebSockets) — 2k GitHub stars
• ML pipeline for fraud detection — reduced false positives by 30%
• E-commerce platform serving 50k daily transactions`,
    field: 'projects' as const,
  },
  {
    id: 'extraSkills',
    title: 'Skills & Certifications to Add',
    subtitle: 'Anything missing from your original resume?',
    placeholder: `Examples:
• AWS Solutions Architect Associate (2024)
• GraphQL, Terraform, Playwright
• Fluent in Spanish`,
    field: 'extraSkills' as const,
  },
]

interface WizardData { achievements: string; projects: string; extraSkills: string }

function RewriteWizard({
  file, targetRole, targetSkills, missingKeywords,
  onClose, onDone,
}: {
  file: File
  targetRole: string
  targetSkills: string
  missingKeywords: string[]
  onClose: () => void
  onDone: (result: GeneratedResume) => void
}) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>({ achievements: '', projects: '', extraSkills: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const current = WIZARD_STEPS[step]
  const isLast = step === WIZARD_STEPS.length - 1

  async function handleGenerate() {
    setLoading(true); setError('')
    try {
      const result = await rewriteResume(
        file, targetRole, targetSkills,
        data.achievements, data.projects, data.extraSkills, missingKeywords,
      )
      onDone(result)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Generation failed. Is Ollama running?')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Wand2 size={17} className="text-brand-400" />
            <span className="text-base font-semibold text-slate-100">Rewrite My Resume</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <XCircle size={18} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-1.5 mb-5 mt-3">
          {WIZARD_STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 rounded-full flex-1 transition-colors ${
                i <= step ? 'bg-brand-500' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-0.5">{current.title}</h3>
          <p className="text-xs text-slate-500 mb-3">{current.subtitle}</p>
          <textarea
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none leading-relaxed"
            rows={8}
            placeholder={current.placeholder}
            value={data[current.field]}
            onChange={e => setData(d => ({ ...d, [current.field]: e.target.value }))}
          />
        </div>

        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1.5 mb-3">
            <AlertCircle size={12} />{error}
          </p>
        )}

        {/* Nav buttons */}
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 text-sm transition-colors"
            >
              <ArrowLeft size={14} />Back
            </button>
          )}
          <div className="flex-1" />
          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              className="btn-primary flex items-center gap-1.5"
            >
              Next<ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="btn-primary flex items-center gap-2"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" />Rewriting…</>
                : <><Wand2 size={14} />Generate Resume</>
              }
            </button>
          )}
        </div>

        {loading && (
          <p className="text-xs text-slate-500 text-center mt-3">
            This may take 1–2 minutes with Ollama…
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Resume preview ───────────────────────────────────────────────────────────

function ContactItem({ icon: Icon, value, href }: { icon: React.ElementType; value: string; href?: string }) {
  if (!value) return null
  const content = (
    <span className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-400 transition-colors">
      <Icon size={11} className="text-slate-500 shrink-0" />
      {value}
    </span>
  )
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">{content}</a>
  ) : <span>{content}</span>
}

function toPlainText(r: GeneratedResume): string {
  const lines: string[] = []
  lines.push(r.name.toUpperCase())
  const contact = [r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin, r.contact.github].filter(Boolean)
  if (contact.length) lines.push(contact.join(' | '))
  lines.push('')
  if (r.summary) { lines.push('PROFESSIONAL SUMMARY'); lines.push(r.summary); lines.push('') }
  if (r.experience.length) {
    lines.push('EXPERIENCE')
    r.experience.forEach(e => {
      lines.push(`${e.title} — ${e.company}${e.location ? `, ${e.location}` : ''} (${e.period})`)
      e.bullets.forEach(b => lines.push(`  • ${b}`))
      lines.push('')
    })
  }
  if (r.skills.length) { lines.push('SKILLS'); lines.push(r.skills.join(', ')); lines.push('') }
  if (r.education.length) {
    lines.push('EDUCATION')
    r.education.forEach(e => lines.push(`${e.degree} — ${e.institution} (${e.year})`))
    lines.push('')
  }
  if (r.projects.length) {
    lines.push('PROJECTS')
    r.projects.forEach(p => {
      lines.push(`${p.name} [${p.tech}]`)
      lines.push(`  ${p.description}`)
    })
    lines.push('')
  }
  if (r.certifications.length) { lines.push('CERTIFICATIONS'); r.certifications.forEach(c => lines.push(`• ${c}`)) }
  return lines.join('\n')
}

// ─── Template metadata ────────────────────────────────────────────────────────

const PDF_TEMPLATES = [
  { id: 'jake',        label: 'Jake Classic',  desc: 'Standard two-column, Helvetica' },
  { id: 'traditional', label: 'Corporate Pro', desc: 'Times Roman, left-aligned' },
  { id: 'clean',       label: 'Modern Clean',  desc: 'Minimal, stacked entries' },
  { id: 'technical',   label: 'Tech Focus',    desc: 'Skills & projects first' },
  { id: 'compact',     label: 'Compact Plus',  desc: 'Small font, fits more content' },
]

const LATEX_TEMPLATES = [
  { id: 'jake',         label: "Jake's Resume", desc: 'The classic standard' },
  { id: 'professional', label: 'Professional',  desc: 'Bold headings, corporate' },
  { id: 'compact',      label: 'Compact 10pt',  desc: 'Dense, 1-page friendly' },
  { id: 'technical',    label: 'Tech Focus',    desc: 'Skills & projects first' },
  { id: 'minimal',      label: 'Minimal ATS',   desc: 'Zero packages, max compat' },
]

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function ResumePreview({ resume }: { resume: GeneratedResume }) {
  const [copied, setCopied] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [downloadingTex, setDownloadingTex] = useState(false)
  const [pdfTemplate, setPdfTemplate] = useState('jake')
  const [latexTemplate, setLatexTemplate] = useState('jake')
  const [showPdfPicker, setShowPdfPicker] = useState(false)
  const [showLatexPicker, setShowLatexPicker] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(toPlainText(resume))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true); setShowPdfPicker(false)
    try {
      const blob = await downloadResumePdf(resume, pdfTemplate)
      const name = resume.name?.replace(/\s+/g, '_') || 'resume'
      triggerBlobDownload(blob, `${name}_resume.pdf`)
    } catch {
      alert('PDF generation failed. Please try again.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  async function handleDownloadLatex() {
    setDownloadingTex(true); setShowLatexPicker(false)
    try {
      const blob = await downloadResumeLatex(resume, latexTemplate)
      const name = resume.name?.replace(/\s+/g, '_') || 'resume'
      triggerBlobDownload(blob, `${name}_resume.tex`)
    } catch {
      alert('LaTeX export failed. Please try again.')
    } finally {
      setDownloadingTex(false)
    }
  }

  const { contact } = resume

  const activePdfTpl = PDF_TEMPLATES.find(t => t.id === pdfTemplate)!
  const activeLatexTpl = LATEX_TEMPLATES.find(t => t.id === latexTemplate)!

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-semibold text-slate-200">Rewritten Resume</span>
          <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">AI Generated</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
          >
            {copied ? <><Check size={12} className="text-emerald-400" />Copied!</> : <><Copy size={12} />Copy text</>}
          </button>

          {/* .tex download with template picker */}
          <div className="relative">
            <div className="flex items-stretch rounded-lg border border-slate-600 overflow-hidden">
              <button
                onClick={handleDownloadLatex}
                disabled={downloadingTex}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-800/60 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {downloadingTex
                  ? <><Loader2 size={12} className="animate-spin" />Exporting…</>
                  : <><FileCode size={12} />.tex — {activeLatexTpl.label}</>
                }
              </button>
              <button
                onClick={() => { setShowLatexPicker(v => !v); setShowPdfPicker(false) }}
                className="px-1.5 bg-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-600 transition-colors border-l border-slate-600 text-[10px]"
                title="Choose LaTeX template"
              >
                <ChevronDown size={11} />
              </button>
            </div>
            {showLatexPicker && (
              <div className="absolute right-0 top-full mt-1 z-10 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium px-3 pt-2.5 pb-1">LaTeX Template</p>
                {LATEX_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setLatexTemplate(t.id); setShowLatexPicker(false) }}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors ${latexTemplate === t.id ? 'bg-slate-700/60' : ''}`}
                  >
                    <p className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                      {latexTemplate === t.id && <Check size={10} className="text-emerald-400" />}
                      {t.label}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PDF download with template picker */}
          <div className="relative">
            <div className="flex items-stretch rounded-lg border border-brand-500/40 overflow-hidden">
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors disabled:opacity-50"
              >
                {downloadingPdf
                  ? <><Loader2 size={12} className="animate-spin" />Exporting…</>
                  : <><Download size={12} />PDF — {activePdfTpl.label}</>
                }
              </button>
              <button
                onClick={() => { setShowPdfPicker(v => !v); setShowLatexPicker(false) }}
                className="px-1.5 bg-brand-500/10 text-brand-500/70 hover:bg-brand-500/20 hover:text-brand-400 transition-colors border-l border-brand-500/30 text-[10px]"
                title="Choose PDF template"
              >
                <ChevronDown size={11} />
              </button>
            </div>
            {showPdfPicker && (
              <div className="absolute right-0 top-full mt-1 z-10 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium px-3 pt-2.5 pb-1">PDF Template</p>
                {PDF_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setPdfTemplate(t.id); setShowPdfPicker(false) }}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors ${pdfTemplate === t.id ? 'bg-slate-700/60' : ''}`}
                  >
                    <p className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                      {pdfTemplate === t.id && <Check size={10} className="text-emerald-400" />}
                      {t.label}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ATS note */}
      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
        PDF is text-based (not an image) — fully readable by ATS scanners. The .tex file can be compiled on{' '}
        <a href="https://overleaf.com" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">Overleaf</a>
        {' '}for a typeset version.
      </p>

      {/* Resume card */}
      <div className="card overflow-hidden">
        {/* Name + contact header */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border-b border-slate-700/60 px-7 py-6">
          <h1 className="text-2xl font-bold text-slate-100 tracking-wide">{resume.name || 'Your Name'}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            <ContactItem icon={Mail} value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
            <ContactItem icon={Phone} value={contact.phone} />
            <ContactItem icon={MapPin} value={contact.location} />
            <ContactItem icon={Linkedin} value={contact.linkedin} href={contact.linkedin} />
            <ContactItem icon={Github} value={contact.github} href={contact.github} />
            <ContactItem icon={Globe} value={contact.website} href={contact.website} />
          </div>
        </div>

        <div className="px-7 py-6 space-y-6">
          {/* Summary */}
          {resume.summary && (
            <section>
              <h2 className="text-[11px] font-bold text-brand-400 uppercase tracking-widest mb-2">Professional Summary</h2>
              <p className="text-sm text-slate-300 leading-relaxed">{resume.summary}</p>
            </section>
          )}

          {/* Experience */}
          {resume.experience.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold text-brand-400 uppercase tracking-widest mb-3">Experience</h2>
              <div className="space-y-5">
                {resume.experience.map((exp, i) => (
                  <div key={i} className="relative pl-4 border-l border-slate-700">
                    <div className="absolute w-2 h-2 rounded-full bg-brand-500 -left-[4.5px] top-1.5" />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-1.5">
                      <span className="text-sm font-bold text-slate-100">{exp.title}</span>
                      <span className="text-xs text-slate-500 shrink-0">{exp.period}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs font-semibold text-slate-300">{exp.company}</span>
                      {exp.location && <span className="text-xs text-slate-600">· {exp.location}</span>}
                    </div>
                    <ul className="space-y-1">
                      {exp.bullets.map((b, j) => (
                        <li key={j} className="text-xs text-slate-400 leading-relaxed flex items-start gap-2">
                          <span className="text-brand-500 mt-1 shrink-0">›</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Skills */}
          {resume.skills.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold text-brand-400 uppercase tracking-widest mb-2.5">Skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {resume.skills.map(skill => (
                  <span key={skill} className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-medium">
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Projects */}
          {resume.projects.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold text-brand-400 uppercase tracking-widest mb-3">Projects</h2>
              <div className="space-y-3">
                {resume.projects.map((proj, i) => (
                  <div key={i} className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-200">{proj.name}</span>
                      <ExternalLink size={12} className="text-slate-600 shrink-0" />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-1.5">{proj.description}</p>
                    {proj.tech && (
                      <div className="flex flex-wrap gap-1">
                        {proj.tech.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Education + Certifications side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {resume.education.length > 0 && (
              <section>
                <h2 className="text-[11px] font-bold text-brand-400 uppercase tracking-widest mb-2.5">Education</h2>
                <div className="space-y-2">
                  {resume.education.map((ed, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <BookOpen size={13} className="text-slate-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{ed.degree}</p>
                        <p className="text-xs text-slate-500">{ed.institution} · {ed.year}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {resume.certifications.length > 0 && (
              <section>
                <h2 className="text-[11px] font-bold text-brand-400 uppercase tracking-widest mb-2.5">Certifications</h2>
                <div className="space-y-1.5">
                  {resume.certifications.map((cert, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Award size={12} className="text-brand-400 shrink-0" />
                      <span className="text-xs text-slate-300">{cert}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResumeEnhancerPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [targetRole, setTargetRole] = useState('')
  const [targetSkills, setTargetSkills] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResumeEnhancement | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !targetRole.trim()) return
    setLoading(true); setError(null); setResult(null); setGeneratedResume(null)
    try {
      const data = await enhanceResume(file, targetRole.trim(), targetSkills.trim())
      setResult(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Analysis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const missingKeywords = result?.sections.keyword_match.missing ?? []
  const showRewriteButton = result && result.overall_score < 85

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Sparkles size={22} className="text-brand-400" />
          Resume Enhancer
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload your resume, get an AI-powered ATS score, then rewrite it into a polished version
        </p>
      </div>

      {/* Upload form */}
      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
            file ? 'border-brand-500/50 bg-brand-500/5' : 'border-slate-700 hover:border-slate-500'
          }`}
        >
          <input
            ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <FileText size={28} className="text-brand-400" />
              <p className="text-sm font-medium text-brand-300">{file.name}</p>
              <p className="text-xs text-slate-500">Click to change file</p>
            </>
          ) : (
            <>
              <Upload size={28} className="text-slate-500" />
              <p className="text-sm font-medium text-slate-300">Click to upload your resume</p>
              <p className="text-xs text-slate-500">PDF, DOCX, or TXT · max 10 MB</p>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Target Role <span className="text-red-400">*</span></label>
            <div className="relative">
              <Target size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text" className="input pl-8" placeholder="e.g. Senior Backend Engineer"
                value={targetRole} onChange={e => setTargetRole(e.target.value)} required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Target Skills / Keywords <span className="text-slate-600">(optional)</span></label>
            <input
              type="text" className="input" placeholder="e.g. Python, AWS, Kubernetes"
              value={targetSkills} onChange={e => setTargetSkills(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit" disabled={!file || !targetRole.trim() || loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 size={15} className="animate-spin" />Analysing…</>
            : <><Sparkles size={15} />Analyse Resume</>
          }
        </button>
      </form>

      {error && (
        <div className="card p-4 flex items-center gap-3 text-red-400 border-red-900">
          <AlertCircle size={18} /><p className="text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Score overview */}
          <div className="card p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <ScoreRing score={result.overall_score} grade={result.grade} />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-lg font-semibold text-slate-100">Overall Score</h2>
                  {showRewriteButton && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 border border-yellow-700/50 text-yellow-400">
                      Score below 85 — rewrite available
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{result.summary}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {result.sections.keyword_match.matched.slice(0, 8).map(k => (
                    <span key={k} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800">
                      <CheckCircle2 size={9} />{k}
                    </span>
                  ))}
                  {result.sections.keyword_match.missing.slice(0, 8).map(k => (
                    <span key={k} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-900/20 text-red-400 border border-red-800">
                      <XCircle size={9} />{k}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Rewrite CTA */}
            {showRewriteButton && !generatedResume && (
              <div className="mt-5 pt-5 border-t border-slate-800 flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-200">Your score is below 85</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Let AI rewrite your resume with stronger bullets, missing keywords, and a polished structure tailored to <span className="text-slate-300">{targetRole}</span>.
                  </p>
                </div>
                <button
                  onClick={() => setShowWizard(true)}
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-brand-500/20"
                >
                  <Wand2 size={15} />
                  Rewrite My Resume
                </button>
              </div>
            )}
          </div>

          {/* Section scores */}
          <div className="card p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Section Breakdown</h3>
            {Object.entries(result.sections).map(([key, val]) => (
              <SectionBar key={key} label={SECTION_LABELS[key] ?? key} score={val.score} feedback={val.feedback} />
            ))}
          </div>

          {/* Issues */}
          {result.issues.length > 0 && (
            <div className="card p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Issues Found</h3>
              <div className="space-y-2">
                {result.issues.map((issue, i) => {
                  const cfg = SEVERITY_CONFIG[issue.severity]
                  const Icon = cfg.icon
                  return (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${cfg.bg}`}>
                      <Icon size={15} className={`${cfg.color} shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${cfg.color}`}>{issue.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{issue.detail}</p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.color} shrink-0`}>{cfg.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Improvements */}
          {result.improvements.length > 0 && (
            <div className="card p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recommended Improvements</h3>
              <ol className="space-y-3">
                {result.improvements.sort((a, b) => a.priority - b.priority).map((imp, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {imp.priority}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{imp.action}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{imp.impact}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Generated resume */}
          {generatedResume && <ResumePreview resume={generatedResume} />}
        </div>
      )}

      {/* Wizard modal */}
      {showWizard && file && (
        <RewriteWizard
          file={file}
          targetRole={targetRole}
          targetSkills={targetSkills}
          missingKeywords={missingKeywords}
          onClose={() => setShowWizard(false)}
          onDone={r => { setGeneratedResume(r); setShowWizard(false) }}
        />
      )}
    </div>
  )
}
