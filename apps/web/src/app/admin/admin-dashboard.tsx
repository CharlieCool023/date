"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/loaders";

interface Verification {
  id: string;
  userId: string;
  createdAt: string;
  selfieUrl: string | null;
  photos: Array<{ id: string; position: number; url: string }>;
}

interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  sessionId: string | null;
  reason: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function refresh() {
    const [verificationResponse, reportResponse] = await Promise.all([
      fetch("/api/v1/admin/verifications", { cache: "no-store" }),
      fetch("/api/v1/admin/reports", { cache: "no-store" })
    ]);
    if (verificationResponse.status === 401 || verificationResponse.status === 403
      || reportResponse.status === 401 || reportResponse.status === 403) {
      setNotice("Administrator access is required.");
      setLoaded(true);
      return;
    }
    if (!verificationResponse.ok || !reportResponse.ok) throw new Error("Review queues are temporarily unavailable.");
    const verificationData = await verificationResponse.json() as { verifications: Verification[] };
    const reportData = await reportResponse.json() as { reports: Report[] };
    setVerifications(verificationData.verifications);
    setReports(reportData.reports);
    setNotice("");
    setLoaded(true);
  }

  useEffect(() => {
    void refresh().catch(() => {
      setNotice("Review queues are temporarily unavailable.");
      setLoaded(true);
    });
  }, []);

  async function decideVerification(id: string, status: "approved" | "rejected") {
    setDeciding(`${id}:${status}`);
    try {
      const response = await fetch(`/api/v1/admin/verifications/${id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        setNotice("Verification decision was not saved.");
        return;
      }
      await refresh();
    } finally {
      setDeciding(null);
    }
  }

  async function decideReport(id: string, decision: "dismiss" | "suspend") {
    setDeciding(`${id}:${decision}`);
    try {
      const response = await fetch(`/api/v1/admin/reports/${id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision })
      });
      if (!response.ok) {
        setNotice("Report decision was not saved.");
        return;
      }
      await refresh();
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="admin-queues">
      {!loaded && <Skeleton heading lines={3} label="Fetching the review queues" />}
      {loaded && <>
      <section className="session-list">
        <h2>Manual verification ({verifications.length})</h2>
        {verifications.map((item) => (
          <article className="admin-review" key={item.id}>
            <p className="note">Member {item.userId} · submitted {new Date(item.createdAt).toLocaleString()}</p>
            {item.selfieUrl && <a href={item.selfieUrl} target="_blank" rel="noreferrer">Open verification selfie</a>}
            <div className="admin-photos">{item.photos.map((photo) => <a href={photo.url} key={photo.id} target="_blank" rel="noreferrer">Profile photo {photo.position + 1}</a>)}</div>
            <div className="member-actions">
              <button className="button secondary" onClick={() => void decideVerification(item.id, "approved")} disabled={deciding !== null} aria-busy={deciding === `${item.id}:approved`}>Approve</button>
              <button className="button secondary" onClick={() => void decideVerification(item.id, "rejected")} disabled={deciding !== null} aria-busy={deciding === `${item.id}:rejected`}>Reject</button>
            </div>
          </article>
        ))}
        {!verifications.length && <p className="note">No pending verifications.</p>}
      </section>
      <section className="session-list">
        <h2>Member reports ({reports.length})</h2>
        {reports.map((report) => (
          <article className="admin-review" key={report.id}>
            <p><strong>{report.reason}</strong> · {new Date(report.createdAt).toLocaleString()}</p>
            <p className="note">Reported member {report.reportedId}; reporter {report.reporterId}; session {report.sessionId ?? "not linked"}</p>
            <div className="member-actions">
              <button className="button secondary" onClick={() => void decideReport(report.id, "dismiss")} disabled={deciding !== null} aria-busy={deciding === `${report.id}:dismiss`}>Dismiss</button>
              <button className="button secondary" onClick={() => void decideReport(report.id, "suspend")} disabled={deciding !== null} aria-busy={deciding === `${report.id}:suspend`}>Suspend member</button>
            </div>
          </article>
        ))}
        {!reports.length && <p className="note">No open reports.</p>}
      </section>
      </>}
      {notice && <p className="notice" role="status">{notice}</p>}
    </div>
  );
}
