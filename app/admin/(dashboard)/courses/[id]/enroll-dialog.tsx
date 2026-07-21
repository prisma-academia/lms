"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField, SelectInput } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";
import type { ClientOption, CourseEnrollmentRow } from "./course-types";

type EnrollmentPayload = {
  enrollment: {
    id: string;
    clientId: string;
    enrolledAt: string;
    completedAt: string | null;
    progressPercent: number;
  };
};

type EnrollDialogProps = {
  courseId: string;
  clients: ClientOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrolled: (enrollment: CourseEnrollmentRow) => void;
};

export function EnrollDialog({ open, onOpenChange, ...props }: EnrollDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The form mounts fresh on every open (Radix unmounts closed content),
          so its state resets without effects. */}
      {open ? <EnrollForm onOpenChange={onOpenChange} {...props} /> : null}
    </Dialog>
  );
}

function EnrollForm({
  courseId,
  clients,
  onOpenChange,
  onEnrolled,
}: Omit<EnrollDialogProps, "open">) {
  const { toast } = useToast();
  const [clientId, setClientId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = clients.map((c) => ({
    value: c.id,
    label: c.name ? `${c.name} — ${c.email}` : c.email,
  }));

  async function enroll() {
    if (!clientId) {
      setError("Select a learner first.");
      return;
    }
    setError(null);
    setPending(true);
    const res = await apiPost<EnrollmentPayload>("/api/tenant/enrollments", {
      courseId,
      clientId,
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.enrollment) {
      const client = clients.find((c) => c.id === clientId);
      toast("Learner enrolled.");
      onEnrolled({
        id: res.data.enrollment.id,
        clientId,
        clientEmail: client?.email ?? "",
        clientName: client?.name ?? "",
        enrolledAt: res.data.enrollment.enrolledAt,
        completedAt: res.data.enrollment.completedAt,
        progressPercent: res.data.enrollment.progressPercent,
      });
      onOpenChange(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogTitle>Enroll a learner</DialogTitle>
      <DialogDescription>
        Manually enroll a learner into this course. Only published courses accept enrollments.
      </DialogDescription>

      <div className="mt-5 flex flex-col gap-4">
        <FormField label="Learner" htmlFor="enroll-client">
          <SelectInput
            id="enroll-client"
            placeholder="Select a learner…"
            options={options}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </FormField>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={enroll} disabled={pending}>
            {pending ? "Enrolling…" : "Enroll"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
