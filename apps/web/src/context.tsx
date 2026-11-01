"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { api, write, errorText } from "./api";
import type {
  Dashboard,
  Page,
  Result,
  Locale,
  Offering,
  Stats,
  PathwayId,
  Preferences,
} from "./types";
import { labels } from "./content";

type Workspace = {
  ready: boolean;
  error: string;
  dashboard: Dashboard | null;
  draft: Result | null;
  stats: Stats | null;
  locale: Locale;
  revision: number;
  compareIds: string[];
  notice: string;
  uploadsEnabled: boolean;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  setLocale: (locale: Locale) => Promise<void>;
  setGoal: (pathway: PathwayId) => Promise<void>;
  saveOffering: (offering: Offering) => Promise<void>;
  toggleCompare: (id: string) => void;
  isSaved: (id: string) => boolean;
  deleted: boolean;
  deleteWorkspace: () => Promise<void>;
  restart: () => Promise<void>;
  t: (key: string) => string;
};
const Context = createContext<Workspace | null>(null);
let bootPromise: Promise<boolean> | null = null;
async function bootstrap() {
  const session = await write<{ session: string; demo_available?: boolean; uploads_enabled?: boolean }>("/session");
  if (session.session === "created" && session.demo_available) await write("/session/demo");
  return session.uploads_enabled !== false;
}
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicReport = pathname.startsWith("/r/");
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [draft, setDraft] = useState<Result | null>(null),
    [stats, setStats] = useState<Stats | null>(null),
    [locale, setLocaleValue] = useState<Locale>("en"),
    [revision, setRevision] = useState(0),
    [compareIds, setCompareIds] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [uploadsEnabled, setUploadsEnabled] = useState(true),
    [deleted, setDeleted] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4500);
  }, []);
  const refresh = useCallback(async () => {
    const [dash, results] = await Promise.all([
      api<Dashboard>("/me/dashboard"),
      api<Page<Result>>("/results?limit=50"),
    ]);
    setDashboard(dash);
    setLocaleValue(dash.profile.locale || "en");
    setDraft(
      [...results.items]
        .reverse()
        .find((r) => r.confirmation_state === "draft") || null,
    );
    setRevision((v) => v + 1);
  }, []);
  useEffect(() => {
    api<Stats>("/catalogue/stats")
      .then(setStats)
      .catch(() => {});
    try {
      const ids = JSON.parse(localStorage.getItem("cq_compare") || "[]");
      if (Array.isArray(ids))
        setCompareIds(
          ids.filter((id: unknown) => typeof id === "string").slice(0, 3),
        );
    } catch {}
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    if (isPublicReport) {
      setReady(true);
      return;
    }
    if (deleted) return;
    let active = true;
    if (!bootPromise)
      bootPromise = bootstrap().catch((e) => {
        bootPromise = null;
        throw e;
      });
    bootPromise
      .then((enabled) => {
        if (active) setUploadsEnabled(enabled);
        return refresh();
      })
      .then(() => {
        if (active) {
          setReady(true);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setReady(true);
          setError(errorText(e));
        }
      });
    return () => {
      active = false;
    };
  }, [isPublicReport, deleted, refresh]);
  useEffect(() => {
    document.documentElement.lang =
      locale === "mr" ? "mr" : locale === "hi" ? "hi" : "en";
  }, [locale]);
  const setLocale = async (value: Locale) => {
    await write("/me/profile", { locale: value }, "PATCH");
    setLocaleValue(value);
    setDashboard((d) =>
      d ? { ...d, profile: { ...d.profile, locale: value } } : d,
    );
    notify(labels[value].saved);
  };
  const setGoal = async (pathway: PathwayId) => {
    await write("/me/goal", { pathway_id: pathway }, "PUT");
    await refresh();
    notify("Your goal is saved. You can change it any time.");
  };
  const isSaved = (id: string) =>
    Boolean(dashboard?.shortlist.some((item) => item.offering_id === id));
  const saveOffering = async (offering: Offering) => {
    if (isSaved(offering.id)) {
      await write(
        "/me/shortlist/" + encodeURIComponent(offering.id),
        undefined,
        "DELETE",
      );
      notify("Removed from your shortlist.");
    } else {
      await write(
        "/me/shortlist/" + encodeURIComponent(offering.id),
        { status: "shortlisted" },
        "PUT",
      );
      notify("Added to your shortlist.");
    }
    await refresh();
  };
  const toggleCompare = (id: string) =>
    setCompareIds((ids) => {
      const next = ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length < 3
          ? [...ids, id]
          : ids;
      if (!ids.includes(id) && ids.length >= 3)
        notify("Compare up to three offerings at a time.");
      localStorage.setItem("cq_compare", JSON.stringify(next));
      return next;
    });
  const deleteWorkspace = async () => {
    await write("/me", undefined, "DELETE");
    bootPromise = null;
    setDeleted(true);
    setDashboard(null);
    setDraft(null);
    setCompareIds([]);
    localStorage.removeItem("cq_compare");
    localStorage.removeItem("cq_compass_session");
  };
  const restart = async () => {
    setDeleted(false);
    setReady(false);
    setError("");
    bootPromise = null;
  };
  return (
    <Context.Provider
      value={{
        ready,
        error,
        dashboard,
        draft,
        stats,
        locale,
        revision,
        compareIds,
        notice,
        uploadsEnabled,
        refresh,
        notify,
        setLocale,
        setGoal,
        saveOffering,
        toggleCompare,
        isSaved,
        deleted,
        deleteWorkspace,
        restart,
        t: (key) => labels[locale][key] || labels.en[key] || key,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider missing");
  return value;
}
export function useData<T>(path: string | null, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(Boolean(path)),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError("");
    try {
      setData(await api<T>(path));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active && !(e instanceof Error && e.name === "AbortError"))
          setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, ...dependencies]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, setData, loading, error, reload };
}
export function useTask() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async <T,>(job: () => Promise<T>) => {
    setBusy(true);
    setError("");
    try {
      return await job();
    } catch (e) {
      setError(errorText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
