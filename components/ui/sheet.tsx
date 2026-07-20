"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/icon";

/**
 * Side sheet (drawer). Built on Radix Dialog so focus trap, Esc, scroll lock
 * and the aria wiring come for free — a hand-rolled drawer gets those wrong.
 *
 * On small screens the `right` sheet becomes a bottom sheet: a 480px-wide
 * panel on a phone is a full-screen modal that merely looks like a drawer.
 */

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        /* bg-black/50, not bg-foreground/50 — see dialog.tsx. */
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "right" | "left" | "bottom";
  showClose?: boolean;
}) {
  const sideClasses =
    side === "bottom"
      ? "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-[14px] border-t-2 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom"
      : side === "left"
        ? "inset-y-0 left-0 h-full w-full max-w-md border-r-2 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left"
        : // right: full-height panel on >=sm, bottom sheet on phones.
          "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-[14px] border-t-2 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-t-none sm:border-t-0 sm:border-l-2 sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-right";

  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col overflow-y-auto border-border bg-card shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          sideClasses,
          className
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-[8px] border-2 border-border bg-background text-foreground shadow-sm transition-transform hover:-translate-x-px hover:-translate-y-px hover:shadow-md active:translate-x-px active:translate-y-px active:shadow-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon name="x" className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("shrink-0 border-b-2 border-border px-5 py-4 pr-14", className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-body" className={cn("flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("safe-b shrink-0 border-t-2 border-border px-5 py-3", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-lg leading-tight", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("mt-1 text-sm font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
