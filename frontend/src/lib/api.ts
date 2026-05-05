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
  const res = await api.post('/applications', job);
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
