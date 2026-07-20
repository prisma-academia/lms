import {
  THEME_MODE_COOKIE,
  THEME_RESOLVED_COOKIE,
  THEME_MODE_MAX_AGE,
} from "@/lib/theme/cookie";

/**
 * Parser-blocking script that corrects `system` colour mode before first paint.
 *
 * Only the `system` branch needs this — explicit light/dark are rendered
 * server-side from the cookie with no script and no flash. On a first-ever
 * visit the server cannot know what `prefers-color-scheme` will report, so it
 * renders light and this corrects it synchronously, then records the result in
 * `mt-theme-resolved` so subsequent requests render correctly server-side.
 *
 * A CSS-only `@media (prefers-color-scheme: dark)` approach cannot work here:
 * the dark variant is class-based (`@custom-variant dark (&:is(.dark *))`), so
 * every `dark:` utility keys off the `.dark` class rather than the media query.
 */
export function ThemeScript() {
  const js = `(function(){try{
var m=document.cookie.match(/(?:^|; )${THEME_MODE_COOKIE}=([^;]*)/);
var mode=m?decodeURIComponent(m[1]):'system';
if(mode!=='system')return;
var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
var el=document.documentElement;
if(dark)el.classList.add('dark');else el.classList.remove('dark');
document.cookie='${THEME_RESOLVED_COOKIE}='+(dark?'dark':'light')+';Path=/;Max-Age=${THEME_MODE_MAX_AGE};SameSite=Lax'+(location.protocol==='https:'?';Secure':'');
}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
