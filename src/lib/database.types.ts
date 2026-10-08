export type UserRole = "candidate" | "admin" | "owner";

export type CareerProfileData = {
  fullName: string;
  headline: string;
  summary: string;
  experiences: Array<{ title: string; organization: string; location: string; startDate: string; endDate: string; description: string }>;
  education: Array<{ institution: string; qualification: string; fieldOfStudy: string; startDate: string; endDate: string }>;
  certifications: Array<{ name: string; issuer: string; date: string }>;
  achievements: string[];
  skills: string[];
  languages: string[];
  targetRoles: string[];
  evidenceGaps: string[];
  reviewNotes: string[];
};

export const emptyCareerProfileData: CareerProfileData = {
  fullName: "", headline: "", summary: "", experiences: [], education: [], certifications: [],
  achievements: [], skills: [], languages: [], targetRoles: [], evidenceGaps: [], reviewNotes: [],
};

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  linkedin_url: string;
  target_role: string;
  target_region: string;
  target_salary: string;
  languages: string;
  nationality: string;
  skills: string;
  resume_bio: string;
  career_data: CareerProfileData;
  updated_at: string;
};

export type CreditEntry = {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
};

export type CreditPackage = {
  id: "starter" | "pro" | "executive";
  label: string;
  credits: number;
  currency: string;
  amountSubunits: number | null;
};
