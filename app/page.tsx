"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/provider/auth-provider";
import { useEffect } from "react";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuth();

  useEffect(() => {
    if (isReady) {
      if (isAuthenticated) {
        router.push("/sell");
      } else {
        router.push("/login");
      }
    }
  }, [isAuthenticated, isReady, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
      </div>
    </div>
  );
}
