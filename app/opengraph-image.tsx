import { ImageResponse } from "next/og";
import { env } from "@/lib/env";
import { BRAND, BrandMark } from "@/lib/site/brand-mark";
import { PRODUCT_TAGLINE } from "@/lib/site/metadata";

export const alt = env.PRODUCT_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: BRAND.paper,
          color: BRAND.ink,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <BrandMark size={120} />
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            {env.PRODUCT_NAME}
          </div>
        </div>
        <div
          style={{
            maxWidth: 920,
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.35,
            color: "rgba(25, 20, 32, 0.78)",
          }}
        >
          {PRODUCT_TAGLINE}
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            padding: "14px 28px",
            borderRadius: 14,
            border: `4px solid ${BRAND.ink}`,
            background: BRAND.yellow,
            fontSize: 24,
            fontWeight: 800,
            boxShadow: `8px 8px 0 ${BRAND.ink}`,
          }}
        >
          Learning platform for organizations
        </div>
      </div>
    ),
    { ...size }
  );
}
