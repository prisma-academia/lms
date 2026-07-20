"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { FolderNode } from "./types";

/**
 * Folder tree with proper tree semantics.
 *
 * role="tree" + roving tabindex rather than a list of buttons: a nested
 * structure announced as a flat list gives no depth or expansion state, and
 * arrow-key navigation is what makes a deep tree usable without a mouse.
 */

type Special = "all" | "none";
export type FolderSelection = string | Special;

export function FolderTree({
  nodes,
  selected,
  onSelect,
  totalCount,
  unfiledCount,
  onDropItems,
}: {
  nodes: FolderNode[];
  selected: FolderSelection;
  onSelect: (id: FolderSelection) => void;
  totalCount: number;
  unfiledCount: number;
  onDropItems?: (folderId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState<FolderSelection>(selected);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Depth-first list of currently visible rows, for arrow-key movement. */
  const visible: { id: FolderSelection; level: number; node?: FolderNode }[] = [
    { id: "all", level: 0 },
    { id: "none", level: 0 },
  ];
  const walk = (list: FolderNode[], level: number) => {
    for (const n of list) {
      visible.push({ id: n.id, level, node: n });
      if (expanded.has(n.id)) walk(n.children, level + 1);
    }
  };
  walk(nodes, 0);

  function onKeyDown(e: React.KeyboardEvent) {
    const i = visible.findIndex((v) => v.id === focused);
    if (i === -1) return;
    const current = visible[i];
    const move = (to: number) => {
      const next = visible[Math.max(0, Math.min(visible.length - 1, to))];
      setFocused(next.id);
      const el = treeRef.current?.querySelector<HTMLElement>(`[data-node="${next.id}"]`);
      el?.focus();
    };
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(i - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (current.node && current.node.children.length > 0 && !expanded.has(current.node.id)) {
          toggle(current.node.id);
        } else {
          move(i + 1);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (current.node && expanded.has(current.node.id)) toggle(current.node.id);
        else move(i - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(visible.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onSelect(current.id);
        break;
    }
  }

  const rowClass = (active: boolean, isDrop: boolean) =>
    cn(
      "flex w-full items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-left text-sm font-medium outline-none",
      "focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-ring",
      active ? "bg-primary text-primary-foreground font-bold" : "hover:bg-accent hover:text-accent-foreground",
      isDrop && "ring-2 ring-primary"
    );

  function renderNode(node: FolderNode, level: number) {
    const active = selected === node.id;
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    return (
      <li key={node.id} role="none">
        <div
          role="treeitem"
          aria-selected={active}
          aria-expanded={hasChildren ? isOpen : undefined}
          aria-level={level + 1}
          data-node={node.id}
          tabIndex={focused === node.id ? 0 : -1}
          onFocus={() => setFocused(node.id)}
          onClick={() => onSelect(node.id)}
          onDragOver={(e) => {
            if (!onDropItems) return;
            e.preventDefault();
            setDropTarget(node.id);
          }}
          onDragLeave={() => setDropTarget((t) => (t === node.id ? null : t))}
          onDrop={(e) => {
            if (!onDropItems) return;
            e.preventDefault();
            setDropTarget(null);
            onDropItems(node.id);
          }}
          className={rowClass(active, dropTarget === node.id)}
          style={{ paddingLeft: `${8 + level * 14}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(node.id);
              }}
              className="-ml-1 flex size-4 shrink-0 items-center justify-center"
            >
              <Icon name={isOpen ? "chevron-down" : "chevron-right"} className="size-3.5" />
            </button>
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <Icon name={isOpen ? "folder-open" : "folder"} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="num text-xs opacity-70">{node.count}</span>
        </div>
        {hasChildren && isOpen ? (
          <ul role="group" className="flex flex-col">
            {node.children.map((c) => renderNode(c, level + 1))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <div ref={treeRef} onKeyDown={onKeyDown}>
      <ul role="tree" aria-label="Folders" className="flex flex-col gap-0.5">
        <li role="none">
          <div
            role="treeitem"
            aria-selected={selected === "all"}
            aria-level={1}
            data-node="all"
            tabIndex={focused === "all" ? 0 : -1}
            onFocus={() => setFocused("all")}
            onClick={() => onSelect("all")}
            className={rowClass(selected === "all", false)}
          >
            <span className="size-4 shrink-0" />
            <Icon name="layers" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">All files</span>
            <span className="num text-xs opacity-70">{totalCount}</span>
          </div>
        </li>
        <li role="none">
          <div
            role="treeitem"
            aria-selected={selected === "none"}
            aria-level={1}
            data-node="none"
            tabIndex={focused === "none" ? 0 : -1}
            onFocus={() => setFocused("none")}
            onClick={() => onSelect("none")}
            onDragOver={(e) => {
              if (!onDropItems) return;
              e.preventDefault();
              setDropTarget("none");
            }}
            onDragLeave={() => setDropTarget((t) => (t === "none" ? null : t))}
            onDrop={(e) => {
              if (!onDropItems) return;
              e.preventDefault();
              setDropTarget(null);
              onDropItems(null);
            }}
            className={rowClass(selected === "none", dropTarget === "none")}
          >
            <span className="size-4 shrink-0" />
            <Icon name="file" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Unfiled</span>
            <span className="num text-xs opacity-70">{unfiledCount}</span>
          </div>
        </li>
        {nodes.map((n) => renderNode(n, 0))}
      </ul>
    </div>
  );
}
