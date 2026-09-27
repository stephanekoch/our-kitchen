"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function TabBar() {
  const path = usePathname();
  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined;
  return (
    <nav className="tabbar" aria-label="Main">
      <Link href="/" className="tab" aria-current={current("/")}>
        <Icon name="book" size={24} />
        Recipes
      </Link>
      <Link href="/add" className="fab" aria-label="Add a recipe" aria-current={current("/add")}>
        <Icon name="plus" size={28} stroke={2.6} />
      </Link>
      <Link href="/list" className="tab" aria-current={current("/list")}>
        <Icon name="list" size={24} />
        List
      </Link>
    </nav>
  );
}

/** Page frame: header at the top, content in the middle, controls docked at the bottom (thumb zone). */
export function Screen({
  title,
  subtitle,
  right,
  dock,
  tabs = true,
  dockHeight = 170,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  dock?: ReactNode;
  tabs?: boolean;
  dockHeight?: number;
  children: ReactNode;
}) {
  return (
    <div className="screen" style={{ ["--dock-h" as string]: `${dockHeight}px` }}>
      {title !== undefined && (
        <header className="screen-header">
          <div>
            <h1>{title}</h1>
            {subtitle && <p aria-live="polite">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
      {(dock || tabs) && (
        <div className="dock">
          {dock}
          {tabs && <TabBar />}
        </div>
      )}
    </div>
  );
}
