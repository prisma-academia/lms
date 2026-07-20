import type { MediaKind } from "@/lib/generated/prisma/enums";

export type Named = { id: string; name: string };

export type LibraryTagRef = { id: string; name: string };

export type LibraryItemView = {
  id: string;
  name: string;
  title: string | null;
  description: string | null;
  contentType: string;
  mediaKind: MediaKind;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  folderId: string | null;
  folder: { name: string } | null;
  tags: { tag: LibraryTagRef }[];
  isPublic: boolean;
  isFree: boolean;
  priceCents: number | null;
  currency: string | null;
  thumbUrl: string | null;
  createdAt: string;
  _count?: { grants: number; entitlements: number };
};

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  count: number;
  children: FolderNode[];
};

export type GrantView = {
  id: string;
  subjectType: "ALL_CLIENTS" | "CLIENT" | "CLIENT_GROUP" | "COURSE" | "PROGRAMME";
  label: string;
  canDownload: boolean;
  startsAt: string | null;
  expiresAt: string | null;
};

export type SortKey = "recent" | "name" | "size" | "type";

/** Build the folder forest from a flat list. */
export function buildFolderTree(
  folders: { id: string; name: string; parentId: string | null; count: number }[]
): FolderNode[] {
  const byId = new Map<string, FolderNode>();
  for (const f of folders) byId.set(f.id, { ...f, children: [] });
  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sort(n.children);
  };
  sort(roots);
  return roots;
}
