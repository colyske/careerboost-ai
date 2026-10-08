"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { emptyCareerProfileData, type CareerProfileData, type CreditEntry, type CreditPackage, type Profile } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { extractLinkedInPdfText, parseLinkedInExports, sanitizeLinkedInPdfText } from "@/lib/linkedin-export";
import { mergeCareerProfileData, normalizeCareerProfileData } from "@/lib/candidate-profile";

type Tool = "roadmap" | "cv" | "linkedin" | "interview";
type Course = { id: string; title: string; category: string; duration_minutes: number; description: string; lesson: string; quiz_question: string; quiz_options: string[] };
type Completion = { id: string; course_id: string; completed_at: string; certificate_code: string };
type SalaryInsight = { title: string; location: string; method: "official_wages" | "grounded_search"; low?: number; median?: number; high?: number; rateType?: string; dataYear: string; source?: string; sourceUrl?: string; summary?: string; sources?: Array<{ url: string; title: string }>; searchSuggestion?: string };
type AdminUser = { id: string; email: string; full_name: string; role: "candidate" | "admin" | "owner"; credits: number };
type Opportunity = { id: string; title: string; company: string; region: string; salary_range: string; description: string; required_skills: string[]; application_url: string | null; unlocked: boolean; matchScore: number; active?: boolean };
type CuratedItem = { title: string; organization: string; location: string; description: string; url: string; fit: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }, cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result as T;
}

export function Dashboard({ initialProfile, initialBalance, email }: { initialProfile: Profile; initialBalance: number; email: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [careerData, setCareerData] = useState<CareerProfileData>(normalizeCareerProfileData(initialProfile.career_data || emptyCareerProfileData));
  const [pendingImportText, setPendingImportText] = useState("");
  const [importSuggestion, setImportSuggestion] = useState<CareerProfileData | null>(null);
  const [profileImportConsent, setProfileImportConsent] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const [entries, setEntries] = useState<CreditEntry[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<Tool>("roadmap");
  const [toolOutput, setToolOutput] = useState("");
  const [answer, setAnswer] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [listening, setListening] = useState(false);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [courseAnswer, setCourseAnswer] = useState<Record<string, string>>({});
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [creditAdjustments, setCreditAdjustments] = useState<Record<string, string>>({});
  const [jobs, setJobs] = useState<Opportunity[]>([]);
  const [curatedJobs, setCuratedJobs] = useState<CuratedItem[]>([]);
  const [curatedCourses, setCuratedCourses] = useState<CuratedItem[]>([]);
  const [jobSearchSuggestion, setJobSearchSuggestion] = useState("");
  const [learningSearchSuggestion, setLearningSearchSuggestion] = useState("");
  const [jobSearchConsent, setJobSearchConsent] = useState(false);
  const [learningSearchConsent, setLearningSearchConsent] = useState(false);
  const [salaryInsight, setSalaryInsight] = useState<SalaryInsight | null>(null);
  const [salaryMessage, setSalaryMessage] = useState("");
  const [salarySearchConsent, setSalarySearchConsent] = useState(false);
  const linkedinImportRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    api<{ packages: CreditPackage[] }>("/api/payments/packages").then((result) => setPackages(result.packages)).catch(() => undefined);
    api<{ balance: number; entries: CreditEntry[] }>("/api/credits").then((result) => { setBalance(result.balance); setEntries(result.entries); }).catch(() => undefined);
    api<{ courses: Course[]; completions: Completion[] }>("/api/courses").then((result) => { setCourses(result.courses); setCompletions(result.completions); }).catch(() => undefined);
    const isStaff = initialProfile.role === "admin" || initialProfile.role === "owner";
    api<{ jobs: Opportunity[] }>(isStaff ? "/api/admin/jobs" : "/api/jobs")
      .then((result) => setJobs(result.jobs.map((job) => ({ ...job, unlocked: isStaff || job.unlocked, matchScore: job.matchScore ?? 0 }))))
      .catch(() => undefined);
    if (initialProfile.role === "admin" || initialProfile.role === "owner") api<{ users: AdminUser[] }>("/api/admin/users").then((result) => setAdminUsers(result.users)).catch(() => undefined);
  }, [initialProfile.role]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function tell(text: string) { setMessage(text); }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const update = Object.fromEntries(["full_name", "linkedin_url", "target_role", "target_region", "target_salary", "nationality", "languages", "skills", "resume_bio"].map((key) => [key, String(form.get(key) || "")]));
    try { const result = await api<{ profile: Profile }>("/api/profile", { method: "PATCH", body: JSON.stringify({ ...update, career_data: careerData }) }); setProfile(result.profile); setCareerData(normalizeCareerProfileData(result.profile.career_data)); tell("Your profile was saved securely."); }
    catch (error) { tell(error instanceof Error ? error.message : "Profile save failed."); }
    finally { setBusy(false); }
    }

  async function runTool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aiConsent) { tell("Please review and accept the AI data notice before continuing."); return; }
    setBusy(true); setMessage(""); setToolOutput("");
    try {
      const result = await api<{ output: string; creditsUsed: number }>("/api/tools", { method: "POST", body: JSON.stringify({ tool, answer, idempotencyKey: crypto.randomUUID() }) });
      setToolOutput(result.output); setBalance((current) => current - result.creditsUsed); tell(`Done. ${result.creditsUsed} credit${result.creditsUsed === 1 ? "" : "s"} used.`);
    } catch (error) { tell(error instanceof Error ? error.message : "Generation failed."); }
    finally { setBusy(false); }
  }

  function importLinkedInText() {
    const text = linkedinImportRef.current?.value.trim();
    if (!text) { tell("Paste some profile text first."); return; }
    setPendingImportText(sanitizeLinkedInPdfText(text).slice(0, 30000));
    setImportSuggestion(null); setProfileImportConsent(false);
    tell("Profile text is ready. You can opt in to have AI organize it into your Candidate Vault.");
  }

  async function importLinkedInFiles(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    if (files.length > 10 || files.some((file) => (!/\.(csv|pdf|docx)$/i.test(file.name)) || file.size > 15_000_000)) {
      tell("Choose a CV or LinkedIn PDF, DOCX, or up to 10 supported career CSV files, each no larger than 15 MB."); return;
    }
    try {
      const documents = files.filter((file) => /\.(pdf|docx)$/i.test(file.name));
      const csvFiles = files.filter((file) => file.name.toLowerCase().endsWith(".csv"));
      if (documents.length > 1 || (documents.length && csvFiles.length)) { tell("Choose one CV/LinkedIn PDF or DOCX, or select multiple career CSV files."); return; }
      let extracted = "";
      if (documents[0]?.name.toLowerCase().endsWith(".pdf")) extracted = await extractLinkedInPdfText(await documents[0].arrayBuffer());
      else if (documents[0]) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: await documents[0].arrayBuffer() });
        extracted = result.value;
      } else if (csvFiles.length) {
        const result = parseLinkedInExports(await Promise.all(csvFiles.map(async (file) => ({ name: file.name, text: await file.text() }))));
        extracted = [result.summary, result.skills.length ? `Skills\n${result.skills.join(", ")}` : ""].filter(Boolean).join("\n\n");
      }
      extracted = sanitizeLinkedInPdfText(extracted);
      if (extracted.trim().length < 80) { tell("No readable career profile content was found. Try a text-based PDF/DOCX or supported LinkedIn career CSV files."); return; }
      setPendingImportText(extracted.slice(0, 30000)); setImportSuggestion(null); setProfileImportConsent(false);
      tell(`Read ${documents[0]?.name || `${csvFiles.length} career CSV file(s)`} locally. Choose whether to send its text to Google Gemini for profile structuring.`);
    } catch { tell("That document could not be read. Try a text-based PDF or DOCX, or supported LinkedIn career CSV files."); }
  }

  async function structureImportedProfile() {
    if (!profileImportConsent) { tell("Please consent before sending document text to Google Gemini."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await api<{ profile: CareerProfileData }>("/api/profile/import", { method: "POST", body: JSON.stringify({ text: pendingImportText, consent: true }) });
      setImportSuggestion(normalizeCareerProfileData(result.profile));
      tell("AI organized the document into a reviewable profile suggestion. Nothing has been saved yet.");
    } catch (error) { tell(error instanceof Error ? error.message : "Profile structuring failed."); }
    finally { setBusy(false); }
  }

  function acceptProfileSuggestion() {
    if (!importSuggestion) return;
    const merged = mergeCareerProfileData(careerData, importSuggestion);
    setCareerData(merged);
    const fullName = document.querySelector<HTMLInputElement>('[name="full_name"]');
    if (fullName && !fullName.value.trim() && merged.fullName) fullName.value = merged.fullName;
    const skills = document.querySelector<HTMLInputElement>('[name="skills"]');
    if (skills) skills.value = Array.from(new Set([...skills.value.split(",").map((item) => item.trim()).filter(Boolean), ...merged.skills])).join(", ").slice(0, 1600);
    const summary = document.querySelector<HTMLTextAreaElement>('[name="resume_bio"]');
    if (summary && !summary.value.trim() && merged.summary) summary.value = merged.summary.slice(0, 4000);
    const target = document.querySelector<HTMLInputElement>('[name="target_role"]');
    if (target && !target.value.trim() && merged.targetRoles[0]) target.value = merged.targetRoles[0];
    const languages = document.querySelector<HTMLInputElement>('[name="languages"]');
    if (languages && !languages.value.trim() && merged.languages.length) languages.value = merged.languages.join(", ").slice(0, 300);
    setImportSuggestion(null); setPendingImportText(""); tell("Profile suggestions accepted. Review the fields, then save your profile to persist them.");
  }

  function toggleVoiceCapture() {
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!voiceConsent) { tell("Please review the browser voice-processing notice before recording."); return; }
    const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) { tell("Voice capture is not available in this browser. You can still type your answer below."); return; }
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const captured = Array.from({ length: event.results.length }, (_, index) => event.results[index][0]?.transcript || "").join(" ").trim();
      setAnswer(captured.slice(0, 5000));
    };
    recognition.onerror = (event) => { setListening(false); tell(`Voice capture stopped (${event.error}). You can continue by typing.`); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); tell("Listening. Speak your interview example, then stop recording to review the transcript."); }
    catch { setListening(false); tell("Could not start voice capture. You can continue by typing."); }
  }

  async function startPayment(bundle: string) {
    setBusy(true); setMessage("");
    try { const result = await api<{ authorizationUrl: string }>("/api/payments/initialize", { method: "POST", body: JSON.stringify({ bundle }) }); window.location.assign(result.authorizationUrl); }
    catch (error) { tell(error instanceof Error ? error.message : "Payment could not start."); setBusy(false); }
  }

  async function completeCourse(courseId: string) {
    const selectedOption = Number(courseAnswer[courseId]);
    if (!Number.isInteger(selectedOption)) { tell("Choose an answer before submitting."); return; }
    setBusy(true); setMessage("");
    try {
      await api("/api/courses", { method: "POST", body: JSON.stringify({ courseId, selectedOption }) });
      const result = await api<{ balance: number; entries: CreditEntry[] }>("/api/credits");
      const progress = await api<{ courses: Course[]; completions: Completion[] }>("/api/courses");
      setBalance(result.balance); setEntries(result.entries); setCompletions(progress.completions); tell("Course completion recorded. A one-credit completion fee was applied.");
    } catch (error) { tell(error instanceof Error ? error.message : "Course completion failed."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/"); router.refresh();
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("confirmEmail");
    if (!window.confirm("Permanently delete this account and personal profile data? This cannot be undone.")) return;
    setBusy(true);
    try { await api("/api/account/delete", { method: "DELETE", body: JSON.stringify({ email: value }) }); router.replace("/"); router.refresh(); }
    catch (error) { tell(error instanceof Error ? error.message : "Deletion request failed."); }
    finally { setBusy(false); }
  }

  async function adjustCredits(targetUserId: string) {
    const amount = Number(creditAdjustments[targetUserId]);
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000) { tell("Enter a credit adjustment from 1 to 1,000."); return; }
    setBusy(true);
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify({ targetUserId, amount, idempotencyKey: crypto.randomUUID() }) });
      const result = await api<{ users: AdminUser[] }>("/api/admin/users"); setAdminUsers(result.users); setCreditAdjustments((old) => ({ ...old, [targetUserId]: "" })); tell("Credit adjustment recorded in the audit log.");
    } catch (error) { tell(error instanceof Error ? error.message : "Credit adjustment failed."); }
    finally { setBusy(false); }
  }

  async function changeRole(targetUserId: string, role: "candidate" | "admin" | "owner") {
    setBusy(true);
    try { await api("/api/admin/users", { method: "POST", body: JSON.stringify({ targetUserId, role }) }); const result = await api<{ users: AdminUser[] }>("/api/admin/users"); setAdminUsers(result.users); tell("Role change recorded in the audit log."); }
    catch (error) { tell(error instanceof Error ? error.message : "Role change failed."); }
    finally { setBusy(false); }
  }

  async function refreshJobs() {
    const result = await api<{ jobs: Opportunity[] }>("/api/jobs");
    setJobs(result.jobs);
  }

  async function findRecommendations(kind: "jobs" | "learning") {
    const consent = kind === "jobs" ? jobSearchConsent : learningSearchConsent;
    if (!consent) { tell("Please consent before sending profile details for public web search."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await api<{ items: CuratedItem[]; sources: Array<{ url: string; title: string }>; searchSuggestion: string }>("/api/recommendations", { method: "POST", body: JSON.stringify({ kind, consent: true }) });
      if (kind === "jobs") { setCuratedJobs(result.items); setJobSearchSuggestion(result.searchSuggestion); }
      else { setCuratedCourses(result.items); setLearningSearchSuggestion(result.searchSuggestion); }
      tell(`${result.items.length} source-linked ${kind === "jobs" ? "job opportunities" : "learning resources"} found. Check each listing directly before applying or enrolling.`);
    } catch (error) { tell(error instanceof Error ? error.message : "Recommendations could not be loaded."); }
    finally { setBusy(false); }
  }

  async function loadSalaryInsight() {
    if (!profile.target_role.trim() || !profile.target_region.trim()) {
      setSalaryMessage("Save a target job title and a U.S. location first (city, state; state abbreviation; or ZIP code).");
      return;
    }
    setBusy(true); setSalaryMessage(""); setSalaryInsight(null);
    try {
      const params = new URLSearchParams({ role: profile.target_role, location: profile.target_region, searchConsent: String(salarySearchConsent) });
      const result = await api<SalaryInsight>(`/api/salary?${params.toString()}`);
      setSalaryInsight(result);
    } catch (error) { setSalaryMessage(error instanceof Error ? error.message : "Salary insight could not be loaded."); }
    finally { setBusy(false); }
  }

  async function unlockJob(jobId: string) {
    setBusy(true);
    try { const result = await api<{ balance: number }>("/api/jobs", { method: "POST", body: JSON.stringify({ jobId }) }); setBalance(result.balance); await refreshJobs(); tell("Employer details unlocked."); }
    catch (error) { tell(error instanceof Error ? error.message : "Opportunity could not be unlocked."); }
    finally { setBusy(false); }
  }

  async function publishJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(["title", "company", "region", "salaryRange", "description", "requiredSkills", "applicationUrl"].map((key) => [key, String(form.get(key) || "")]));
    try { await api("/api/admin/jobs", { method: "POST", body: JSON.stringify(body) }); formElement.reset(); const result = await api<{ jobs: Opportunity[] }>("/api/admin/jobs"); setJobs(result.jobs.map((job) => ({ ...job, unlocked: true, matchScore: 0 }))); tell("Opportunity published and audit logged."); }
    catch (error) { tell(error instanceof Error ? error.message : "Opportunity could not be published."); }
    finally { setBusy(false); }
  }

  async function archiveJob(jobId: string) {
    setBusy(true);
    try { await api("/api/admin/jobs", { method: "POST", body: JSON.stringify({ action: "archive", jobId }) }); const result = await api<{ jobs: Opportunity[] }>("/api/admin/jobs"); setJobs(result.jobs.map((job) => ({ ...job, unlocked: true, matchScore: 0 }))); tell("Opportunity archived."); }
    catch (error) { tell(error instanceof Error ? error.message : "Opportunity could not be archived."); }
    finally { setBusy(false); }
  }

  const titleByTool: Record<Tool, string> = { roadmap: "Career roadmap", cv: "ATS resume draft", linkedin: "LinkedIn profile rewrite", interview: "STAR interview coaching" };
  const costByTool: Record<Tool, number> = { roadmap: 1, cv: 1, linkedin: 1, interview: 2 };
  const isPrimarySuperAdmin = email.trim().toLowerCase() === "colyske@gmail.com";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/70 pb-5">
        <Link href="/" className="text-lg font-black tracking-tight">CareerBoost</Link>
        <div className="flex flex-wrap items-center gap-3 text-sm"><span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 font-bold text-amber-200">{balance} credits</span><span className="max-w-48 truncate text-slate-300">{email}</span>{profile.role === "owner" && <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-200">SuperAdmin</span>}{(profile.role === "admin" || profile.role === "owner") && <Link href="/security" className="rounded-lg border border-purple-400/40 px-3 py-2 text-purple-100">Security / MFA</Link>}<button onClick={signOut} className="rounded-lg border border-slate-600 px-3 py-2 text-slate-200 hover:bg-slate-800">Sign out</button></div>
      </header>
      <div className="mb-8 grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <section className="glass rounded-3xl p-6 sm:p-9"><p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-indigo-300">Candidate hub</p><h1 className="text-3xl font-extrabold sm:text-4xl">Build your next career move.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Your profile, balance, and course records are stored server-side. Review AI drafts before using them; generated advice does not guarantee employment.</p></section>
        <section className="glass rounded-3xl p-6"><p className="text-sm text-slate-400">Credit balance</p><p className="mt-1 text-4xl font-black text-amber-300">{balance}</p><p className="mt-1 text-xs text-slate-400">Purchased credits are confirmed by the payment provider before they are added.</p></section>
      </div>
      {message && <p role="status" className="mb-6 rounded-xl border border-indigo-400/25 bg-indigo-400/10 px-4 py-3 text-sm text-indigo-100">{message}</p>}
      <nav aria-label="Candidate hub sections" className="no-print mb-6 flex gap-2 overflow-x-auto pb-2 text-xs">{[["#candidate-vault","Profile"],["#career-studio","Career tools"],["#opportunities","Opportunities"],["#learning","Courses"],["#credits","Credits"],["#account","Account"],...((profile.role === "admin" || profile.role === "owner") ? [["#admin","Admin"]] : [])].map(([href,label])=><a key={href} href={href} className="shrink-0 rounded-full border border-slate-700 bg-slate-950/50 px-3 py-2 font-semibold text-slate-300 hover:border-indigo-300/40 hover:text-white">{label}</a>)}</nav>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section id="opportunities" className="glass scroll-mt-24 rounded-2xl p-5 sm:p-7 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Opportunities</p><h2 className="mt-1 text-xl font-bold">AI-matched opportunities</h2><p className="my-2 text-xs leading-5 text-slate-400">Find current public listings using your target role, region, relevant skills, and career summary. Web listings can expire or change; verify the details on the source site. Existing verified staff listings remain available below.</p>
          <div className="my-4 grid gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><label className="flex items-start gap-2 text-xs leading-5 text-slate-300"><input type="checkbox" checked={jobSearchConsent} onChange={(event)=>setJobSearchConsent(event.target.checked)} className="mt-1 accent-emerald-400"/>I agree that CareerBoost may send my target role and location, skills, languages, career summary, recent experience, and any saved target roles, evidence gaps, and certifications to Google Gemini with Google Search to find public opportunities. Search is subject to provider billing and retention policies. Private chats are not accessed.</label><button type="button" disabled={busy || !jobSearchConsent} onClick={()=>findRecommendations("jobs")} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold disabled:opacity-50">{busy ? "Searching…" : "Search public jobs"}</button></div>
          {curatedJobs.length > 0 && <div className="mb-5 grid gap-3 md:grid-cols-2">{curatedJobs.map((job,index)=><article key={`${job.url}-${index}`} className="glass-card rounded-xl p-4"><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-200">AI match · public web</span><h3 className="mt-3 font-bold">{job.title}</h3><p className="mt-1 text-xs text-slate-400">{job.organization}{job.location && ` · ${job.location}`}</p><p className="mt-2 text-xs leading-5 text-slate-300">{job.description}</p><p className="mt-2 text-xs text-cyan-200">Why it may fit: {job.fit}</p><a href={job.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold">Check source listing ↗</a></article>)}</div>}
          {jobSearchSuggestion && <div className="mb-4 text-xs text-slate-400" aria-label="Google Search suggestions" dangerouslySetInnerHTML={{ __html: jobSearchSuggestion }} />}
          {jobs.length === 0 ? <p className="rounded-xl border border-slate-700 p-4 text-sm text-slate-400">No live listings yet. An administrator must add verified opportunities before they appear here.</p> : <div className="grid gap-3 md:grid-cols-2">{jobs.map((job) => <article key={job.id} className="glass-card rounded-xl p-4"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200">{initialProfile.role === "candidate" && job.unlocked ? `${job.matchScore}% skill match` : initialProfile.role === "candidate" ? "Skill match after unlock" : "Staff view"}</span>{job.active === false && <span className="text-[11px] text-slate-500">Archived</span>}</div><h3 className="mt-3 font-bold">{job.title}</h3><p className="mt-1 text-xs text-slate-400">{job.company} · {job.region}</p>{job.salary_range && <p className="mt-1 text-xs text-slate-300">{job.salary_range}</p>}{job.description && <p className="mt-3 whitespace-pre-line text-xs leading-5 text-slate-300">{job.description}</p>}<div className="mt-3 flex flex-wrap items-center gap-2">{job.unlocked && job.application_url ? <a href={job.application_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold">View application</a> : <button disabled={busy || balance < 1} onClick={() => unlockJob(job.id)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold disabled:opacity-40">Unlock employer · 1 credit</button>}{(initialProfile.role === "admin" || initialProfile.role === "owner") && job.active !== false && <button disabled={busy} onClick={() => archiveJob(job.id)} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-200">Archive</button>}</div></article>)}</div>}
        </section>

        <section id="candidate-vault" className="glass scroll-mt-24 rounded-2xl p-5 sm:p-7">
          <div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Candidate vault</p><h2 className="mt-1 text-xl font-bold">Your profile</h2><p className="mt-2 text-xs text-slate-400">Enter only information you want to use for career drafts. Never add passwords, government ID numbers, or private contact details.</p></div>
          <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2">
            {[["full_name","Full name"],["linkedin_url","LinkedIn profile URL"],["target_role","Target role"],["target_region","Target region"],["target_salary","Salary target (optional)"],["nationality","Work authorization / location"],["languages","Languages"],["skills","Skills (comma separated)"]].map(([key,label]) => <label key={key} className="space-y-1.5 text-xs text-slate-300">{label}<input name={key} defaultValue={String(profile[key as keyof Profile] || "")} maxLength={key === "skills" ? 1600 : 500} className="field" /></label>)}
            <label className="space-y-1.5 text-xs text-slate-300 sm:col-span-2">Experience summary<textarea name="resume_bio" defaultValue={profile.resume_bio} maxLength={4000} rows={5} className="field resize-y" /></label>
            <div className="space-y-2 rounded-xl border border-slate-700/70 bg-slate-950/35 p-3 sm:col-span-2"><p className="text-xs font-semibold text-slate-200">Build your vault from a CV or LinkedIn profile</p><p className="text-xs leading-5 text-slate-400">Select a text-based CV/LinkedIn PDF, Word DOCX, or supported LinkedIn career CSV files. Files are read in your browser and are not uploaded. Email addresses, phone numbers, and URLs are removed. With your explicit consent, the extracted career text and existing saved career profile are sent to Gemini to organize and reconcile work history, education, certifications, skills, and evidence gaps. Review suggestions before saving; details are not saved automatically.</p><input type="file" accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.csv,text/csv" multiple onChange={importLinkedInFiles} className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"/>
              {pendingImportText && <div className="space-y-3 rounded-lg border border-indigo-300/20 bg-indigo-300/5 p-3"><p className="text-xs text-indigo-100">Document text ready ({pendingImportText.length.toLocaleString()} characters); not yet sent.</p><label className="flex items-start gap-2 text-xs leading-5 text-slate-300"><input type="checkbox" checked={profileImportConsent} onChange={(event) => setProfileImportConsent(event.target.checked)} className="mt-1 accent-indigo-400"/>I agree to send the extracted, contact-filtered career text and my existing saved career profile to Google Gemini for structuring and reconciliation. Gemini output may be wrong; I will review it. CareerBoost stores suggestions only after I accept and save the profile.</label><button type="button" disabled={busy || !profileImportConsent} onClick={structureImportedProfile} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold disabled:opacity-50">{busy ? "Structuring…" : "Structure my profile with AI"}</button></div>}
              {importSuggestion && <div className="space-y-3 rounded-lg border border-emerald-300/25 bg-emerald-300/5 p-3"><h3 className="text-sm font-bold text-emerald-100">Review extracted profile</h3>{importSuggestion.fullName && <p className="text-xs text-slate-200">Name: {importSuggestion.fullName}</p>}<p className="text-xs text-slate-200">{importSuggestion.headline || importSuggestion.summary || "Career facts extracted"}</p>{importSuggestion.experiences.map((item,index)=><p key={`exp-${index}`} className="text-xs text-slate-300"><strong>{item.title}</strong>{item.organization && ` · ${item.organization}`} {[item.startDate,item.endDate].filter(Boolean).join("–")}<br/>{item.description}</p>)}{importSuggestion.education.map((item,index)=><p key={`edu-${index}`} className="text-xs text-slate-300">{item.qualification} {item.fieldOfStudy && `· ${item.fieldOfStudy}`} · {item.institution}</p>)}{importSuggestion.certifications.map((item,index)=><p key={`cert-${index}`} className="text-xs text-slate-300">Certification: {item.name} · {item.issuer} {item.date}</p>)}{importSuggestion.achievements.length>0&&<p className="text-xs text-slate-300">Achievements: {importSuggestion.achievements.join("; ")}</p>}<p className="text-xs text-slate-300">Skills: {importSuggestion.skills.join(", ") || "None identified"}</p>{importSuggestion.languages.length>0&&<p className="text-xs text-slate-300">Languages: {importSuggestion.languages.join(", ")}</p>}{importSuggestion.targetRoles.length>0&&<p className="text-xs text-slate-300">Possible target roles: {importSuggestion.targetRoles.join(", ")}</p>}{importSuggestion.evidenceGaps.length>0 && <p className="text-xs text-amber-200">Please check: {importSuggestion.evidenceGaps.join("; ")}</p>}{importSuggestion.reviewNotes.length>0 && <p className="text-xs text-amber-200">Conflicts / review notes: {importSuggestion.reviewNotes.join("; ")}</p>}<div className="flex gap-2"><button type="button" onClick={acceptProfileSuggestion} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold">Accept suggestions</button><button type="button" onClick={()=>setImportSuggestion(null)} className="rounded-lg border border-slate-600 px-3 py-2 text-xs">Discard</button></div></div>}
              {careerData.experiences.length + careerData.education.length + careerData.certifications.length + careerData.skills.length > 0 && <details className="rounded-lg border border-slate-700 p-3"><summary className="cursor-pointer text-xs font-semibold text-cyan-100">Structured vault · {careerData.experiences.length} roles · {careerData.education.length} education · {careerData.certifications.length} credentials</summary><div className="mt-3 space-y-2 text-xs text-slate-300">{careerData.summary&&<p>{careerData.summary}</p>}{careerData.experiences.map((item,index)=><p key={`saved-exp-${index}`}><strong>{item.title}</strong> · {item.organization} · {[item.startDate,item.endDate].filter(Boolean).join("–")}<br/>{item.description}</p>)}{careerData.education.map((item,index)=><p key={`saved-edu-${index}`}>{item.qualification} · {item.institution} · {item.fieldOfStudy}</p>)}{careerData.certifications.map((item,index)=><p key={`saved-cert-${index}`}>{item.name} · {item.issuer} · {item.date}</p>)}{careerData.achievements.map((item,index)=><p key={`saved-ach-${index}`}>{item}</p>)}{careerData.skills.length>0&&<p><strong>Extracted skills:</strong> {careerData.skills.join(", ")}</p>}{careerData.languages.length>0&&<p><strong>Languages:</strong> {careerData.languages.join(", ")}</p>}{careerData.evidenceGaps.length>0&&<p className="text-amber-200"><strong>Verify:</strong> {careerData.evidenceGaps.join("; ")}</p>}{careerData.reviewNotes.length>0&&<p className="text-amber-200"><strong>Review notes:</strong> {careerData.reviewNotes.join("; ")}</p>}</div></details>}
              <p className="pt-2 text-xs font-semibold text-slate-200">Or paste profile text</p><p className="text-xs leading-5 text-slate-400">CareerBoost does not sign in to LinkedIn or scrape it. Remove sensitive details you do not want to save.</p><textarea ref={linkedinImportRef} maxLength={4000} rows={3} className="field resize-y" placeholder="Paste your About section or experience text here…"/><button type="button" onClick={importLinkedInText} className="rounded-lg border border-indigo-300/30 px-3 py-2 text-xs font-semibold text-indigo-100 hover:bg-indigo-400/10">Add text to experience summary</button></div>
            <button disabled={busy} className="gradient-bg mt-1 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50 sm:col-span-2">Save profile</button>
          </form>
          <div className="mt-5 flex flex-wrap gap-3 text-xs"><a className="rounded-lg border border-slate-600 px-3 py-2 hover:bg-slate-800" href="/api/account/export">Download my data</a><a className="rounded-lg border border-slate-600 px-3 py-2 hover:bg-slate-800" href="/privacy">Privacy & data handling</a></div>
        </section>

        <section id="career-studio" className="glass scroll-mt-24 rounded-2xl p-5 sm:p-7">
          <div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-indigo-300">Career studio</p><h2 className="mt-1 text-xl font-bold">Tools tailored to your goals</h2><p className="mt-2 text-xs leading-5 text-slate-400">AI output uses your profile fields and is sent to Google Gemini for processing. Do not continue unless you agree and have removed anything too sensitive to share.</p></div>
          <div className="mb-5 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">General salary estimates</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">See a broad market estimate for your chosen location. U.S. results use published wage data where available; optional AI web research can find cited estimates for other locations or roles with no official match. Estimates are not personalized salary predictions.</p>
              </div>
              <button type="button" disabled={busy} onClick={loadSalaryInsight} className="shrink-0 rounded-lg border border-cyan-300/30 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50">Get salary estimate</button>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-300"><input type="checkbox" checked={salarySearchConsent} onChange={(event) => setSalarySearchConsent(event.target.checked)} className="mt-1 accent-cyan-400"/>I agree that, if published U.S. wage data is unavailable or my location is outside the U.S., CareerBoost may send only my target job title and location to Google Gemini with Google Search to create a general estimate with source links. This requires a billed Gemini API project. Google may retain the query and result for 30 days for Search grounding.</label>
            {salaryMessage && <p role="status" className="mt-3 text-xs text-amber-200">{salaryMessage}</p>}
            {salaryInsight && <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/55 p-4">
              <p className="text-xs text-slate-400">{salaryInsight.title} · {salaryInsight.location} · {salaryInsight.dataYear} · {salaryInsight.method === "official_wages" ? "Published wage data" : "AI-assisted web research; general estimate"}</p>
              {salaryInsight.method === "official_wages" && salaryInsight.low !== undefined && salaryInsight.median !== undefined && salaryInsight.high !== undefined ? <>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-[10px] uppercase text-slate-500">25th percentile</p><p className="mt-1 text-sm font-bold">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(salaryInsight.low)}</p></div>
                  <div><p className="text-[10px] uppercase text-cyan-300">Median</p><p className="mt-1 text-lg font-black text-cyan-100">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(salaryInsight.median)}</p></div>
                  <div><p className="text-[10px] uppercase text-slate-500">75th percentile</p><p className="mt-1 text-sm font-bold">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(salaryInsight.high)}</p></div>
                </div>
                <p className="mt-3 text-[10px] leading-4 text-slate-500">{salaryInsight.source} {salaryInsight.sourceUrl && <a className="underline" href={salaryInsight.sourceUrl} target="_blank" rel="noopener noreferrer">Data source</a>}. {salaryInsight.rateType} wages; wages vary by experience and employer.</p>
              </> : <div>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-200">{salaryInsight.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">{salaryInsight.sources?.map((source) => <a key={source.url} className="underline text-cyan-200" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</div>
                {salaryInsight.searchSuggestion && <div aria-label="Google Search suggestions" dangerouslySetInnerHTML={{ __html: salaryInsight.searchSuggestion }} />}
              </div>}
            </div>}
          </div>          <form onSubmit={runTool} className="space-y-4">
            <label className="block space-y-1.5 text-xs text-slate-300">Choose a tool<select value={tool} onChange={(event) => { setTool(event.target.value as Tool); setToolOutput(""); }} className="field">{(Object.keys(titleByTool) as Tool[]).map((item) => <option key={item} value={item}>{titleByTool[item]} · {costByTool[item]} credit{costByTool[item] === 1 ? "" : "s"}</option>)}</select></label>
            {tool === "interview" && <><label className="block space-y-1.5 text-xs text-slate-300">Your interview answer<textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={5} maxLength={5000} className="field resize-y" placeholder="Describe the situation, your responsibility, the actions you took, and the outcome…" /></label><label className="flex gap-3 rounded-xl border border-slate-700 bg-slate-950/35 p-3 text-xs leading-5 text-slate-300"><input type="checkbox" checked={voiceConsent} onChange={(event) => setVoiceConsent(event.target.checked)} className="mt-1 size-4 accent-indigo-400"/>I understand voice capture uses my browser’s speech-recognition service, which may process audio outside CareerBoost. I can type instead; only the resulting text is sent to Gemini after I also accept the AI notice.</label><button type="button" onClick={toggleVoiceCapture} disabled={busy} className="rounded-lg border border-indigo-300/30 px-3 py-2 text-xs font-semibold text-indigo-100 disabled:opacity-50">{listening ? "Stop voice capture" : "Start voice capture"}</button></>}
            <label className="flex gap-3 rounded-xl border border-amber-300/25 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100"><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} className="mt-1 size-4 accent-indigo-400" />I agree to send the relevant profile details to Google Gemini to generate this result.</label>
            <button disabled={busy || !aiConsent || balance < costByTool[tool]} className="gradient-bg rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Working…" : `Generate · ${costByTool[tool]} credit${costByTool[tool] === 1 ? "" : "s"}`}</button>
          </form>
          {toolOutput && <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/70 p-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold">{titleByTool[tool]}</h3>{tool === "cv" && <button onClick={() => window.print()} className="no-print rounded-lg border border-slate-600 px-3 py-1.5 text-xs">Print / save PDF</button>}{tool === "linkedin" && <button onClick={() => navigator.clipboard.writeText(toolOutput).then(() => tell("Copied."), () => tell("Clipboard permission was denied."))} className="no-print rounded-lg border border-slate-600 px-3 py-1.5 text-xs">Copy</button>}</div><pre id="print-output" className="whitespace-pre-wrap font-sans text-sm leading-6 text-slate-100">{toolOutput}</pre></div>}
          <div className="mt-4 flex flex-wrap gap-2">{(Object.keys(titleByTool) as Tool[]).map((item) => <button key={item} onClick={() => { setTool(item); setToolOutput(""); }} className={`rounded-full px-3 py-1.5 text-xs ${tool === item ? "bg-indigo-500/30 text-indigo-100" : "bg-slate-800 text-slate-300"}`}>{titleByTool[item]}</button>)}</div>
        </section>

        <section id="learning" className="glass scroll-mt-24 rounded-2xl p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Learning library</p><h2 className="mt-1 text-xl font-bold">Short courses</h2><p className="my-2 text-xs text-slate-400">Completion records document quiz completion; they are not accredited certifications or independently verified qualifications.</p>
          <div className="mb-4 space-y-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><label className="flex items-start gap-2 text-xs leading-5 text-slate-300"><input type="checkbox" checked={learningSearchConsent} onChange={(event)=>setLearningSearchConsent(event.target.checked)} className="mt-1 accent-amber-400"/>I agree that CareerBoost may send my target role and location, skills, languages, career summary, recent experience, and any saved target roles, evidence gaps, and certifications to Gemini with Google Search to find learning resources. Search may incur provider charges; check course fees and terms before enrolling.</label><button type="button" disabled={busy || !learningSearchConsent} onClick={()=>findRecommendations("learning")} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{busy ? "Searching…" : "Find learning resources for my profile"}</button>{curatedCourses.length>0 && <div className="grid gap-3">{curatedCourses.map((course,index)=><article key={`${course.url}-${index}`} className="glass-card rounded-lg p-3"><h3 className="text-sm font-bold">{course.title}</h3><p className="mt-1 text-xs text-slate-400">{course.organization}</p><p className="mt-2 text-xs leading-5 text-slate-300">{course.description}</p><p className="mt-1 text-xs text-amber-200">For you: {course.fit}</p><a href={course.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-cyan-200 underline">Check resource ↗</a></article>)}</div>}</div>
          {learningSearchSuggestion && <div className="mb-3 text-xs text-slate-400" aria-label="Google Search suggestions" dangerouslySetInnerHTML={{ __html: learningSearchSuggestion }} />}
          <div className="space-y-4">{courses.map((course) => { const completion = completions.find((item) => item.course_id === course.id); const complete = !!completion; return <article key={course.id} className="glass-card rounded-xl p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className="text-[11px] font-bold uppercase tracking-wide text-amber-300">{course.category} · {course.duration_minutes} min</span><h3 className="mt-1 font-bold">{course.title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{course.description}</p></div>{complete && <span className="text-xs font-bold text-emerald-300">Complete</span>}</div><details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-indigo-200">Read lesson and quiz</summary><p className="my-3 whitespace-pre-line text-xs leading-5 text-slate-200">{course.lesson}</p>{!complete && <div className="space-y-2"><p className="text-xs font-bold">{course.quiz_question}</p>{course.quiz_options.map((option, index) => <label key={index} className="flex gap-2 text-xs leading-5 text-slate-300"><input type="radio" name={`quiz-${course.id}`} checked={courseAnswer[course.id] === String(index)} onChange={() => setCourseAnswer((old) => ({ ...old, [course.id]: String(index) }))} />{option}</label>)}<button disabled={busy} onClick={() => completeCourse(course.id)} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">Submit quiz · 1 credit</button></div>}</details>{complete && <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="break-all font-mono text-[10px] text-slate-500">Record {completion.certificate_code}</p><Link href={`/verify/${completion.certificate_code}`} className="text-xs font-semibold text-indigo-200 underline underline-offset-4">View shareable verification</Link></div>}</article>; })}</div>
        </section>

        <section id="credits" className="glass scroll-mt-24 rounded-2xl p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Credits & payments</p><h2 className="mt-1 text-xl font-bold">Top up your balance</h2><p className="mt-2 text-xs text-slate-400">Payments use Paystack. Credits appear only after the server verifies the matching amount, currency, reference, and payer with Paystack.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{packages.map((bundle) => <article key={bundle.id} className="glass-card rounded-xl p-4"><h3 className="font-bold">{bundle.label}</h3><p className="my-1 text-amber-200">{bundle.credits} credits</p><p className="mb-3 text-xs text-slate-400">{bundle.amountSubunits ? new Intl.NumberFormat(undefined, { style: "currency", currency: bundle.currency }).format(bundle.amountSubunits / 100) : "Price not set"}</p><button disabled={busy || !bundle.amountSubunits} onClick={() => startPayment(bundle.id)} className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">{bundle.amountSubunits ? "Continue to Paystack" : "Not configured"}</button></article>)}</div>
          <h3 className="mt-6 font-bold">Recent credit activity</h3><ul className="mt-2 space-y-2">{entries.slice(0, 8).map((entry) => <li key={entry.id} className="flex justify-between gap-3 border-b border-slate-700/60 py-2 text-xs"><span>{entry.reason}</span><span className={entry.amount > 0 ? "text-emerald-300" : "text-slate-300"}>{entry.amount > 0 ? "+" : ""}{entry.amount}</span></li>)}</ul>
        </section>

        <section id="account" className="glass scroll-mt-24 rounded-2xl p-5 sm:p-7 lg:col-span-2"><h2 className="text-lg font-bold">Account deletion</h2><p className="mt-1 text-xs leading-5 text-slate-400">Deleting removes the login and profile, unlinks credit history, and redacts order email. Payment references are retained for reconciliation; review local retention requirements before launch.</p>{isPrimarySuperAdmin && profile.role === "owner" ? <p className="mt-4 text-xs text-emerald-200">This primary SuperAdmin account is protected from deletion.</p> : <form onSubmit={deleteAccount} className="mt-4 flex flex-wrap gap-3"><input name="confirmEmail" type="email" required placeholder="Re-enter your account email" className="field max-w-sm" /><button disabled={busy} className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-200 hover:bg-red-950/50 disabled:opacity-50">Delete account</button></form>}</section>
        {(initialProfile.role === "admin" || initialProfile.role === "owner") && <section id="admin" className="glass scroll-mt-24 rounded-2xl p-5 sm:p-7 lg:col-span-2"><p className="text-xs font-bold uppercase tracking-widest text-purple-300">Administrator</p><h2 className="mt-1 text-xl font-bold">Account and credit controls</h2><p className="mb-4 mt-2 text-xs text-slate-400">Credit changes are append-only and audited. All SuperAdmins can manage user roles and administrator tasks. The primary SuperAdmin account is protected.</p><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="text-slate-400"><tr><th className="p-2">Account</th><th className="p-2">Role</th><th className="p-2">Balance</th><th className="p-2">Add credits</th></tr></thead><tbody>{adminUsers.map((adminUser) => <tr key={adminUser.id} className="border-t border-slate-700/70"><td className="p-2"><div className="font-semibold">{adminUser.full_name || "Candidate"}</div><div className="text-slate-500">{adminUser.email}</div></td><td className="p-2">{profile.role === "owner" && adminUser.email.toLowerCase() !== "colyske@gmail.com" ? <select value={adminUser.role} disabled={busy || adminUser.id === initialProfile.id} onChange={(event) => changeRole(adminUser.id, event.target.value as "candidate" | "admin" | "owner")} className="field max-w-32"><option value="candidate">Candidate</option><option value="admin">Admin</option><option value="owner">SuperAdmin</option></select> : <span className="capitalize">{adminUser.role === "owner" ? "SuperAdmin" : adminUser.role}{adminUser.email.toLowerCase() === "colyske@gmail.com" ? " · Protected" : ""}</span>}</td><td className="p-2 font-bold text-amber-200">{adminUser.credits}</td><td className="p-2">{adminUser.email.toLowerCase() === "colyske@gmail.com" ? <span className="text-slate-500">Protected</span> : <div className="flex gap-2"><input aria-label={`Credit amount for ${adminUser.email}`} type="number" min="1" max="1000" value={creditAdjustments[adminUser.id] || ""} onChange={(event) => setCreditAdjustments((old) => ({ ...old, [adminUser.id]: event.target.value }))} className="field max-w-24"/><button disabled={busy} onClick={() => adjustCredits(adminUser.id)} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950 disabled:opacity-50">Add</button></div>}</td></tr>)}</tbody></table></div><details className="mt-6 rounded-xl border border-slate-700 p-4"><summary className="cursor-pointer font-bold">Publish opportunity</summary><form onSubmit={publishJob} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs">Role title<input name="title" minLength={4} maxLength={180} required className="field"/></label><label className="space-y-1.5 text-xs">Employer<input name="company" minLength={2} maxLength={180} required className="field"/></label><label className="space-y-1.5 text-xs">Region<input name="region" minLength={2} maxLength={180} required className="field"/></label><label className="space-y-1.5 text-xs">Salary / compensation (optional)<input name="salaryRange" maxLength={180} className="field"/></label><label className="space-y-1.5 text-xs sm:col-span-2">Required skills (comma separated)<input name="requiredSkills" maxLength={1200} className="field"/></label><label className="space-y-1.5 text-xs sm:col-span-2">Job description<textarea name="description" minLength={20} maxLength={5000} required rows={4} className="field"/></label><label className="space-y-1.5 text-xs sm:col-span-2">HTTPS application URL<input name="applicationUrl" type="url" pattern="https://.*" required className="field"/></label><button disabled={busy} className="gradient-bg rounded-xl px-4 py-3 text-sm font-bold sm:col-span-2">Publish listing</button></form></details></section>}
      </div>
      <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-slate-700/70 pt-5 text-xs text-slate-500"><span>Career drafts are suggestions. Verify facts and employment terms independently.</span><Link href="/privacy" className="underline">Privacy and retention</Link></footer>
    </main>
  );
}

export function PaymentReturn() {
  const router = useRouter();
  const [status, setStatus] = useState("Checking the payment directly with Paystack…");
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference");
    if (!reference) { void Promise.resolve().then(() => setStatus("No payment reference was provided. Check your balance in the candidate hub.")); return; }
    api<{ verified: boolean }>("/api/payments/verify", { method: "POST", body: JSON.stringify({ reference }) })
      .then(() => { setStatus("Payment verified. Your credit balance is updating."); setTimeout(() => router.replace("/dashboard"), 1200); })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Payment is still being verified. Check the dashboard in a moment."));
  }, [router]);
  return <main className="mx-auto max-w-xl px-5 py-24"><section className="glass rounded-3xl p-8 text-center"><h1 className="text-2xl font-extrabold">Payment status</h1><p role="status" className="mt-4 text-sm text-slate-300">{status}</p><Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold">Return to dashboard</Link></section></main>;
}
