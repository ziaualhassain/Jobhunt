import axios from 'axios';
import type { Application, ApplicationStatus, Job, SearchFilters } from '../types';
import type { User } from '../context/AuthContext';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await api.post('/auth/login', { email, password });
  return res.data;
}

export async function registerUser(name: string, email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await api.post('/auth/register', { name, email, password });
  return res.data;
}

export async function getMe(): Promise<User> {
  const res = await api.get('/auth/me');
  return res.data;
}

export async function loginWithAuth0Token(idToken: string): Promise<{ token: string; user: User }> {
  const res = await api.post('/auth/oauth', { id_token: idToken });
  return res.data;
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface UserPreferences {
  bio?: string
  interests: string[]
  keywords: string[]
  jobTitles?: string[]
  experienceLevel: string
  yearsOfExperience?: number
  remote: boolean
  location: string
  jobType: string
  lastSearch?: import('../types').SearchFilters
}

export interface Profile extends User {
  preferences: UserPreferences
  created_at: string
}

export async function getProfile(): Promise<Profile> {
  const res = await api.get('/profile');
  return res.data;
}

export async function updateProfile(data: {
  name?: string
  preferences?: Partial<UserPreferences>
  currentPassword?: string
  newPassword?: string
}): Promise<Profile> {
  const res = await api.put('/profile', data);
  return res.data;
}

// ── Application Profile ───────────────────────────────────────────────────────

export interface ApplicationProfile {
  phone?: string
  linkedinUrl?: string
  githubUrl?: string
  portfolioUrl?: string
  intro?: string
  currentCTC?: string
  expectedCTC?: string
  noticePeriod?: string
}

export interface UserResume {
  id: number
  label: string
  original_name: string
  file_size: number
  is_primary: boolean
  created_at: string
}

export interface JobCredential {
  id: number
  site: string
  site_email: string
  created_at: string
}

export interface Questionnaire {
  // Work authorization
  workAuthorized?: string         // 'yes' | 'no'
  requiresSponsorship?: string    // 'yes' | 'no'
  citizenshipStatus?: string      // 'citizen' | 'permanent_resident' | 'work_visa' | 'student_visa' | 'other'
  // Education
  highestDegree?: string          // 'high_school' | 'associate' | 'bachelor' | 'master' | 'phd' | 'other'
  degreeField?: string
  university?: string
  graduationYear?: string
  // Work preferences
  willingToRelocate?: string      // 'yes' | 'no' | 'open'
  preferredWorkMode?: string      // 'remote' | 'hybrid' | 'onsite' | 'flexible'
  // EEO / diversity
  gender?: string
  veteranStatus?: string          // 'no' | 'yes' | 'prefer_not_to_say'
  disabilityStatus?: string       // 'no' | 'yes' | 'prefer_not_to_say'
  ethnicity?: string
  // Other
  languages?: string
  drivingLicense?: string         // 'yes' | 'no'
}

export async function getQuestionnaire(): Promise<Questionnaire> {
  const res = await api.get('/application-profile/questionnaire')
  return res.data
}

export async function updateQuestionnaire(data: Questionnaire): Promise<Questionnaire> {
  const res = await api.put('/application-profile/questionnaire', data)
  return res.data
}

export async function getApplicationProfile(): Promise<ApplicationProfile> {
  const res = await api.get('/application-profile')
  return res.data
}

export async function updateApplicationProfile(data: ApplicationProfile): Promise<ApplicationProfile> {
  const res = await api.put('/application-profile', data)
  return res.data
}

export async function listResumes(): Promise<UserResume[]> {
  const res = await api.get('/application-profile/resumes')
  return res.data
}

export async function uploadResume(file: File, label: string): Promise<UserResume> {
  const form = new FormData()
  form.append('resume', file)
  form.append('label', label)
  const res = await api.post('/application-profile/resumes', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function setResumeAsPrimary(id: number): Promise<void> {
  await api.patch(`/application-profile/resumes/${id}/primary`)
}

export async function deleteResume(id: number): Promise<void> {
  await api.delete(`/application-profile/resumes/${id}`)
}

export async function listCredentials(): Promise<JobCredential[]> {
  const res = await api.get('/application-profile/credentials')
  return res.data
}

export async function upsertCredential(site: string, email: string, password: string): Promise<JobCredential> {
  const res = await api.post('/application-profile/credentials', { site, email, password })
  return res.data
}

export async function deleteCredential(id: number): Promise<void> {
  await api.delete(`/application-profile/credentials/${id}`)
}

// ── Auto Apply ────────────────────────────────────────────────────────────────

export async function startAutoApply(data: {
  jobUrl: string
  jobTitle: string
  jobCompany: string
  jobSource: string
  jobId?: string
  jobLocation?: string
  resumeId?: number
}): Promise<{ runId: string }> {
  const res = await api.post('/auto-apply/start', data)
  return res.data
}

export async function checkSessionStatus(site: string): Promise<{ hasSession: boolean }> {
  const res = await api.get(`/auto-apply/session-status/${site}`)
  return res.data
}

/** Opens an SSE stream that triggers a visible browser login flow on the server.
 *  Listen for `message` events (log lines) and the `done` event (saved/error). */
export async function resumeAutoApply(runId: string): Promise<void> {
  await api.post(`/auto-apply/resume/${runId}`)
}

export function createSessionSSE(site: string): EventSource {
  const token = localStorage.getItem('token') ?? ''
  return new EventSource(`/api/auto-apply/create-session/${encodeURIComponent(site)}?token=${encodeURIComponent(token)}`)
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export async function searchJobs(filters: Partial<SearchFilters>): Promise<{ jobs: Job[]; total: number }> {
  const params: Record<string, string> = {};
  if (filters.keywords?.length) params.keywords = filters.keywords.join(',');
  if (filters.tags?.length) params.tags = filters.tags.join(',');
  if (filters.location) params.location = filters.location;
  if (filters.jobType) params.jobType = filters.jobType;
  if (filters.experienceLevel) params.experienceLevel = filters.experienceLevel;
  if (filters.remote !== undefined) params.remote = String(filters.remote);
  if (filters.region) params.region = filters.region;
  const res = await api.get('/jobs/search', { params });
  return res.data;
}

export interface DeepScore {
  score: number
  matched_skills: string[]
  skill_gaps: string[]
  seniority_fit: string
  reasoning: string
}

export async function deepScoreJob(analysis: ResumeAnalysis, job: Job): Promise<DeepScore> {
  const res = await api.post('/jobs/deep-score', { analysis, job })
  return res.data
}

// ── Applications ──────────────────────────────────────────────────────────────

export interface BehavioralSignals {
  titles: string[]
  skills: string[]
  count: number
}

export async function getBehavioralSignals(): Promise<BehavioralSignals> {
  const res = await api.get('/applications/signals');
  return res.data;
}

export async function getApplications(status?: ApplicationStatus): Promise<Application[]> {
  const params = status ? { status } : {};
  const res = await api.get('/applications', { params });
  return res.data;
}

export async function saveApplication(job: Job): Promise<Application> {
  const res = await api.post('/applications', { ...job, status: 'saved' });
  return res.data;
}

export async function addCustomJob(data: {
  title: string
  company: string
  status: ApplicationStatus
  location?: string
  url?: string
  salary?: string
  job_type?: string
  tags?: string
  notes?: string
}): Promise<Application> {
  const job_id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await api.post('/applications', {
    job_id,
    source: 'Manual',
    description: '',
    ...data,
  });
  return res.data;
}

export async function updateApplication(
  id: number,
  data: { status?: ApplicationStatus; notes?: string }
): Promise<Application> {
  const res = await api.patch(`/applications/${id}`, data);
  return res.data;
}

export async function deleteApplication(id: number): Promise<void> {
  await api.delete(`/applications/${id}`);
}

export async function getStats(): Promise<{ total: number; byStatus: { status: string; count: number }[] }> {
  const res = await api.get('/applications/stats/summary');
  return res.data;
}

// ── Resume ────────────────────────────────────────────────────────────────────

export interface ResumeAnalysis {
  skills: string[];
  experienceLevel: string;
  yearsOfExperience: number;
  jobTitles: string[];
  searchKeywords: string[];
  cloudPlatforms: string[];
  summary: string;
}

export async function analyzeResume(file: File): Promise<{ analysis: ResumeAnalysis; filename: string }> {
  const form = new FormData();
  form.append('resume', file);
  const res = await api.post('/resume/analyze', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// ── Resume Enhancer ───────────────────────────────────────────────────────────

export interface SectionScore {
  score: number
  feedback: string
}

export interface ResumeEnhancement {
  overall_score: number
  grade: string
  sections: {
    ats_compatibility: SectionScore
    keyword_match: SectionScore & { matched: string[]; missing: string[] }
    experience_presentation: SectionScore
    skills_section: SectionScore
    quantification: SectionScore
  }
  issues: { severity: 'high' | 'medium' | 'low'; title: string; detail: string }[]
  improvements: { priority: number; action: string; impact: string }[]
  summary: string
}

export async function enhanceResume(
  file: File,
  targetRole: string,
  targetSkills: string,
): Promise<ResumeEnhancement> {
  const form = new FormData()
  form.append('resume', file)
  form.append('targetRole', targetRole)
  form.append('targetSkills', targetSkills)
  const res = await api.post('/resume/enhance', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export interface GeneratedResume {
  name: string
  contact: { email: string; phone: string; location: string; linkedin: string; github: string; website: string }
  summary: string
  experience: { title: string; company: string; location: string; period: string; bullets: string[] }[]
  skills: string[]
  education: { degree: string; institution: string; year: string }[]
  projects: { name: string; description: string; tech: string }[]
  certifications: string[]
}

export async function rewriteResume(
  file: File,
  targetRole: string,
  targetSkills: string,
  achievements: string,
  projects: string,
  extraSkills: string,
  missingKeywords: string[],
): Promise<GeneratedResume> {
  const form = new FormData()
  form.append('resume', file)
  form.append('targetRole', targetRole)
  form.append('targetSkills', targetSkills)
  form.append('achievements', achievements)
  form.append('projects', projects)
  form.append('extraSkills', extraSkills)
  form.append('missingKeywords', JSON.stringify(missingKeywords))
  const res = await api.post('/resume/rewrite', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function extractResumeStructured(file: File): Promise<GeneratedResume> {
  const form = new FormData()
  form.append('resume', file)
  const res = await api.post('/resume/extract', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

// Downloads a text-based ATS-friendly PDF generated server-side via pdfkit
export async function downloadResumePdf(resume: GeneratedResume, template = 'jake'): Promise<Blob> {
  const res = await api.post(`/resume/pdf?template=${template}`, resume, { responseType: 'blob' })
  return res.data
}

// Downloads LaTeX source (.tex) — compile on Overleaf or with pdflatex
export async function downloadResumeLatex(resume: GeneratedResume, template = 'jake'): Promise<Blob> {
  const res = await api.post(`/resume/latex?template=${template}`, resume, { responseType: 'blob' })
  return res.data
}

// ── Interview Coach ───────────────────────────────────────────────────────────

export interface InterviewSession {
  id: number
  title: string
  company: string
  role: string
  mode: string
  message_count?: number
  created_at: string
  updated_at: string
}

export interface InterviewMessage {
  id: number
  session_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface InterviewSessionDetail extends InterviewSession {
  messages: InterviewMessage[]
}

export async function listInterviewSessions(): Promise<InterviewSession[]> {
  const res = await api.get('/interview/sessions')
  return res.data
}

export async function createInterviewSession(data: {
  title: string
  company?: string
  role?: string
  mode?: string
}): Promise<InterviewSession> {
  const res = await api.post('/interview/sessions', data)
  return res.data
}

export async function getInterviewSession(id: number): Promise<InterviewSessionDetail> {
  const res = await api.get(`/interview/sessions/${id}`)
  return res.data
}

export async function sendInterviewMessage(sessionId: number, message: string): Promise<InterviewMessage> {
  const res = await api.post(`/interview/sessions/${sessionId}/chat`, { message })
  return res.data
}

export async function deleteInterviewSession(id: number): Promise<void> {
  await api.delete(`/interview/sessions/${id}`)
}

// ── Preparation Tracker ───────────────────────────────────────────────────────

export interface PrepPlan {
  id: number
  title: string
  goal: string
  company: string
  role: string
  timeline_weeks: number
  source: string
  total_tasks?: number
  completed_tasks?: number
  created_at: string
  updated_at: string
}

export interface PrepTask {
  id: number
  plan_id: number
  category: string
  title: string
  description: string
  estimated_hours: number
  resources: string
  priority: 'high' | 'medium' | 'low'
  completed: boolean
  completed_at: string | null
  created_at: string
}

export interface PrepStreak {
  current: number
  longest: number
}

export interface PrepPlanDetail extends PrepPlan {
  tasks: PrepTask[]
  checkins: string[]
  streak: PrepStreak
  todayCheckin: boolean
}

export async function listPrepPlans(): Promise<PrepPlan[]> {
  const res = await api.get('/prep/plans')
  return res.data
}

export async function getPrepPlan(id: number): Promise<PrepPlanDetail> {
  const res = await api.get(`/prep/plans/${id}`)
  return res.data
}

export async function generatePrepPlan(data: {
  role: string; company?: string; timelineWeeks?: number; focusAreas?: string
}): Promise<{ id: number; title: string }> {
  const res = await api.post('/prep/plans/generate', data)
  return res.data
}

export async function uploadPrepPlan(file: File, planTitle?: string): Promise<{ id: number; title: string; taskCount: number }> {
  const form = new FormData()
  form.append('file', file)
  if (planTitle) form.append('planTitle', planTitle)
  const res = await api.post('/prep/plans/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}

export async function deletePrepPlan(id: number): Promise<void> {
  await api.delete(`/prep/plans/${id}`)
}

export async function togglePrepTask(taskId: number, completed: boolean): Promise<PrepTask> {
  const res = await api.patch(`/prep/tasks/${taskId}`, { completed })
  return res.data
}

export interface PrepTaskMessage {
  id: number
  task_id: number
  user_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export async function getTaskMessages(taskId: number): Promise<PrepTaskMessage[]> {
  const res = await api.get(`/prep/tasks/${taskId}/messages`)
  return res.data
}

export async function sendTaskMessage(taskId: number, message: string): Promise<{ reply: string }> {
  const res = await api.post(`/prep/tasks/${taskId}/chat`, { message })
  return res.data
}

export async function checkInToday(planId: number): Promise<{ streak: PrepStreak; todayCheckin: boolean }> {
  const res = await api.post(`/prep/plans/${planId}/checkin`, {})
  return res.data
}

export async function addPlanFromMessage(data: {
  content: string; role?: string; company?: string; title?: string
}): Promise<{ id: number; title: string }> {
  const res = await api.post('/prep/plans/from-message', data)
  return res.data
}

// ── Career Page Watchlist ─────────────────────────────────────────────────────

export interface WatchedCompany {
  id: number
  company_name: string
  career_url: string
  is_active: boolean
  last_scraped_at: string | null
  job_count: number
  total_jobs: number
  scrape_error: string | null
  created_at: string
}

export async function listWatchedCompanies(): Promise<WatchedCompany[]> {
  const res = await api.get('/career-pages')
  return res.data
}

export async function addWatchedCompany(data: { company_name: string; career_url: string }): Promise<WatchedCompany> {
  const res = await api.post('/career-pages', data)
  return res.data
}

export async function removeWatchedCompany(id: number): Promise<void> {
  await api.delete(`/career-pages/${id}`)
}

export async function scrapeWatchedCompany(id: number): Promise<{ scraped: number; error: string | null }> {
  const res = await api.post(`/career-pages/${id}/scrape`)
  return res.data
}
