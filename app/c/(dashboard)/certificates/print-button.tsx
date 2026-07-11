"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Icon name="upload" /> Download / print
    </Button>
  );
}
