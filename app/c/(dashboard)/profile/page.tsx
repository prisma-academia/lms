import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { clientProfileIncomplete } from "@/lib/auth/client-profile";
import { PageHeader, Card } from "@/components/shell";
import { ClientProfileForm } from "./profile-form";

export default async function ClientProfilePage() {
  const actor = await requireClientPage();
  const client = await prisma.client.findUnique({ where: { id: actor.clientId } });
  if (!client) redirect("/auth/login");

  const profile = (client.profileJson as Record<string, unknown>) ?? {};
  const displayName = typeof profile.name === "string" ? profile.name : "";
  const incomplete = clientProfileIncomplete(client.profileJson);

  return (
    <div className="max-w-2xl">
      <PageHeader title={incomplete ? "Complete your profile" : "Profile"} />
      <Card>
        {incomplete ? (
          <p className="mb-4 text-sm font-medium text-ink/60">
            Add a display name so we know how to address you. You can update the rest of your profile
            anytime.
          </p>
        ) : (
          <p className="mb-4 text-sm font-medium text-ink/60">
            Update your display name and contact details.
          </p>
        )}
        <ClientProfileForm
          initialDisplayName={displayName}
          initialFirstName={client.firstName ?? ""}
          initialLastName={client.lastName ?? ""}
          initialPhone={client.phone ?? ""}
        />
      </Card>
    </div>
  );
}
