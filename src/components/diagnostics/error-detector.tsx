"use client";

import { useEffect, useMemo, useState } from "react";

type DiagnosticKind =
  | "click"
  | "error"
  | "unhandledrejection"
  | "console"
  | "network";

type DiagnosticEvent = {
  id: string;
  timestamp: string;
  kind: DiagnosticKind;
  message: string;
  route: string;
  details?: Record<string, unknown>;
};

const STORAGE_KEY = "agfusion-diagnostics-v1";
const MAX_EVENTS = 150;
const MAX_BODY = 1200;

function safeText(value: unknown, max = 600): string {
  try {
    if (value instanceof Error) return `${value.name}: ${value.message}`.slice(0, max);
    if (typeof value === "string") return value.slice(0, max);
    return JSON.stringify(value)?.slice(0, max) || String(value).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

function safeUrl(input: string): string {
  try {
    const url = new URL(input, window.location.origin);
    return `${url.origin}${url.pathname}${url.search ? "?…" : ""}`;
  } catch {
    return input.split("?")[0].slice(0, 500);
  }
}

function readEvents(): DiagnosticEvent[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

function writeEvents(events: DiagnosticEvent[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Diagnostics must never break the application.
  }
}

function describeElement(element: Element | null): string {
  if (!element) return "unknown";
  const el = element as HTMLElement;
  const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const role = el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "";
  return `${tag}${id}${role}${text ? ` · ${text}` : ""}`;
}

function makeEvent(kind: DiagnosticKind, message: string, details?: Record<string, unknown>): DiagnosticEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    kind,
    message: message.slice(0, 1200),
    route: `${window.location.pathname}${window.location.search ? "?…" : ""}`,
    details,
  };
}

export function ErrorDetector() {
  const [events, setEvents] = useState<DiagnosticEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEvents(readEvents());

    const record = (event: DiagnosticEvent) => {
      setEvents((current) => {
        const next = [...current, event].slice(-MAX_EVENTS);
        writeEvents(next);
        return next;
      });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const interactive = target?.closest("button,a,[role=button],input,select,textarea");
      if (!interactive) return;
      record(
        makeEvent("click", `Clicked ${describeElement(interactive)}`, {
          element: describeElement(interactive),
          href: interactive instanceof HTMLAnchorElement ? safeUrl(interactive.href) : undefined,
        }),
      );
    };

    const onError = (event: ErrorEvent) => {
      record(
        makeEvent("error", event.error instanceof Error ? event.error.message : event.message || "Window error", {
          name: event.error?.name,
          stack: event.error?.stack?.slice(0, 4000),
          source: event.filename ? safeUrl(event.filename) : undefined,
          line: event.lineno,
          column: event.colno,
        }),
      );
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      record(
        makeEvent("unhandledrejection", safeText(reason, 1200), {
          name: reason?.name,
          stack: reason?.stack?.slice(0, 4000),
        }),
      );
    };

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      record(makeEvent("console", args.map((arg) => safeText(arg)).join(" ")));
      originalConsoleError(...args);
    };

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const started = performance.now();
      const request = args[0];
      const init = args[1];
      const url = typeof request === "string" ? request : request instanceof URL ? request.toString() : request.url;
      const method = request instanceof Request ? request.method : init?.method || "GET";
      try {
        const response = await originalFetch(...args);
        if (!response.ok) {
          let body = "";
          try {
            body = (await response.clone().text()).slice(0, MAX_BODY);
          } catch {
            body = "<unable to read response body>";
          }
          record(
            makeEvent("network", `HTTP ${response.status} ${response.statusText || "request failed"}`, {
              method,
              url: safeUrl(url),
              status: response.status,
              durationMs: Math.round(performance.now() - started),
              responseBody: body,
            }),
          );
        }
        return response;
      } catch (error) {
        record(
          makeEvent("network", `Network request failed: ${safeText(error)}`, {
            method,
            url: safeUrl(url),
            durationMs: Math.round(performance.now() - started),
          }),
        );
        throw error;
      }
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = originalConsoleError;
      window.fetch = originalFetch;
    };
  }, []);

  const errors = useMemo(
    () => events.filter((event) => event.kind !== "click"),
    [events],
  );

  const report = useMemo(
    () =>
      JSON.stringify(
        {
          tool: "AGFusion Error Detector",
          generatedAt: new Date().toISOString(),
          page: typeof window !== "undefined" ? window.location.href.split("?")[0] : "unknown",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
          online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
          events,
        },
        null,
        2,
      ),
    [events],
  );

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this AGFusion diagnostic report:", report);
    }
  };

  const clear = () => {
    writeEvents([]);
    setEvents([]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[100] inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/95 px-3.5 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl hover:bg-slate-900"
        title="Open AGFusion error detector"
      >
        <span className={`h-2 w-2 rounded-full ${errors.length ? "bg-red-400" : "bg-emerald-400"}`} />
        Diagnostics{errors.length ? ` · ${errors.length}` : ""}
      </button>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div><div className="text-sm font-semibold">AGFusion Error Detector</div><div className="text-[10px] text-slate-400">{errors.length} recorded error events</div></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5">✕</button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {events.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No diagnostic events recorded.</div>}
              {events.slice().reverse().map((event) => (
                <div key={event.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">{event.kind}</span><span className="text-[10px] text-slate-500">{event.timestamp}</span></div>
                  <div className="mt-1 text-xs text-slate-200">{event.message}</div>
                  {event.details && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-slate-500">{JSON.stringify(event.details, null, 2)}</pre>}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 p-3">
              <button type="button" onClick={clear} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Clear</button>
              <button type="button" onClick={() => void copyReport()} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-950">{copied ? "Copied" : "Copy Developer Report"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
