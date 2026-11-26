"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { sampleContext } from "@/lib/site/variables";
import type { VariableContext } from "@/lib/site/template";
import type { SitePageKind } from "@/lib/site/site-api";

/**
 * The values a site editor's live preview fills variables with.
 *
 * The academy's own data where there is any (its name, its courses), and
 * sample values where there cannot be: the person editing is staff, so there is
 * no learner to show, and a course-page design has no particular course.
 * `sampled` names the parts that are stand-ins so the editor can say so.
 *
 * Fetched once per page kind. If the request fails the whole context falls
 * back to samples: a preview with placeholder data beats a blank one.
 */
export function useSitePreviewContext(kind: SitePageKind): {
  context: VariableContext | null;
  sampled: string[];
} {
  const [state, setState] = useState<{ context: VariableContext | null; sampled: string[] }>({
    context: null,
    sampled: [],
  });

  useEffect(() => {
    let cancelled = false;
    apiGet<{ context: VariableContext; sampled?: string[] }>(
      `/api/tenant/site/preview-context?kind=${encodeURIComponent(kind)}`
    ).then((res) => {
      if (cancelled) return;
      setState(
        res.data?.context
          ? { context: res.data.context, sampled: res.data.sampled ?? [] }
          : {
              context: sampleContext() as VariableContext,
              sampled: ["tenant", "courses", "programmes", "user", "progress", "course", "programme"],
            }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  return state;
}
