"use client";

interface Props {
  open: boolean;
  onContinue: () => void;
}

export default function PasswordChangedNoticeModal({ open, onContinue }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-[24px] border border-white/10 bg-[#15151a] p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-emerald-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-white">
          Password changed
        </h2>
        <p className="mt-2 text-sm leading-7 text-white/65">
          Your password has been successfully changed. You&apos;ve been signed out for
          security. Please log in again to continue.
        </p>

        <div className="mt-6">
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/90"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
