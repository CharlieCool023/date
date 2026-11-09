"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Progress, Skeleton } from "@/components/loaders";
import { resizeImage } from "@/lib/resize-image";

interface Zone { id: string; city: string; name: string; country: string }
interface Question {
  id: string;
  version: number;
  kind: string;
  category: string;
  options: { prompt?: string; choices?: string[]; minimum?: number; maximum?: number };
}
interface Status {
  role: string;
  status: string;
  eligibilityComplete: boolean;
  verification: "pending" | "approved" | "rejected" | null;
  photoCount: number;
  answerCount: number;
  availabilityCount: number;
}

type StepId = "about" | "photos" | "selfie" | "questions" | "availability" | "finish";
const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "about", label: "About you" },
  { id: "photos", label: "Photos" },
  { id: "selfie", label: "Verification" },
  { id: "questions", label: "Questions" },
  { id: "availability", label: "Availability" },
  { id: "finish", label: "Finish" }
];
const MAX_MUST_MATCH = 3;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const genders = [["woman", "Woman"], ["man", "Man"], ["nonbinary", "Non-binary"], ["self_described", "Another description"]];
const seekingOptions = [["woman", "Women"], ["man", "Men"], ["nonbinary", "Non-binary people"]];
const intents = [
  ["long_term", "A long-term partnership"],
  ["open_to_long_term", "Open to a long-term connection"],
  ["casual_dating", "A lighter connection"]
];

function stepDone(step: StepId, status: Status | null): boolean {
  if (!status) return false;
  switch (step) {
    case "about": return status.eligibilityComplete;
    case "photos": return status.photoCount >= 2;
    case "selfie": return status.verification === "pending" || status.verification === "approved";
    case "questions": return status.answerCount >= 12;
    case "availability": return status.availabilityCount > 0;
    case "finish": return status.status === "active";
  }
}

async function readJson(response: Response): Promise<{ message?: string; code?: string } & Record<string, unknown>> {
  return await response.json().catch(() => ({})) as { message?: string; code?: string } & Record<string, unknown>;
}

export default function OnboardingForm() {
  const [status, setStatus] = useState<Status | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mustMatch, setMustMatch] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<StepId | null>(null);
  const [loadError, setLoadError] = useState("");

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/v1/me/status", { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/signin");
      return null;
    }
    const next = await response.json() as Status;
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void Promise.all([
      refreshStatus(),
      fetch("/api/v1/zones").then((response) => response.json()),
      fetch("/api/v1/questionnaire", { cache: "no-store" }).then((response) => response.ok ? response.json() : { questions: [], answers: [] })
    ]).then(([current, zoneData, questionData]) => {
      if (Array.isArray(zoneData.zones)) setZones(zoneData.zones);
      if (Array.isArray(questionData.questions)) setQuestions(questionData.questions);
      if (Array.isArray(questionData.answers)) {
        const saved = questionData.answers as Array<{ questionId: string; value: unknown; mustMatch?: boolean }>;
        setAnswers(Object.fromEntries(saved.map((answer) => [answer.questionId, typeof answer.value === "string" ? answer.value : String(answer.value)])));
        setMustMatch(new Set(saved.filter((answer) => answer.mustMatch).map((answer) => answer.questionId)));
      }
      setStep(STEPS.find((item) => !stepDone(item.id, current))?.id ?? "finish");
    }).catch(() => setLoadError("Your profile could not be loaded. Refresh the page to try again."));
  }, [refreshStatus]);

  const goNext = useCallback(async () => {
    const current = await refreshStatus();
    const index = STEPS.findIndex((item) => item.id === step);
    const next = STEPS.slice(index + 1).find((item) => !stepDone(item.id, current)) ?? STEPS[STEPS.length - 1];
    setStep(next?.id ?? "finish");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [refreshStatus, step]);

  if (loadError) return <p className="notice is-error" role="alert">{loadError}</p>;
  if (!status || !step) return <div className="onboarding-form"><Skeleton heading lines={5} label="Preparing your profile" /></div>;

  return (
    <div className="onboarding-form">
      <nav className="stepper" aria-label="Profile steps">
        <ol>
          {STEPS.map((item, index) => {
            const done = stepDone(item.id, status);
            return (
              <li key={item.id}>
                <button type="button" className="stepper-item" aria-current={item.id === step ? "step" : undefined} onClick={() => setStep(item.id)}>
                  <span className={done ? "stepper-mark is-done" : "stepper-mark"} aria-hidden="true">{done ? "✓" : index + 1}</span>
                  <span className="stepper-label">{item.label}</span>
                  {done ? <span className="sr-only">(complete)</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {step === "about" && <AboutStep zones={zones} done={status.eligibilityComplete} onDone={goNext} />}
      {step === "photos" && <PhotosStep photoCount={status.photoCount} onChanged={refreshStatus} onDone={goNext} />}
      {step === "selfie" && <SelfieStep verification={status.verification} admin={status.role === "admin" || status.role === "moderator"} onChanged={refreshStatus} onDone={goNext} />}
      {step === "questions" && (
        <QuestionsStep questions={questions} answers={answers} setAnswers={setAnswers}
          mustMatch={mustMatch} setMustMatch={setMustMatch} onDone={goNext} />
      )}
      {step === "availability" && <AvailabilityStep done={status.availabilityCount > 0} onDone={goNext} />}
      {step === "finish" && <FinishStep status={status} onRefresh={refreshStatus} goTo={setStep} />}
    </div>
  );
}

function StepHeader({ index, title, intro }: { index: number; title: string; intro: string }) {
  return (
    <header className="step-header">
      <p className="eyebrow">STEP {index} OF {STEPS.length}</p>
      <h2>{title}</h2>
      <p className="note">{intro}</p>
    </header>
  );
}

function ChoiceGroup({ label, options, value, onChange }: { label: string; options: string[][]; value: string; onChange: (value: string) => void }) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="choice-pills" role="radiogroup" aria-label={label}>
        {options.map(([optionValue, optionLabel]) => (
          <button type="button" role="radio" aria-checked={value === optionValue} className="choice-pill" key={optionValue}
            onClick={() => onChange(optionValue!)}>{optionLabel}</button>
        ))}
      </div>
    </fieldset>
  );
}

function AboutStep({ zones, done, onDone }: { zones: Zone[]; done: boolean; onDone: () => Promise<void> }) {
  const [editing, setEditing] = useState(!done);
  const [birthDate, setBirthDate] = useState("");
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [gender, setGender] = useState("");
  const [seeking, setSeeking] = useState("");
  const [ageMin, setAgeMin] = useState("21");
  const [ageMax, setAgeMax] = useState("45");
  const [intent, setIntent] = useState("long_term");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const missing = [
    !birthDate && "your date of birth",
    !zoneId && "your zone",
    !gender && "how you describe your gender",
    !seeking && "who you're open to meeting",
    !consent && "the consent confirmation"
  ].filter(Boolean) as string[];

  async function save() {
    if (missing.length) {
      setError(`Still needed: ${missing.join(", ")}.`);
      return;
    }
    if (Number(ageMin) < 18 || Number(ageMax) < Number(ageMin)) {
      setError("The age range must start at 18 or above, and the maximum can't be below the minimum.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/me/eligibility", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ birthDate, zoneId, gender, seeking: [seeking], ageMin: Number(ageMin), ageMax: Number(ageMax), intent, consentVersion: "velum-consent-v1" })
      });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.message ?? "These details could not be saved.");
      await onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "These details could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wizard-card" aria-labelledby="about-title">
      <StepHeader index={1} title="About you" intro="Used only for eligibility and matching. Velum keeps your birth year, never the full date." />
      {!editing ? (
        <>
          <p className="saved-row"><span aria-hidden="true">✓</span> Saved. You can change these at any time.</p>
          <div className="step-actions">
            <button className="button primary" type="button" onClick={() => void onDone()}>Continue</button>
            <button className="button secondary" type="button" onClick={() => setEditing(true)}>Edit details</button>
          </div>
        </>
      ) : (
        <>
          <div className="form-grid">
            <label>Date of birth
              <input type="date" max={today} value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </label>
            <label>Your zone
              <select value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
                {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.city} · {zone.name}</option>)}
              </select>
            </label>
          </div>
          <ChoiceGroup label="How do you describe your gender?" options={genders} value={gender} onChange={setGender} />
          <ChoiceGroup label="Who are you open to meeting?" options={seekingOptions} value={seeking} onChange={setSeeking} />
          <fieldset className="field">
            <legend>Age range you’re open to</legend>
            <div className="age-range">
              <label>From<input type="number" inputMode="numeric" min="18" max="100" value={ageMin} onChange={(event) => setAgeMin(event.target.value)} /></label>
              <span aria-hidden="true">–</span>
              <label>To<input type="number" inputMode="numeric" min="18" max="100" value={ageMax} onChange={(event) => setAgeMax(event.target.value)} /></label>
            </div>
          </fieldset>
          <ChoiceGroup label="What are you open to?" options={intents} value={intent} onChange={setIntent} />
          <label className="check-row">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I understand anonymous room messages are ephemeral, reports may keep a consented encrypted snapshot, and Velum can’t prevent screenshots.</span>
          </label>
          {error && <p className="notice is-error" role="alert">{error}</p>}
          <div className="step-actions">
            <button className="button primary" type="button" onClick={() => void save()} disabled={busy} aria-busy={busy}>
              {busy ? "Saving…" : "Save and continue"}
            </button>
            {done && <button className="text-button" type="button" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </>
      )}
    </section>
  );
}

function PhotosStep({ photoCount, onChanged, onDone }: { photoCount: number; onChanged: () => Promise<Status | null>; onDone: () => Promise<void> }) {
  const [progress, setProgress] = useState<{ value: number; max: number; label: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length < 2 || files.length > 4) {
      setError("Choose two to four photos at once.");
      return;
    }
    setBusy(true);
    setError("");
    let finished = 0;
    setProgress({ value: 0, max: files.length, label: `Preparing ${files.length} photos` });
    try {
      await Promise.all(files.map(async (file, position) => {
        const image = await resizeImage(file);
        const form = new FormData();
        form.set("image", image);
        form.set("position", String(position));
        const response = await fetch("/api/v1/me/photos", { method: "POST", body: form });
        const body = await readJson(response);
        if (!response.ok) throw new Error(body.message ?? "A photo could not be uploaded.");
        finished += 1;
        setProgress({ value: finished, max: files.length, label: `Uploaded ${finished} of ${files.length}` });
      }));
      await onChanged();
    } catch (caught) {
      setProgress(null);
      setError(caught instanceof Error ? caught.message : "Photos could not be uploaded.");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wizard-card" aria-labelledby="photos-title">
      <StepHeader index={2} title="Your photos" intro="Choose two to four. They stay hidden from everyone until you and a match both choose to unveil." />
      <button type="button" className="upload-tile" onClick={() => input.current?.click()} disabled={busy} aria-busy={busy}>
        <span className="upload-tile-title">{photoCount >= 2 ? "Replace your photos" : "Choose photos"}</span>
        <span className="note">{photoCount >= 2 ? `${photoCount} photos saved` : "Select 2–4 images at once"}</span>
      </button>
      <input ref={input} className="sr-only" type="file" accept="image/*" multiple onChange={(event) => void upload(event)} tabIndex={-1} />
      {progress && <Progress value={progress.value} max={progress.max} label={progress.label} />}
      {photoCount >= 2 && !busy && <p className="saved-row"><span aria-hidden="true">✓</span> {photoCount} private photos saved.</p>}
      {error && <p className="notice is-error" role="alert">{error}</p>}
      <div className="step-actions">
        <button className="button primary" type="button" disabled={busy || photoCount < 2} onClick={() => void onDone()}>Continue</button>
      </div>
    </section>
  );
}

function SelfieStep({ verification, admin, onChanged, onDone }: {
  verification: Status["verification"]; admin: boolean; onChanged: () => Promise<Status | null>; onDone: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submitted = verification === "pending" || verification === "approved";

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("selfie", await resizeImage(file));
      const response = await fetch("/api/v1/me/verification", { method: "POST", body: form });
      const body = await readJson(response);
      if (!response.ok && body.code !== "ALREADY_PENDING") throw new Error(body.message ?? "Your selfie could not be submitted.");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your selfie could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wizard-card" aria-labelledby="selfie-title">
      <StepHeader index={3} title="Verification selfie" intro="A moderator compares it with your photos, then it’s deleted. You can carry on while it’s reviewed." />
      {verification === "approved" && <p className="saved-row"><span aria-hidden="true">✓</span> Verified.</p>}
      {verification === "pending" && (
        <p className="saved-row is-pending"><span aria-hidden="true">…</span> Submitted and waiting for review.
          {admin && <> As an admin you can review it now in <Link href="/admin" target="_blank">Admin</Link>.</>}
        </p>
      )}
      {verification === "rejected" && <p className="notice is-error">Your last selfie wasn’t approved. Please take a clear new one.</p>}
      {!submitted && (
        <button type="button" className="upload-tile" onClick={() => input.current?.click()} disabled={busy} aria-busy={busy}>
          <span className="upload-tile-title">{busy ? "Uploading your selfie…" : "Take or choose a selfie"}</span>
          <span className="note">Face the camera in good light</span>
        </button>
      )}
      <input ref={input} className="sr-only" type="file" accept="image/*" capture="user" onChange={(event) => void upload(event)} tabIndex={-1} />
      {error && <p className="notice is-error" role="alert">{error}</p>}
      <div className="step-actions">
        <button className="button primary" type="button" disabled={busy || !submitted} onClick={() => void onDone()}>Continue</button>
      </div>
    </section>
  );
}

function QuestionsStep({ questions, answers, setAnswers, mustMatch, setMustMatch, onDone }: {
  questions: Question[];
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  mustMatch: Set<string>;
  setMustMatch: React.Dispatch<React.SetStateAction<Set<string>>>;
  onDone: () => Promise<void>;
}) {
  const firstUnanswered = questions.findIndex((question) => !answers[question.id]);
  const [index, setIndex] = useState(firstUnanswered === -1 ? 0 : firstUnanswered);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const advance = useRef<number | null>(null);
  const answeredCount = useMemo(() => questions.filter((question) => answers[question.id]).length, [questions, answers]);
  const question = questions[index];
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  useEffect(() => () => { if (advance.current !== null) window.clearTimeout(advance.current); }, []);

  if (!question) return <p className="notice is-error">The questions could not be loaded. Refresh the page to try again.</p>;

  function choose(choice: string) {
    setAnswers((current) => ({ ...current, [question!.id]: choice }));
    setError("");
    if (advance.current !== null) window.clearTimeout(advance.current);
    if (index < questions.length - 1) advance.current = window.setTimeout(() => setIndex((current) => current + 1), 320);
  }

  function toggleMust() {
    setMustMatch((current) => {
      const next = new Set(current);
      if (next.has(question!.id)) next.delete(question!.id);
      else if (next.size < MAX_MUST_MATCH) next.add(question!.id);
      return next;
    });
  }

  async function save() {
    const missing = questions.findIndex((item) => !answers[item.id]);
    if (missing !== -1) {
      setIndex(missing);
      setError(`Question ${missing + 1} still needs an answer.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/questionnaire", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: questions.map((item) => ({
            questionId: item.id,
            questionVersion: item.version,
            value: item.kind === "scale" ? Number(answers[item.id]) : answers[item.id],
            mustMatch: mustMatch.has(item.id)
          }))
        })
      });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.message ?? "Your answers could not be saved.");
      await onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your answers could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const choices = question.kind === "scale"
    ? Array.from({ length: (question.options.maximum ?? 5) - (question.options.minimum ?? 1) + 1 }, (_, offset) => String((question.options.minimum ?? 1) + offset))
    : question.options.choices ?? [];
  const isMust = mustMatch.has(question.id);

  return (
    <section className="wizard-card" aria-labelledby="questions-title">
      <StepHeader index={4} title="A few questions" intro="Pick what feels most true. Answers are never shown to anyone before a mutual unveil." />
      <div className="question-progress">
        <span>Question {index + 1} of {questions.length}</span>
        <span>{answeredCount} answered</span>
      </div>
      <div className="question-dots" aria-hidden="true">
        {questions.map((item, dot) => (
          <button type="button" tabIndex={-1} key={item.id} onClick={() => setIndex(dot)}
            className={`question-dot${answers[item.id] ? " is-answered" : ""}${dot === index ? " is-current" : ""}`} />
        ))}
      </div>
      <div className="question-card" key={question.id}>
        <p className="question-category">{question.category}</p>
        <h3 id="questions-title">{question.options.prompt ?? question.id}</h3>
        <div className={question.kind === "tradeoff" ? "choice-cards is-pair" : "choice-cards"} role="radiogroup" aria-label={question.options.prompt}>
          {choices.map((choice) => (
            <button type="button" role="radio" aria-checked={answers[question.id] === choice} className="choice-card" key={choice} onClick={() => choose(choice)}>
              {choice}
            </button>
          ))}
        </div>
        <button type="button" role="switch" aria-checked={isMust} className="must-toggle"
          disabled={!isMust && mustMatch.size >= MAX_MUST_MATCH} onClick={toggleMust}>
          <span className="switch" aria-hidden="true" />
          <span>Must match <small>({mustMatch.size} of {MAX_MUST_MATCH} used)</small></span>
        </button>
      </div>
      {error && <p className="notice is-error" role="alert">{error}</p>}
      <div className="step-actions is-split">
        <button className="button secondary" type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
        {index < questions.length - 1 && !allAnswered
          ? <button className="button secondary" type="button" onClick={() => setIndex(index + 1)}>Skip for now</button>
          : <button className="button primary" type="button" onClick={() => void save()} disabled={busy} aria-busy={busy}>
              {busy ? "Saving…" : allAnswered ? "Save answers" : "Review missing"}
            </button>}
      </div>
    </section>
  );
}

function AvailabilityStep({ done, onDone }: { done: boolean; onDone: () => Promise<void> }) {
  const zones = useMemo(() => {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    return supported?.length ? supported : ["Africa/Lagos", "Europe/London", "UTC"];
  }, []);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos");
  const [days, setDays] = useState<number[]>([4, 5]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (days.length === 0) {
      setError("Choose at least one evening.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/me/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone, windows: days.map((weekday) => ({ weekday, startMinute: 20 * 60, endMinute: 23 * 60 })) })
      });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.message ?? "Your availability could not be saved.");
      await onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your availability could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wizard-card" aria-labelledby="availability-title">
      <StepHeader index={5} title="When you’re free" intro="Sessions happen between 8 and 11 PM on the evenings you pick. You can change this later." />
      {done && <p className="saved-row"><span aria-hidden="true">✓</span> Saved. Saving again replaces your evenings.</p>}
      <fieldset className="field">
        <legend>Evenings</legend>
        <div className="day-options">
          {DAYS.map((day, weekday) => (
            <label className="day-check" key={day}>
              <input type="checkbox" checked={days.includes(weekday)}
                onChange={(event) => setDays((current) => event.target.checked ? [...current, weekday] : current.filter((value) => value !== weekday))} />
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field-label">Timezone
        <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
          {zones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
        </select>
      </label>
      {error && <p className="notice is-error" role="alert">{error}</p>}
      <div className="step-actions">
        <button className="button primary" type="button" onClick={() => void save()} disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </div>
    </section>
  );
}

function FinishStep({ status, onRefresh, goTo }: { status: Status; onRefresh: () => Promise<Status | null>; goTo: (step: StepId) => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const admin = status.role === "admin" || status.role === "moderator";
  const rows: Array<{ step: StepId; label: string; done: boolean; detail?: string }> = [
    { step: "about", label: "About you", done: status.eligibilityComplete },
    { step: "photos", label: "Photos", done: status.photoCount >= 2, detail: `${status.photoCount} of 2` },
    { step: "selfie", label: "Verification", done: status.verification === "approved",
      detail: status.verification === "pending" ? "waiting for review" : status.verification === "rejected" ? "needs a new selfie" : status.verification ? undefined : "not submitted" },
    { step: "questions", label: "Questions", done: status.answerCount >= 12, detail: `${status.answerCount} of 12` },
    { step: "availability", label: "Availability", done: status.availabilityCount > 0 }
  ];
  const ready = rows.every((row) => row.done);

  async function finish() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/me/finalize", { method: "POST" });
      const body = await readJson(response);
      if (response.ok) {
        window.location.assign("/me");
        return;
      }
      setMessage(body.message ?? "Your profile isn’t complete yet.");
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  if (status.status === "active") {
    return (
      <section className="wizard-card">
        <StepHeader index={6} title="You’re in" intro="Your profile is active and you’re in stealth mode." />
        <Link className="button primary" href="/me">Go to your space</Link>
      </section>
    );
  }

  return (
    <section className="wizard-card" aria-labelledby="finish-title">
      <StepHeader index={6} title="Almost there" intro="Everything below needs a tick before you can enter stealth mode." />
      <ul className="status-list">
        {rows.map((row) => (
          <li key={row.step}>
            <span className={row.done ? "stepper-mark is-done" : "stepper-mark"} aria-hidden="true">{row.done ? "✓" : "•"}</span>
            <span>{row.label}{row.detail && !row.done ? <small> · {row.detail}</small> : null}</span>
            {!row.done && <button className="text-button" type="button" onClick={() => goTo(row.step)}>Open</button>}
          </li>
        ))}
      </ul>
      {status.verification === "pending" && admin && (
        <p className="notice">Your selfie is waiting for review. As an admin, approve it in <Link href="/admin">Admin</Link>, then come back here.</p>
      )}
      {message && <p className="notice is-error" role="alert">{message}</p>}
      <div className="step-actions">
        <button className="button primary" type="button" onClick={() => void finish()} disabled={busy || !ready} aria-busy={busy}>
          {busy ? "Finishing…" : "Enter stealth mode"}
        </button>
        {!ready && <button className="button secondary" type="button" onClick={() => void onRefresh()}>Check again</button>}
      </div>
    </section>
  );
}
