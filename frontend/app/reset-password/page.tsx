"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token") || searchParams.get("reset_token") || "";
    if (token) {
      router.replace(`/login?reset_token=${encodeURIComponent(token)}`, {
        scroll: false,
      });
      return;
    }

    router.replace("/login", { scroll: false });
  }, [router, searchParams]);

  return null;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
