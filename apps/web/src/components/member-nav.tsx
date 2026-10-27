"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/me", label: "Your space" },
  { href: "/conversations", label: "Conversations" },
  { href: "/invites", label: "Invitations" }
];

export default function MemberNav({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  const items = admin ? [...links, { href: "/admin", label: "Trust & safety" }] : links;

  return (
    <nav className="member-nav" aria-label="Member navigation">
      {items.map(({ href, label }) => {
        const current = pathname === href || (href !== "/me" && pathname.startsWith(`${href}/`));
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
