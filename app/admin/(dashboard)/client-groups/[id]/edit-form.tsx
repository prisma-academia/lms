"use client";

import { GroupEditor, type GroupCandidate } from "@/components/group-editor";

export function EditClientGroupForm({
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
      apiBase="/api/tenant/client-groups"
      membersField="clientIds"
      listHref="/admin/client-groups"
      memberNoun="client"
    />
  );
}
