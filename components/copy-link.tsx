"use client";

import { useState } from "react";

/** Copies an app-relative link as an absolute URL, so the manager can paste it into a message. */
export function CopyLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(href, window.location.href).toString());
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-ink ring-1 ring-rule-strong hover:bg-paper"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
