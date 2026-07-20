/**
 * Folder-closure tests. This function decides who can see what, so an
 * under-grant is merely annoying but an over-grant is a data leak.
 */
import { expandFolderClosure } from "../lib/library/access";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      got ${a}\n      want ${e}`}`);
}

// root
//  ├─ a
//  │   ├─ a1
//  │   │   └─ a1x   (3 levels below root)
//  │   └─ a2
//  └─ b
// orphan (no relation)
const tree = [
  { id: "root", parentId: null },
  { id: "a", parentId: "root" },
  { id: "a1", parentId: "a" },
  { id: "a1x", parentId: "a1" },
  { id: "a2", parentId: "a" },
  { id: "b", parentId: "root" },
  { id: "orphan", parentId: null },
];

const ids = (m: Map<string, boolean>) => [...m.keys()].sort();

check("grant on root reaches every descendant", ids(expandFolderClosure([{ folderId: "root", canDownload: true }], tree)), [
  "a", "a1", "a1x", "a2", "b", "root",
]);

check("grant on a mid node reaches 3 levels down, not siblings", ids(expandFolderClosure([{ folderId: "a", canDownload: true }], tree)), [
  "a", "a1", "a1x", "a2",
]);

check("grant on a leaf reaches only itself", ids(expandFolderClosure([{ folderId: "a1x", canDownload: true }], tree)), ["a1x"]);

check("no grants -> nothing", ids(expandFolderClosure([], tree)), []);

check("grant never walks UP to the parent", ids(expandFolderClosure([{ folderId: "a1", canDownload: true }], tree)), ["a1", "a1x"]);

check("two disjoint grants union", ids(expandFolderClosure([{ folderId: "a2", canDownload: true }, { folderId: "b", canDownload: true }], tree)), [
  "a2", "b",
]);

// canDownload propagation
const dl = expandFolderClosure([{ folderId: "a", canDownload: false }], tree);
check("canDownload=false propagates to descendants", dl.get("a1x"), false);

const mixed = expandFolderClosure(
  [{ folderId: "a", canDownload: false }, { folderId: "a1", canDownload: true }],
  tree
);
check("more permissive grant wins on overlap", mixed.get("a1"), true);
check("...and its subtree", mixed.get("a1x"), true);
check("...without upgrading the restrictive branch", mixed.get("a2"), false);

// A malformed parent cycle must not hang.
const cyclic = [
  { id: "x", parentId: "y" },
  { id: "y", parentId: "x" },
];
check("parent cycle terminates", ids(expandFolderClosure([{ folderId: "x", canDownload: true }], cyclic)), ["x", "y"]);

// A grant on a folder that no longer exists must not throw.
check("dangling seed is harmless", ids(expandFolderClosure([{ folderId: "gone", canDownload: true }], tree)), ["gone"]);

console.log(failed === 0 ? "\nAll closure tests passed." : `\n${failed} test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
