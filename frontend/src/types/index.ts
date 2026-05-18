export interface CustomQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
}

export interface Job {
  job_id: string;
  title: string;
  company: string;
  location: string;
  region?: string;
  url: string;
  description: string;
  salary: string;
  job_type: string;
  source: string;
  tags: string;
  logo?: string;
  date_posted?: string;
  custom_questions?: CustomQuestion[];
}

export type ApplicationStatus =
  | 'saved'
  | 'applied'
  | 'phone_screen'
  | 'technical'
  | 'final_interview'
  | 'offer'
  | 'rejected';

export interface Application {
  id: number;
  job_id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  salary: string;
  job_type: string;
  source: string;
  tags: string;
  status: ApplicationStatus;
  notes: string;
  applied_date: string | null;
  created_at: string;
  updated_at: string;
  job_active?: boolean;
}

export interface SearchFilters {
  keywords: string[];
  tags: string[];
  location: string;
  jobType: string;
  experienceLevel: string;
  remote: boolean;
  region: string;
}

export const STATUS_CONFIG: Record<
  ApplicationStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  saved: {
    label: 'Saved',
    color: 'text-slate-700',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
  },
  applied: {
    label: 'Applied',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    border: 'border-blue-300',
  },
  phone_screen: {
    label: 'Phone Screen',
    color: 'text-purple-700',
    bg: 'bg-purple-100',
    border: 'border-purple-300',
  },
  technical: {
    label: 'Technical',
    color: 'text-orange-700',
    bg: 'bg-orange-100',
    border: 'border-orange-300',
  },
  final_interview: {
    label: 'Final Interview',
    color: 'text-yellow-700',
    bg: 'bg-yellow-100',
    border: 'border-yellow-300',
  },
  offer: {
    label: 'Offer',
    color: 'text-green-700',
    bg: 'bg-green-100',
    border: 'border-green-300',
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-700',
    bg: 'bg-red-100',
    border: 'border-red-300',
  },
};
