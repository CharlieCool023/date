"use client";

import { useEffect, useState } from "react";

interface TeamMember { id: string; role: "member" | "moderator" | "admin"; status: string; createdAt: string }

export default function Team() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [notice, setNotice] = useState("Loading team…");
  const [saving, setSaving] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/v1/admin/team", { cache: "no-store" });
    if (!response.ok) {
      setNotice(response.status === 403 ? "Only admins can manage the team." : "The team could not be loaded.");
      return;
    }
    const data = await response.json() as { members: TeamMember[] };
    setMembers(data.members);
    setNotice("");
  }

  useEffect(() => { void refresh(); }, []);

  async function changeRole(userId: string, role: TeamMember["role"]) {
    setSaving(userId);
    const response = await fetch("/api/v1/admin/team", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, role })
    });
    if (response.ok) {
      setNotice("Role updated and recorded in the audit log.");
      await refresh();
    } else {
      const result = await response.json() as { code?: string };
      setNotice(result.code === "LAST_ADMIN" ? "The last admin must remain an admin." : "Role update could not be saved.");
    }
    setSaving(null);
  }

  return <section className="session-list" aria-labelledby="team-heading">
    <h2 id="team-heading">Team access</h2>
    <p className="note">Assign member, moderator, or admin access. Every change is recorded.</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    {members.map((member) => <div className="team-row" key={member.id}>
      <div><strong>Member {member.id.slice(0, 8)}</strong><small>{member.status} · joined {new Date(member.createdAt).toLocaleDateString()}</small></div>
      <label className="team-role">Role
        <select value={member.role} disabled={saving !== null} onChange={(event) => void changeRole(member.id, event.target.value as TeamMember["role"])}>
          <option value="member">Member</option><option value="moderator">Moderator</option><option value="admin">Admin</option>
        </select>
      </label>
    </div>)}
    {!members.length && !notice && <p className="note">No active members found.</p>}
  </section>;
}
