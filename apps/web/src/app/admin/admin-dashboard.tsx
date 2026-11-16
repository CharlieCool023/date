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

interface ReviewImage { url: string; label: string; selfie: boolean }

// The selfie leads so it can be compared against each profile photo.
function reviewImages(item: Verification): ReviewImage[] {
  return [
    ...(item.selfieUrl ? [{ url: item.selfieUrl, label: "Verification selfie", selfie: true }] : []),
    ...[...item.photos].sort((a, b) => a.position - b.position)
      .map((photo) => ({ url: photo.url, label: `Profile photo ${photo.position + 1}`, selfie: false }))
  ];
}

export default function AdminDashboard() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [viewer, setViewer] = useState<{ itemId: string; index: number } | null>(null);
  const [expired, setExpired] = useState(false);
  const viewerItem = viewer ? verifications.find((item) => item.id === viewer.itemId) : undefined;
  const viewerImages = viewerItem ? reviewImages(viewerItem) : [];
  const viewerImage = viewer ? viewerImages[viewer.index] : undefined;

  useEffect(() => {
    if (!viewer) return;
    const count = viewerImages.length;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setViewer(null);
      else if (event.key === "ArrowRight") setViewer((current) => current && { ...current, index: (current.index + 1) % count });
      else if (event.key === "ArrowLeft") setViewer((current) => current && { ...current, index: (current.index - 1 + count) % count });
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [viewer, viewerImages.length]);

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
    // Each queue stands alone: a failure in one must not hide the other.
    const failed: string[] = [];
    if (verificationResponse.ok) {
      setVerifications((await verificationResponse.json() as { verifications: Verification[] }).verifications);
      setExpired(false);
    } else failed.push("verifications");
    if (reportResponse.ok) {
      setReports((await reportResponse.json() as { reports: Report[] }).reports);
    } else failed.push("reports");
    setNotice(failed.length ? `The ${failed.join(" and ")} queue could not be loaded. Refresh to try again.` : "");
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
            <p className="note">Member {item.userId.slice(0, 8)} · submitted {new Date(item.createdAt).toLocaleString()}</p>
            <div className="review-strip">
              {reviewImages(item).map((image, index) => (
                <button type="button" className={`review-thumb${image.selfie ? " is-selfie" : ""}`} key={image.url}
                  onClick={() => setViewer({ itemId: item.id, index })} aria-label={`Preview ${image.label}`}>
                  <img src={image.url} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setExpired(true)} />
                  <span>{image.label}</span>
                </button>
              ))}
            </div>
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
      {expired && (
        <p className="notice">Image previews expire after five minutes for privacy.{" "}
          <button className="text-button" type="button" onClick={() => void refresh()}>Reload previews</button>
        </p>
      )}

      {viewer && viewerItem && viewerImage && (
        <div className="viewer" role="dialog" aria-modal="true" aria-label={`${viewerImage.label} preview`} onClick={() => setViewer(null)}>
          <div className="viewer-panel" onClick={(event) => event.stopPropagation()}>
            <header className="viewer-header">
              <span>{viewerImage.label} <small>· {viewer.index + 1} of {viewerImages.length}</small></span>
              <button className="text-button" type="button" onClick={() => setViewer(null)} autoFocus>Close</button>
            </header>
            <div className="viewer-stage">
              {viewerImages.length > 1 && (
                <button type="button" className="viewer-nav" aria-label="Previous image"
                  onClick={() => setViewer({ ...viewer, index: (viewer.index - 1 + viewerImages.length) % viewerImages.length })}>‹</button>
              )}
              <img key={viewerImage.url} src={viewerImage.url} alt={viewerImage.label} referrerPolicy="no-referrer" draggable={false}
                onError={() => setExpired(true)} />
              {viewerImages.length > 1 && (
                <button type="button" className="viewer-nav" aria-label="Next image"
                  onClick={() => setViewer({ ...viewer, index: (viewer.index + 1) % viewerImages.length })}>›</button>
              )}
            </div>
            <div className="viewer-strip">
              {viewerImages.map((image, index) => (
                <button type="button" key={image.url} className={`review-thumb is-small${index === viewer.index ? " is-current" : ""}${image.selfie ? " is-selfie" : ""}`}
                  onClick={() => setViewer({ ...viewer, index })} aria-label={`Show ${image.label}`}>
                  <img src={image.url} alt="" referrerPolicy="no-referrer" draggable={false} />
                </button>
              ))}
            </div>
            <div className="member-actions">
              <button className="button primary" type="button" disabled={deciding !== null} aria-busy={deciding === `${viewerItem.id}:approved`}
                onClick={() => { const id = viewerItem.id; setViewer(null); void decideVerification(id, "approved"); }}>Approve</button>
              <button className="button secondary" type="button" disabled={deciding !== null} aria-busy={deciding === `${viewerItem.id}:rejected`}
                onClick={() => { const id = viewerItem.id; setViewer(null); void decideVerification(id, "rejected"); }}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
