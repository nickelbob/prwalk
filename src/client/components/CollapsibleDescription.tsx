import { useState } from "react";

/**
 * The PR description, collapsible behind a caret. Used wherever the description
 * shows "at the top of the page" — the gate screen and the status bar — so the
 * collapse behaviour is identical in both places. Defaults to expanded.
 */
export function CollapsibleDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  if (!text) return null;
  return (
    <div className="desc-collapse">
      <button
        className="desc-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "▾" : "▸"} Description
      </button>
      {open && <p className="desc-body">{text}</p>}
    </div>
  );
}
