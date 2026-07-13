import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { productDescription } from "@/lib/site/metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: env.PRODUCT_NAME,
    short_name: env.PRODUCT_NAME,
    description: productDescription(),
    start_url: "/",
    display: "standalone",
    background_color: "#faf1e4",
    theme_color: "#faf1e4",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
