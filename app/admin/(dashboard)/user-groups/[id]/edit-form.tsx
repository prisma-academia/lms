"use client";

import { GroupEditor, type GroupCandidate } from "@/components/group-editor";

export function EditUserGroupForm({
  id,
  name,
  description,
  candidates,
  memberIds,
}: {
  id: string;
  name: string;
  description: string | null;
  candidates: GroupCandidate[];
  memberIds: string[];
}) {
  return (
    <GroupEditor
      id={id}
      name={name}
      description={description}
      candidates={candidates}
      memberIds={memberIds}
      apiBase="/api/tenant/user-groups"
      membersField="userIds"
      listHref="/admin/user-groups"
      memberNoun="user"
    />
  );
}
