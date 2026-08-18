"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { html } from "@codemirror/lang-html";
import { cn } from "@/lib/utils";

/**
 * A CodeMirror 6 editor, kept generic so anything in the app that needs code
 * input can use it.
 *
 * Controlled from the outside, but NOT re-created on every keystroke: CodeMirror
 * owns its own document, and tearing the view down to apply each character would
 * lose the cursor, the undo history and the open completion popup. `value` is
 * therefore only pushed into the view when it differs from what the view already
 * holds — which is what makes an external change (applying a template, inserting
 * a snippet) work without fighting the person typing.
 *
 * Import this through `next/dynamic({ ssr: false })`. CodeMirror needs a real
 * DOM at construction time, and there is no reason for ~200KB of editor to enter
 * a server bundle.
 */

export type CodeEditorHandle = {
  /** Replace the current selection, then focus. Used by snippet insertion. */
  insert: (text: string) => void;
  focus: () => void;
};

export function CodeEditor({
  value,
  onChange,
  onSave,
  extraCompletion,
  readOnly = false,
  className,
  height = "24rem",
  ref,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Wired to Mod-s. Return true to swallow the browser's Save dialog. */
  onSave?: () => void;
  /** Extra completion sources, e.g. the site builder's `{{ }}` variables. */
  extraCompletion?: Extension;
  readOnly?: boolean;
  className?: string;
  height?: string;
  ref?: Ref<CodeEditorHandle>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Held in a ref so the extensions built once below always call the newest
  // handler without the view having to be rebuilt when a prop identity changes.
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  });

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      const v = view.current;
      if (!v) return;
      v.dispatch(v.state.replaceSelection(text));
      v.focus();
    },
    focus() {
      view.current?.focus();
    },
  }));

  useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        foldGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        html({ autoCloseTags: true }),
        autocompletion({ activateOnTyping: true, closeOnBlur: false }),
        ...(extraCompletion ? [extraCompletion] : []),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSaveRef.current?.();
              return true;
            },
          },
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": {
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
            lineHeight: "1.6",
          },
          "&.cm-focused": { outline: "none" },
          ".cm-gutters": { border: "none", background: "transparent", opacity: "0.6" },
        }),
      ],
    });

    const instance = new EditorView({ state, parent: host.current });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // Built once. `value` is synced by the effect below instead — see the note
    // in the component docblock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, extraCompletion]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current === value) return;
    v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={host}
      style={{ height }}
      className={cn(
        "overflow-hidden rounded-[14px] border-2 border-border bg-card",
        className
      )}
    />
  );
}
