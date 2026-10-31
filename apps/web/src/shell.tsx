"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Brand,
  CompareTray,
  Icon,
  Notice,
  Button,
  ActionLink,
  ErrorState,
  Loading,
} from "./ui";
import { useWorkspace } from "./context";
import { MentorWidget } from "./mentor-widget";
import { route } from "./content";

const navigation = [
  { label: "home", href: "/", icon: "home" },
  { label: "marks", href: "/start", icon: "file" },
  { label: "explore", href: "/explore", icon: "route" },
  { label: "compass", href: "/compass/report", icon: "compass" },
  { label: "colleges", href: "/colleges", icon: "graduate" },
  { label: "shortlist", href: "/shortlist", icon: "bookmark" },
  { label: "compare", href: "/compare", icon: "scale" },
  { label: "mentor", href: "/mentor", icon: "chat" },
  { label: "report", href: "/report/new", icon: "book" },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const ws = useWorkspace(),
    path = usePathname(),
    router = useRouter();
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const active = (href: string) =>
    href === "/"
      ? path === "/" || path === "/dashboard"
      : href === "/start"
        ? path.startsWith("/start") || path === "/snapshot"
        : href.startsWith("/compass")
          ? path.startsWith("/compass")
          : path.startsWith(href);
  return (
    <div
      className={`app-shell ${ws.compareIds.length ? "with-comparison" : ""}`}
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="mobile-bar">
        <Brand small />
        <button
          className="icon-button"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          aria-controls="main-navigation"
          onClick={() => setMenu(!menu)}
        >
          <Icon name={menu ? "close" : "menu"} size={22} />
        </button>
      </div>
      <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
        </div>
        <div className="workspace-scope">
          <span className="scope-dot" />
          <span>After Class 10</span>
        </div>
        <nav id="main-navigation" aria-label="Main navigation">
          <p className="nav-group">Your exploration</p>
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={"nav-item " + (active(item.href) ? "active" : "")}
              aria-current={active(item.href) ? "page" : undefined}
            >
              <Icon name={item.icon} size={18} />
              <span>{ws.t(item.label)}</span>
              {active(item.href) && (
                <Icon name="right" size={14} className="nav-arrow" />
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            href="/data"
            className={"nav-item " + (active("/data") ? "active" : "")}
          >
            <Icon name="shield" />
            {ws.t("data")}
          </Link>
          <Link
            href="/settings/privacy"
            className={"nav-item " + (active("/settings") ? "active" : "")}
          >
            <Icon name="settings" />
            {ws.t("privacy")}
          </Link>
          <div className="student-scope">
            <span className="avatar">
              {(ws.dashboard?.profile.display_name || "Demo student")
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join("")}
            </span>
            <span>
              <strong>
                {ws.dashboard?.profile.display_name || "Your workspace"}
              </strong>
              <small>{ws.t("demo")}</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <div className="utility-bar">
          <span className="breadcrumb">Your future, at your pace.</span>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(
                "/colleges" +
                  (search ? "?q=" + encodeURIComponent(search) : ""),
              );
              setSearch("");
            }}
          >
            <Icon name="search" size={16} />
            <input
              ref={searchInput}
              aria-label="Search colleges"
              placeholder="Search colleges"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="keyboard-hint">Ctrl K</span>
          </form>
        </div>
        <main id="main-content" className="main-content">
          {ws.deleted ? (
            <>
              <div className="page-header">
                <h1>Your workspace is deleted</h1>
              </div>
              <Notice>
                Your marks, memory, shortlist, uploads and report shares have
                been removed.
              </Notice>
              <Button onClick={() => ws.restart()}>
                Start a new demo workspace
              </Button>
            </>
          ) : ws.error ? (
            <>
              <div className="page-header">
                <h1>Let’s reconnect</h1>
              </div>
              <ErrorState
                message={ws.error}
                retry={() => window.location.reload()}
              />
            </>
          ) : !ws.ready || !ws.dashboard ? (
            <>
              <div className="page-header">
                <h1>Your next chapter</h1>
              </div>
              <Loading lines={5} />
            </>
          ) : (
            children
          )}
        </main>
        <footer className="app-footer">
          <span>CareerQuest · Thoughtful choices after Class 10</span>
          <div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/data">Sources & coverage</Link>
            <a href="/api-health" target="_blank" rel="noreferrer">
              Service status
            </a>
          </div>
        </footer>
      </div>
      <CompareTray />
      <MentorWidget />
      {ws.notice && (
        <div className="toast" role="status">
          <Icon name="check" />
          {ws.notice}
        </div>
      )}
    </div>
  );
}
