import { RegisterWizard } from "./wizard";

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-lg font-semibold">Let&apos;s set up your workspace</h1>
        <p className="mt-1 text-sm text-stone-600">
          Two quick steps, then a one-time code to verify your email.
        </p>
        <div className="mt-6">
          <RegisterWizard />
        </div>
      </div>
    </main>
  );
}
