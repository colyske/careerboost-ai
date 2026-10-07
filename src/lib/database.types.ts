export type UserRole = "candidate" | "admin" | "owner";

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
