"use client";

import { useEffect, useState } from "react";
import { Progress, Skeleton } from "@/components/loaders";

interface Zone { id: string; city: string; name: string; country: string }
interface Question {
  id: string;
  version: number;
  kind: string;
  category: string;
  weight: string;
  options: { prompt?: string; choices?: string[]; minimum?: number; maximum?: number };
}

const intents = [
  ["long_term", "A long-term partnership"],
  ["open_to_long_term", "Open to a long-term connection"],
  ["casual_dating", "A lighter connection"]
];

export default function OnboardingForm() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [zoneId, setZoneId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [seeking, setSeeking] = useState("");
  const [ageMin, setAgeMin] = useState("21");
  const [ageMax, setAgeMax] = useState("45");
  const [intent, setIntent] = useState("long_term");
  const [consent, setConsent] = useState(false);
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [availability, setAvailability] = useState<string[]>(["4"]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<{ value: number; max: number; label: string; scope: "media" | "save" } | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/api/v1/zones").then((response) => response.json()),
      fetch("/api/v1/questionnaire").then((response) => response.ok ? response.json() : { questions: [], answers: [] })
    ]).then(([zoneData, questionData]) => {
      if (Array.isArray(zoneData.zones)) {
        setZones(zoneData.zones);
        setZoneId(zoneData.zones[0]?.id ?? "");
      }
      if (Array.isArray(questionData.questions)) setQuestions(questionData.questions);
      if (Array.isArray(questionData.answers)) {
        setAnswers(Object.fromEntries(questionData.answers.map((answer: { questionId: string; value: unknown }) => [
          answer.questionId,
          typeof answer.value === "string" ? answer.value : JSON.stringify(answer.value)
        ])));
      }
    }).catch(() => setMessage("Profile details could not be loaded. Refresh and try again."))
      .finally(() => setLoaded(true));
  }, []);

  async function saveEligibility() {
    if (!birthDate || !zoneId || !gender || !seeking) throw new Error("Complete all eligibility fields first.");
    const response = await fetch("/api/v1/me/eligibility", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        birthDate,
        zoneId,
        gender,
        seeking: [seeking],
        ageMin: Number(ageMin),
        ageMax: Number(ageMax),
        intent,
        consentVersion: consent ? "velum-consent-v1" : ""
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "Eligibility could not be saved.");
  }

  async function saveQuestions() {
    if (questions.length < 12 || questions.some((question) => !answers[question.id])) {
      throw new Error("Answer all twelve questions before continuing.");
    }
    const mustMatchIds = Object.keys(answers).filter((questionId) => answers[questionId]?.startsWith("must:"));
    if (mustMatchIds.length > 3) throw new Error("Choose no more than three must-match answers.");
    const result = await fetch("/api/v1/questionnaire", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answers: questions.map((question) => {
          const raw = answers[question.id] ?? "";
          const mustMatch = raw.startsWith("must:");
          const answer = mustMatch ? raw.slice(5) : raw;
          return {
            questionId: question.id,
            questionVersion: question.version,
            value: question.kind === "scale" ? Number(answer) : answer,
            mustMatch
          };
        })
      })
    });
    const body = await result.json();
    if (!result.ok) throw new Error(body.message ?? "Answers could not be saved.");
  }

  async function saveAvailability() {
    if (availability.length === 0) throw new Error("Choose at least one evening.");
    const days = availability.map(Number);
    const result = await fetch("/api/v1/me/availability", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        timezone,
        windows: days.map((weekday) => ({ weekday, startMinute: 20 * 60, endMinute: 23 * 60 }))
      })
    });
    const body = await result.json();
    if (!result.ok) throw new Error(body.message ?? "Availability could not be saved.");
  }

  async function uploadPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length < 2 || files.length > 4) {
      setMessage("Choose two to four profile photos.");
      return;
    }
    setBusy(true);
    try {
      for (const [position, image] of files.entries()) {
        setProgress({ value: position, max: files.length, label: `Uploading photo ${position + 1} of ${files.length}`, scope: "media" });
        const form = new FormData();
        form.set("image", image);
        form.set("position", String(position));
        const response = await fetch("/api/v1/me/photos", { method: "POST", body: form });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "A photo could not be uploaded.");
      }
      setProgress({ value: files.length, max: files.length, label: `${files.length} photos uploaded`, scope: "media" });
      setMessage("Your private photos are saved. They stay hidden until a mutual unveil.");
    } catch (error) {
      setProgress(null);
      setMessage(error instanceof Error ? error.message : "Photos could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadSelfie(event: React.ChangeEvent<HTMLInputElement>) {
    const selfie = event.target.files?.[0];
    if (!selfie) return;
    setBusy(true);
    setProgress({ value: 0, max: 1, label: "Uploading your verification selfie", scope: "media" });
    try {
      const form = new FormData();
      form.set("selfie", selfie);
      const response = await fetch("/api/v1/me/verification", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Verification could not be submitted.");
      setProgress({ value: 1, max: 1, label: "Selfie uploaded", scope: "media" });
      setMessage("Your private verification is in the review queue.");
    } catch (error) {
      setProgress(null);
      setMessage(error instanceof Error ? error.message : "Verification could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    setBusy(true);
    setMessage("");
    try {
      setProgress({ value: 0, max: 4, label: "Saving eligibility and consent (1 of 4)", scope: "save" });
      await saveEligibility();
      setProgress({ value: 1, max: 4, label: "Saving your answers (2 of 4)", scope: "save" });
      await saveQuestions();
      setProgress({ value: 2, max: 4, label: "Saving your availability (3 of 4)", scope: "save" });
      await saveAvailability();
      setProgress({ value: 3, max: 4, label: "Checking your profile is complete (4 of 4)", scope: "save" });
      const response = await fetch("/api/v1/me/finalize", { method: "POST" });
      const body = await response.json();
      if (!response.ok && body.code !== "ONBOARDING_INCOMPLETE") throw new Error(body.message ?? "Profile could not be completed.");
      setProgress({ value: 4, max: 4, label: "Profile saved", scope: "save" });
      setMessage(body.message ?? "Your profile is saved. Verification approval is the final step before matching.");
    } catch (error) {
      setProgress(null);
      setMessage(error instanceof Error ? error.message : "Profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function setAnswer(questionId: string, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  const currentAge = new Date().toISOString().slice(0, 10);

  if (!loaded) return <div className="onboarding-form"><Skeleton heading lines={6} label="Preparing your profile" /></div>;

  return (
    <div className="onboarding-form">
      <section className="form-section" aria-labelledby="eligibility-heading">
        <h2 id="eligibility-heading">01 / Eligibility & consent</h2>
        <div className="form-grid">
          <label>Date of birth (used only to verify you are 18+)
            <input type="date" max={currentAge} value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
          </label>
          <label>Your zone
            <select value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.city} · {zone.name}</option>)}
            </select>
          </label>
          <label>How do you describe your gender?
            <select value={gender} onChange={(event) => setGender(event.target.value)}>
              <option value="">Choose privately</option>
              <option value="woman">Woman</option><option value="man">Man</option>
              <option value="nonbinary">Non-binary</option><option value="self_described">Another description</option>
            </select>
          </label>
          <label>Who are you open to meeting?
            <select value={seeking} onChange={(event) => setSeeking(event.target.value)}>
              <option value="">Choose</option><option value="woman">Women</option><option value="man">Men</option><option value="nonbinary">Non-binary people</option>
            </select>
          </label>
          <label>Minimum age<input type="number" min="18" max="100" value={ageMin} onChange={(event) => setAgeMin(event.target.value)} /></label>
          <label>Maximum age<input type="number" min="18" max="100" value={ageMax} onChange={(event) => setAgeMax(event.target.value)} /></label>
          <label>What are you open to?
            <select value={intent} onChange={(event) => setIntent(event.target.value)}>
              {intents.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>I understand anonymous room messages are ephemeral, reports may retain a consented encrypted snapshot, and Velum cannot prevent screenshots.</span>
        </label>
      </section>

      <section className="form-section" aria-labelledby="photos-heading">
        <h2 id="photos-heading">02 / Private photos & verification</h2>
        <label>Choose two to four profile photos
          <input type="file" accept="image/*" multiple onChange={uploadPhotos} disabled={busy} />
        </label>
        <p className="note">Images are resized and metadata removed before private storage. Only you can see them until mutual unveil.</p>
        <label>One-time verification selfie
          <input type="file" accept="image/*" capture="user" onChange={uploadSelfie} disabled={busy} />
        </label>
        {progress?.scope === "media" && <Progress value={progress.value} max={progress.max} label={progress.label} />}
        <p className="note">Reviewed by a moderator and deleted after the decision. You can complete the rest of your profile while the review is pending.</p>
      </section>

      <section className="form-section" aria-labelledby="questions-heading">
        <h2 id="questions-heading">03 / Questions</h2>
        <p className="note">Mark at most three answers as “must match”. Your answers are never shown before mutual unveil.</p>
        {questions.map((question) => (
          <fieldset className="question" key={question.id}>
            <legend>{question.options.prompt ?? question.id}</legend>
            {question.kind === "scale" ? (
              <input type="number" min={question.options.minimum ?? 1} max={question.options.maximum ?? 5}
                aria-label={question.options.prompt ?? question.id}
                value={answers[question.id]?.replace(/^must:/, "") ?? ""}
                onChange={(event) => setAnswer(question.id, `${answers[question.id]?.startsWith("must:") ? "must:" : ""}${event.target.value}`)} />
            ) : (
              <select aria-label={question.options.prompt ?? question.id} value={answers[question.id]?.replace(/^must:/, "") ?? ""} onChange={(event) => setAnswer(question.id, `${answers[question.id]?.startsWith("must:") ? "must:" : ""}${event.target.value}`)}>
                <option value="">Choose an answer</option>
                {(question.options.choices ?? []).map((choice) => <option key={choice} value={choice}>{choice}</option>)}
              </select>
            )}
            <label className="check-row"><input type="checkbox" checked={answers[question.id]?.startsWith("must:") ?? false}
              onChange={(event) => setAnswer(question.id, `${event.target.checked ? "must:" : ""}${answers[question.id]?.replace(/^must:/, "") ?? ""}`)} />
              <span>Must match</span></label>
          </fieldset>
        ))}
      </section>

      <section className="form-section" aria-labelledby="availability-heading">
        <h2 id="availability-heading">04 / Weekly availability</h2>
        <label>Timezone
          <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
        </label>
        <div className="day-options">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
            <label className="day-check" key={day}>
              <input type="checkbox" checked={availability.includes(String(index))}
                onChange={(event) => setAvailability((current) => event.target.checked
                  ? [...current, String(index)]
                  : current.filter((value) => value !== String(index)))} />
              {day}
            </label>
          ))}
        </div>
        <p className="note">Available evenings are 8–11 PM in your selected timezone. You can revise them later.</p>
      </section>

      {progress?.scope === "save" && busy && <Progress value={progress.value} max={progress.max} label={progress.label} />}
      {message && <p className="notice" role="status">{message}</p>}
      <button className="button primary" type="button" onClick={saveAll} disabled={busy || questions.length < 12} aria-busy={busy}>
        {busy ? "Saving…" : "Save and enter stealth mode"} <span aria-hidden="true">↗</span>
      </button>
      <p className="note">Your profile becomes active when a moderator approves your verification.</p>
    </div>
  );
}
