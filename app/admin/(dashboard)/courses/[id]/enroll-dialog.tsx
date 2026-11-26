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
      setError("Choose a learner to enroll.");
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
        // The page is refreshed straight after, which brings the real,
        // server-formatted time; this is what the row says until then.
        enrolledLabel: "Just now",
        completedLabel: null,
        progressPercent: res.data.enrollment.progressPercent,
      });
      onOpenChange(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogTitle>Enroll a learner</DialogTitle>
      <DialogDescription>
        Gives the learner access to this course straight away, whether or not it is paid. The
        course must be published first.
      </DialogDescription>

      <div className="mt-5 flex flex-col gap-4">
        <FormField
          label="Learner"
          htmlFor="enroll-client"
          hint={options.length === 0 ? "There are no learners yet. Add one under Learners first." : undefined}
        >
          <SelectInput
            id="enroll-client"
            placeholder="Choose a learner…"
            options={options}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </FormField>

        {error ? (
          <p role="alert" className="text-sm font-bold text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={enroll} disabled={pending}>
            {pending ? "Enrolling…" : "Enroll learner"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
