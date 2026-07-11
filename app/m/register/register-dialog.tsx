"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RegisterWizard } from "./wizard";

type ButtonProps = React.ComponentProps<typeof Button>;

export function RegisterDialog({
  children,
  variant,
  size,
  className,
}: {
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Let&apos;s set up your workspace</DialogTitle>
        <DialogDescription>
          Two quick steps, then a one-time code to verify your email.
        </DialogDescription>
        <div className="mt-6">
          <RegisterWizard />
        </div>
      </DialogContent>
    </Dialog>
  );
}
