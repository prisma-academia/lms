"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

/**
 * Opens the browser's print dialog, which is also where "Save as PDF" lives.
 * The certificate page's print styles put the certificate alone on one sheet.
 */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" className="min-h-11 sm:min-h-0" onClick={() => window.print()}>
      <Icon name="download" aria-hidden /> Print or save as PDF
    </Button>
  );
}
