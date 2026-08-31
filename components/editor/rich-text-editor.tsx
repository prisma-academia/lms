"use client";

import { useCallback, useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { cn } from "@/lib/utils";

/**
 * WYSIWYG lesson editor.
 *
 * Authors used to write lesson bodies into a bare `<textarea>` and were told the
 * result supported "light markdown" that nothing parsed — so a heading typed as
 * `## Overview` reached the learner as those literal characters. This is the
 * fix: what the author lays out is what gets stored.
 *
 * It emits HTML, and every tag it can produce already sits inside the
 * `SANITIZE_OPTIONS` allowlist in `lib/content/sanitize-html.ts`, so nothing
 * here widens the security surface. Content is still sanitized on write and
 * again on read — a WYSIWYG is an authoring convenience, never a trust boundary.
 *
 * The source toggle is not a power-user afterthought. Lesson HTML also arrives
 * from the AI builder, from imports, and from pasted designed pages; an author
 * who cannot see the markup has no way to repair markup the visual editor did
 * not expect.
 *
 * The toolbar is labelled with text rather than icons because `components/icon`
 * carries no formatting glyphs, and a row of invented approximations reads worse
 * than the letters everyone already knows from every other editor.
 */

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    // The one h1 on the page belongs to the lesson title, not its body.
    heading: { levels: [2, 3, 4] },
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: "noopener noreferrer" },
  }),
  Image,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

type ToolbarAction = {
  /** Short label shown in the button. */
  text: string;
  /** Accessible name — the button text alone is too terse to announce. */
  label: string;
  className?: string;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
};

const ACTIONS: (ToolbarAction | "divider")[] = [
  {
    text: "B",
    label: "Bold",
    className: "font-black",
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive("bold"),
  },
  {
    text: "I",
    label: "Italic",
    className: "font-serif italic",
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive("italic"),
  },
  "divider",
  {
    text: "H2",
    label: "Heading",
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    text: "H3",
    label: "Subheading",
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    active: (e) => e.isActive("heading", { level: 3 }),
  },
  "divider",
  {
    text: "•",
    label: "Bulleted list",
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive("bulletList"),
  },
  {
    text: "1.",
    label: "Numbered list",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive("orderedList"),
  },
  {
    text: "❝",
    label: "Quote",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive("blockquote"),
  },
  {
    text: "</>",
    label: "Code block",
    className: "font-mono text-[11px]",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
    active: (e) => e.isActive("codeBlock"),
  },
  "divider",
  {
    text: "▦",
    label: "Insert table",
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

const BUTTON_CLASS =
  "flex h-8 min-w-8 items-center justify-center rounded-[8px] border-2 px-1.5 text-[13px] font-bold text-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring";

function ToolbarButton({ action, editor }: { action: ToolbarAction; editor: Editor }) {
  const active = action.active?.(editor) ?? false;
  return (
    <button
      type="button"
      title={action.label}
      aria-label={action.label}
      aria-pressed={action.active ? active : undefined}
      onClick={() => action.run(editor)}
      className={cn(
        BUTTON_CLASS,
        action.className,
        active ? "border-border bg-muted" : "border-transparent hover:bg-muted"
      )}
    >
      {action.text}
    </button>
  );
}

function LinkButton({ editor }: { editor: Editor }) {
  const active = editor.isActive("link");
  return (
    <button
      type="button"
      title={active ? "Remove link" : "Add link"}
      aria-label={active ? "Remove link" : "Add link"}
      aria-pressed={active}
      onClick={() => {
        if (active) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        // Crude, but a link dialog nested inside the lesson dialog inside a form
        // is a focus-trap problem for what is a single-field question.
        const href = window.prompt("Link URL (https://…)")?.trim();
        if (!href) return;
        if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
          window.alert("Links must start with https:// or mailto:.");
          return;
        }
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      }}
      className={cn(
        BUTTON_CLASS,
        "underline",
        active ? "border-border bg-muted" : "border-transparent hover:bg-muted"
      )}
    >
      link
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  id,
  disabled = false,
}: {
  /** Lesson body as HTML. */
  value: string;
  onChange: (html: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  const [showSource, setShowSource] = useState(false);

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: value,
    editable: !disabled,
    // Next renders this on the server too; without the opt-out, React hydration
    // mismatches against the DOM ProseMirror builds for itself.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "lesson-prose min-h-[14rem] max-w-none px-3 py-2.5 outline-none",
        ...(id ? { id } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Adopt changes made elsewhere — AI generation, switching lesson — without
  // clobbering what the author is typing. `getHTML()` differs from `value` only
  // when the change originated outside this editor.
  useEffect(() => {
    if (!editor || showSource) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value, showSource]);

  const leaveSource = useCallback(() => {
    setShowSource(false);
    editor?.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        className="min-h-[16rem] rounded-[10px] border-2 border-border bg-background"
        aria-busy="true"
      />
    );
  }

  return (
    <div className="rounded-[10px] border-2 border-border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b-2 border-border px-2 py-1.5">
        {showSource ? (
          <span className="px-1 text-xs font-semibold text-muted-foreground">
            Editing HTML source
          </span>
        ) : (
          <>
            {ACTIONS.map((action, i) =>
              action === "divider" ? (
                <span key={`divider-${i}`} className="mx-0.5 h-5 w-px bg-border" aria-hidden />
              ) : (
                <ToolbarButton key={action.label} action={action} editor={editor} />
              )
            )}
            <LinkButton editor={editor} />
          </>
        )}
        <button
          type="button"
          onClick={() => (showSource ? leaveSource() : setShowSource(true))}
          className="ml-auto rounded-[8px] px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-muted"
        >
          {showSource ? "Done" : "HTML"}
        </button>
      </div>

      {showSource ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={14}
          spellCheck={false}
          className="w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[13px] outline-none"
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
