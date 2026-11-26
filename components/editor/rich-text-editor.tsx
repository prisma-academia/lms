"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, Extension, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { cn } from "@/lib/utils";
import { LESSON_BLOCKS, type LessonBlockGroup } from "@/lib/content/lesson-blocks";
import {
  BlockClasses,
  DesignedBlock,
  LessonContainer,
  visualEditorLosses,
} from "@/components/editor/lesson-nodes";

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
 *
 * Designed lessons: a lesson from the AI builder is more than prose — callouts,
 * cards, a chart, a diagram. `lesson-nodes.ts` teaches this editor to keep
 * those, and the guard below refuses to open a lesson visually when doing so
 * would still drop something, opening its HTML instead and saying why. An
 * editor that quietly simplifies what it was given is worse than no editor.
 */

/**
 * Keep a heading's `id` through a round trip in the visual editor.
 *
 * Quiz questions link to lesson headings by id ("read up on this"). Without
 * this the editor has no attribute to hold an id in, so opening a lesson and
 * saving it would silently strip every anchor and break those links.
 *
 * `keepOnSplit: false`: pressing Enter in the middle of a heading makes two
 * headings, and they must not share one id — the new half gets its own when the
 * lesson is saved.
 */
const HeadingAnchors = Extension.create({
  name: "headingAnchors",
  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          id: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute("id"),
            renderHTML: (attributes) => (attributes.id ? { id: attributes.id as string } : {}),
          },
        },
      },
    ];
  },
});

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    // The one h1 on the page belongs to the lesson title, not its body.
    heading: { levels: [2, 3, 4] },
    // The kit bundles its own Link; ours is configured below, and two
    // extensions under one name is a conflict the editor warns about.
    link: false,
  }),
  HeadingAnchors,
  LessonContainer,
  BlockClasses,
  DesignedBlock,
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

/**
 * Add or remove a link.
 *
 * The address is asked for in a small row of the toolbar itself rather than in
 * the browser's `prompt()`: that dialog cannot be styled, cannot explain why
 * an address was refused, and is suppressed altogether in some embedded
 * browsers. A row in the toolbar also avoids a second focus trap inside the
 * lesson dialog this editor usually lives in.
 */
function LinkButton({ editor }: { editor: Editor }) {
  const active = editor.isActive("link");
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function apply() {
    const value = href.trim();
    if (!value) return setProblem("Enter the address to link to.");
    // http(s) and mailto only: the sanitizer would drop anything else on the
    // way to a learner, and it is kinder to say so here.
    if (!/^https?:\/\//i.test(value) && !/^mailto:/i.test(value)) {
      return setProblem("A link must start with https:// or mailto:.");
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
    setOpen(false);
    setHref("");
    setProblem(null);
  }

  return (
    <>
      <button
        type="button"
        title={active ? "Remove link" : "Add link"}
        aria-label={active ? "Remove link" : "Add link"}
        aria-pressed={active}
        aria-expanded={active ? undefined : open}
        onClick={() => {
          if (active) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          setProblem(null);
          setOpen((was) => !was);
        }}
        className={cn(
          BUTTON_CLASS,
          "underline",
          active || open ? "border-border bg-muted" : "border-transparent hover:bg-muted"
        )}
      >
        link
      </button>
      {open && !active ? (
        // basis-full: the row drops under the buttons instead of squeezing in beside them.
        <div className="flex basis-full flex-wrap items-center gap-2 border-t-2 border-dashed border-border pt-2">
          <label htmlFor="editor-link-url" className="text-xs font-bold text-muted-foreground">
            Link to
          </label>
          <input
            id="editor-link-url"
            type="url"
            inputMode="url"
            // Opened by the author pressing "link": focus belongs in the field it revealed.
            autoFocus
            value={href}
            placeholder="https://…"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? "editor-link-problem" : undefined}
            onChange={(e) => {
              setHref(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Inside the lesson form: Enter must add the link, not save the lesson.
                e.preventDefault();
                apply();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
              }
            }}
            className="h-8 min-w-0 flex-1 basis-48 rounded-[8px] border-2 border-border bg-card px-2 text-[13px] font-medium outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
          <button
            type="button"
            onClick={apply}
            className="h-8 rounded-[8px] border-2 border-border bg-primary px-2.5 text-xs font-bold text-primary-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            Add link
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-8 rounded-[8px] px-2 text-xs font-bold text-muted-foreground outline-none hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            Cancel
          </button>
          {problem ? (
            <p id="editor-link-problem" role="alert" className="basis-full text-xs font-bold text-destructive">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Blocks whose contents can be typed into directly; the rest are edited as HTML. */
const VISUALLY_EDITABLE = new Set([
  "lesson-objectives",
  "lesson-lead",
  "lesson-keypoints",
  "lesson-callout",
  "lesson-steps",
  "lesson-timeline",
  "lesson-cards",
]);

const BLOCK_GROUPS: { group: LessonBlockGroup; label: string }[] = [
  { group: "structure", label: "Structure" },
  { group: "emphasis", label: "Emphasis" },
  { group: "data", label: "Numbers and comparisons" },
  { group: "media", label: "Diagrams" },
];

/**
 * "Insert block": the lesson design vocabulary, one choice away. A native
 * select on purpose — it is keyboard- and screen-reader-complete for free, and
 * it works inside the lesson dialog without a second layer of focus trapping.
 */
function InsertBlock({ onInsert, disabled }: { onInsert: (markup: string) => void; disabled: boolean }) {
  return (
    <select
      aria-label="Insert a designed block"
      value=""
      disabled={disabled}
      onChange={(e) => {
        const block = LESSON_BLOCKS.find((b) => b.className === e.target.value);
        if (block) onInsert(block.starter ?? block.example);
      }}
      className="h-8 max-w-[11rem] rounded-[8px] border-2 border-border bg-card px-1.5 text-[13px] font-bold text-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50"
    >
      <option value="">Insert block…</option>
      {BLOCK_GROUPS.map(({ group, label }) => (
        <optgroup key={group} label={label}>
          {LESSON_BLOCKS.filter((b) => b.group === group).map((b) => (
            <option key={b.className} value={b.className}>
              {b.label}
              {VISUALLY_EDITABLE.has(b.className) ? "" : " (edit as HTML)"}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function sentenceList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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
  /** What the visual editor would drop from the current lesson. Empty = safe. */
  const [losses, setLosses] = useState<string[]>([]);
  /** The exact content the author chose to open visually despite a warning. */
  const [acceptedFor, setAcceptedFor] = useState<string | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);

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
  //
  // Before adopting, check what the visual editor would do to it. If it would
  // drop anything, the lesson opens as HTML instead and the author is told
  // what and why — their content is never rewritten just by being looked at.
  useEffect(() => {
    if (!editor || showSource) return;
    if (value === editor.getHTML()) return;
    if (acceptedFor !== value) {
      const lost = visualEditorLosses(value, EDITOR_EXTENSIONS);
      if (lost.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to content that arrived from outside (AI, import, lesson switch)
        setLosses(lost);
        setShowSource(true);
        return;
      }
    }
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value, showSource, acceptedFor]);

  /** Leave the HTML view. `force` is the author choosing to accept a warned loss. */
  const openVisual = useCallback(
    (force: boolean) => {
      const lost = visualEditorLosses(value, EDITOR_EXTENSIONS);
      if (lost.length > 0 && !force) {
        setLosses(lost);
        return;
      }
      setLosses([]);
      setAcceptedFor(lost.length > 0 ? value : null);
      setShowSource(false);
      editor?.commands.setContent(value, { emitUpdate: false });
    },
    [editor, value]
  );

  const insertBlock = useCallback(
    (markup: string) => {
      if (!showSource) {
        editor?.chain().focus().insertContent(markup).run();
        return;
      }
      // HTML view: at the cursor, on its own lines.
      const field = sourceRef.current;
      const start = field?.selectionStart ?? value.length;
      const end = field?.selectionEnd ?? value.length;
      const before = value.slice(0, start);
      const after = value.slice(end);
      const inserted = `${before && !before.endsWith("\n") ? "\n" : ""}${markup}${after.startsWith("\n") ? "" : "\n"}`;
      onChange(before + inserted + after);
      window.requestAnimationFrame(() => {
        if (!field) return;
        field.focus();
        const caret = before.length + inserted.length;
        field.setSelectionRange(caret, caret);
      });
    },
    [editor, onChange, showSource, value]
  );

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
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <InsertBlock onInsert={insertBlock} disabled={disabled} />
        <button
          type="button"
          onClick={() => {
            if (showSource) openVisual(false);
            else {
              setLosses([]);
              setShowSource(true);
            }
          }}
          aria-pressed={showSource}
          className="ml-auto rounded-[8px] px-2 py-1 text-xs font-bold text-muted-foreground outline-none hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          {showSource ? "Visual editor" : "HTML"}
        </button>
      </div>

      {showSource && losses.length > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 border-border bg-warning/15 px-3 py-2 text-[13px] font-medium text-foreground"
        >
          <p className="min-w-0 flex-1 basis-64">
            This lesson is open as HTML because the visual editor would drop{" "}
            <span className="font-bold">{sentenceList(losses)}</span>. Everything is kept while you
            edit it here.
          </p>
          <button
            type="button"
            onClick={() => openVisual(true)}
            className="shrink-0 rounded-[8px] border-2 border-border bg-card px-2.5 py-1 text-xs font-bold outline-none hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            Use the visual editor anyway
          </button>
        </div>
      ) : null}

      {showSource ? (
        <textarea
          ref={sourceRef}
          aria-label="Lesson HTML"
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
