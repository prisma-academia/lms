import { Icon } from "@/components/icon";

/** Shown when an exam requires Safe Exam Browser and this request is not from it. */
export function SebGate({ examId, title, reason, inSeb }: { examId: string; title: string; reason: string; inSeb: boolean }) {
  const config = `/api/exam/${examId}/seb`;
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="w-full max-w-xl rounded-[18px] border-2 border-border bg-card p-6 shadow-[6px_6px_0_0_var(--border)]">
        <div className="mb-4 grid size-14 place-items-center rounded-full border-2 border-border bg-primary text-primary-foreground">
          <Icon name="lock" className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-black">{title} needs Safe Exam Browser</h1>
        {reason === "no_keys" ? (
          <p className="mt-2 text-[15px] font-medium text-muted-foreground">
            This exam is set to require Safe Exam Browser, but it has not been finished setting up. Please tell the invigilator.
          </p>
        ) : inSeb ? (
          <p className="mt-2 text-[15px] font-medium text-muted-foreground">
            You are in Safe Exam Browser, but with different settings from the ones this exam needs. Quit it and open the exam with the button below.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[15px] font-medium text-muted-foreground">
              This exam locks your computer while you sit it: you cannot switch apps, browse other sites or leave until you submit.
            </p>
            <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-sm font-medium">
              <li>
                Install Safe Exam Browser (free) from{" "}
                <a className="font-bold underline" href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noreferrer">
                  safeexambrowser.org
                </a>{" "}
                — Windows, macOS or iPad.
              </li>
              <li>Click “Open in Safe Exam Browser” below (or download the exam file and open it).</li>
              <li>Sign in again inside Safe Exam Browser with your Exam ID and PIN.</li>
            </ol>
          </>
        )}
        {reason !== "no_keys" ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              id="seb-launch"
              href={config}
              data-seb-config={config}
              className="inline-flex min-h-12 items-center rounded-[10px] border-2 border-border bg-primary px-5 font-black text-primary-foreground"
            >
              Open in Safe Exam Browser
            </a>
            <a href={config} download className="inline-flex min-h-12 items-center rounded-[10px] border-2 border-border bg-card px-5 font-black">
              Download exam file (.seb)
            </a>
          </div>
        ) : null}
        <script
          // Turn the launch link into sebs:// with this page's own host, so SEB opens directly.
          dangerouslySetInnerHTML={{
            __html: `(function(){var a=document.getElementById('seb-launch');if(!a)return;var u=new URL(a.getAttribute('data-seb-config'),location.href);a.href=(u.protocol==='https:'?'sebs://':'seb://')+u.host+u.pathname;})();`,
          }}
        />
      </div>
    </div>
  );
}
