"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * The page finder: Ctrl+K (⌘K on a Mac), type a few letters, Enter.
 *
 * With two dozen destinations in the admin, the sidebar is a list to read; this
 * is the way to go somewhere without reading it. It searches exactly the
 * destinations the shell was given — the same ones the person can see in the
 * navigation, already filtered by what their academy has switched on — so it
 * can never offer a page they cannot open.
 *
 * State lives in a provider so a shell can show the button in more than one
 * place (a sidebar and a mobile bar) while there is still one dialog and one
 * keyboard shortcut.
 */

export type FinderItem = {
  href: string;
  label: string;
  /** Heading the result is listed under. */
  group?: string | null;
  icon?: IconName;
  /** Extra words to match on, e.g. "students" for Learners. */
  keywords?: string;
};

type FinderContextValue = { open: () => void };

const FinderContext = createContext<FinderContextValue | null>(null);

const noop = () => () => {};

/** "⌘K" on Apple keyboards, "Ctrl K" elsewhere — known only in the browser. */
function useShortcutLabel(): string {
  const mac = useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => false
  );
  return mac ? "⌘K" : "Ctrl K";
}

export function PageFinderProvider({ items, children }: { items: FinderItem[]; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      setIsOpen((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <FinderContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          showClose={false}
          // Near the top rather than centred: the list below the field grows
          // and shrinks as you type, and a centred box would jump with it.
          className="top-[10vh] max-h-[80vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        >
          <FinderBody items={items} onDone={() => setIsOpen(false)} />
        </DialogContent>
      </Dialog>
    </FinderContext.Provider>
  );
}

/**
 * Opens the finder. Outside a provider it renders nothing, so a shared piece of
 * chrome can include it without knowing whether its shell has a finder.
 */
export function PageFinderButton({
  className,
  label = "Find a page…",
  compact = false,
}: {
  className?: string;
  label?: string;
  /** Icon only — for a bar with no room for the words. */
  compact?: boolean;
}) {
  const finder = useContext(FinderContext);
  const shortcut = useShortcutLabel();
  if (!finder) return null;

  return (
    <button
      type="button"
      onClick={finder.open}
      aria-label={compact ? "Find a page" : undefined}
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        "flex items-center gap-2 rounded-[10px] border-2 border-border bg-card text-sm font-medium text-muted-foreground shadow-sm outline-none [touch-action:manipulation] transition-[transform,box-shadow]",
        "hover:-translate-x-px hover:-translate-y-px hover:text-foreground hover:shadow-md active:translate-x-px active:translate-y-px active:shadow-none",
        "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
        compact ? "size-11 justify-center" : "h-10 px-3",
        className
      )}
    >
      <Icon name="search" className="size-4 shrink-0" />
      {compact ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <kbd
            translate="no"
            className="num hidden shrink-0 rounded-[6px] border-2 border-border bg-background px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground sm:inline"
          >
            {shortcut}
          </kbd>
        </>
      )}
    </button>
  );
}

function matches(item: FinderItem, words: string[]): boolean {
  const haystack = `${item.label} ${item.group ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function FinderBody({ items, onDone }: { items: FinderItem[]; onDone: () => void }) {
  const router = useRouter();
  const uid = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return items;
    const found = items.filter((item) => matches(item, words));
    // A name that starts with what was typed beats one that merely contains it.
    const first = words[0];
    return [
      ...found.filter((item) => item.label.toLowerCase().startsWith(first)),
      ...found.filter((item) => !item.label.toLowerCase().startsWith(first)),
    ];
  }, [items, query]);

  // Keep the highlight on a real row as the list shrinks under it.
  const active = Math.min(activeIndex, Math.max(0, results.length - 1));
  const optionId = (index: number) => `${uid}-option-${index}`;

  function move(to: number) {
    if (results.length === 0) return;
    const next = (to + results.length) % results.length;
    setActiveIndex(next);
    // The highlighted row follows the keyboard into view.
    listRef.current?.querySelector(`#${CSS.escape(optionId(next))}`)?.scrollIntoView({ block: "nearest" });
  }

  function go(item: FinderItem | undefined) {
    if (!item) return;
    onDone();
    router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(active - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(0);
    } else if (event.key === "End") {
      event.preventDefault();
      move(results.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    }
  }

  const grouped = query.trim() === "";

  return (
    <>
      <DialogTitle className="sr-only">Find a page</DialogTitle>
      <DialogDescription className="sr-only">
        Type to filter. Use the up and down arrow keys to move, Enter to open, Escape to close.
      </DialogDescription>

      <div className="flex items-center gap-3 border-b-2 border-border px-4">
        <Icon name="search" className="size-[18px] shrink-0 text-muted-foreground" />
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-label="Find a page"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Find a page…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          // The field is the dialog: the frame around it is the focus indicator.
          className="h-14 min-w-0 flex-1 bg-transparent text-[16px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />
        <kbd
          translate="no"
          className="hidden shrink-0 rounded-[6px] border-2 border-border bg-background px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground sm:inline"
        >
          Esc
        </kbd>
      </div>

      <div
        ref={listRef}
        id={`${uid}-list`}
        role="listbox"
        aria-label="Pages"
        className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain p-2"
      >
        {results.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm font-medium text-muted-foreground">
            No page matches “{query.trim()}”. Try a shorter word.
          </p>
        ) : (
          results.map((item, index) => {
            const showHeading =
              grouped && Boolean(item.group) && item.group !== results[index - 1]?.group;
            const selected = index === active;
            return (
              <div key={`${item.href}-${item.label}`} role="presentation">
                {showHeading ? (
                  <p
                    role="presentation"
                    className="px-3 pb-1 pt-3 text-[12px] font-bold text-muted-foreground"
                  >
                    {item.group}
                  </p>
                ) : null}
                <Link
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  // Focus stays in the field; the list is driven from there.
                  tabIndex={-1}
                  href={item.href}
                  onClick={onDone}
                  onMouseMove={() => {
                    if (!selected) setActiveIndex(index);
                  }}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-[10px] border-2 px-3 py-2 text-sm font-bold outline-none [touch-action:manipulation]",
                    selected
                      ? "border-border bg-primary text-primary-foreground"
                      : "border-transparent text-card-foreground"
                  )}
                >
                  <Icon name={item.icon ?? "arrow-right"} className="size-[18px] shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {!grouped && item.group ? (
                    <span
                      className={cn(
                        "shrink-0 text-[12px] font-medium",
                        selected ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}
                    >
                      {item.group}
                    </span>
                  ) : null}
                </Link>
              </div>
            );
          })
        )}
      </div>

      {/* Said once when the list changes, not for every arrow key. */}
      <p aria-live="polite" className="sr-only">
        {results.length === 1 ? "1 page" : `${results.length} pages`}
      </p>
    </>
  );
}
