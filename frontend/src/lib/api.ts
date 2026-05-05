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

// ── Profile ───────────────────────────────────────────────────────────────────

export interface UserPreferences {
  interests: string[]
  keywords: string[]
  experienceLevel: string
  remote: boolean
  location: string
  jobType: string
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

// ── Jobs ──────────────────────────────────────────────────────────────────────

export async function searchJobs(filters: Partial<SearchFilters>): Promise<{ jobs: Job[]; total: number }> {
  const params: Record<string, string> = {};
  if (filters.keywords?.length) params.keywords = filters.keywords.join(',');
  if (filters.tags?.length) params.tags = filters.tags.join(',');
  if (filters.location) params.location = filters.location;
  if (filters.jobType) params.jobType = filters.jobType;
  if (filters.experienceLevel) params.experienceLevel = filters.experienceLevel;
  if (filters.remote !== undefined) params.remote = String(filters.remote);
  const res = await api.get('/jobs/search', { params });
  return res.data;
}

// ── Applications ──────────────────────────────────────────────────────────────

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
