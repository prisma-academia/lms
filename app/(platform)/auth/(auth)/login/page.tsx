import Link from "next/link";
import { LoginForm } from "./form";
import { WorkspaceJumpForm } from "./workspace-jump";
import { Icon } from "@/components/icon";

export default function PlatformLoginPage() {
  return (
    <main className="flex min-h-[100dvh] flex-1 items-center justify-center p-5">
      <div className="w-full max-w-4xl">
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span className="flex size-11 -rotate-3 items-center justify-center rounded-[12px] border-2 border-foreground bg-primary text-primary-foreground shadow-sm">
            <Icon name="cap" className="size-6" />
          </span>
        </div>
        <div className="grid w-full gap-4 md:grid-cols-2">
          <div className="rounded-[14px] border-2 border-border bg-card p-6 shadow-md">
            <h1 className="font-heading text-xl leading-tight">Platform sign in</h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              For platform staff only.
            </p>
            <div className="mt-5">
              <LoginForm />
            </div>
            <p className="mt-4 text-[13px] font-medium text-muted-foreground">
              <Link
                href="/auth/forgot-password"
                className="font-bold underline decoration-primary decoration-2 underline-offset-2 hover:text-foreground"
              >
                Forgot password?
              </Link>
            </p>
          </div>
          <div className="rounded-[14px] border-2 border-border bg-card p-6 shadow-md">
            <h2 className="font-heading text-lg leading-tight">
              Go to your workspace
            </h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Already have an account? Select your workspace.
            </p>
            <div className="mt-4">
              <WorkspaceJumpForm />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
