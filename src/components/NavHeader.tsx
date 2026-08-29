"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Board" },
  { href: "/allotment", label: "Allotment" },
  { href: "/pan-cards", label: "PAN Cards" },
  { href: "/investors", label: "Investors" },
];

const MORE_ITEMS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/feedback", label: "Feedback" },
];

export default function NavHeader() {
  const pathname = usePathname();

  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      gap: 4,
      padding: "8px 16px",
      borderBottom: "1px solid #DEE1D9",
      background: "#fff",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <Link href="/" style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginRight: 12,
        textDecoration: "none",
      }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "#237355",
          color: "#fff",
          fontWeight: 800,
          fontSize: 14,
        }}>₹</span>
        <span style={{ fontWeight: 800, fontSize: 16, color: "#173C32", letterSpacing: -0.3 }}>IPOBharosa</span>
      </Link>

      <div style={{ display: "flex", gap: 2, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                background: active ? "#237355" : "transparent",
                color: active ? "#fff" : "#5A6B63",
                transition: "all 0.15s",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 2 }}>
        {MORE_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
                color: active ? "#237355" : "#8A968F",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
