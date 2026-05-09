"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Coffee, ShieldCheck, TimerReset, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuth();
  const [url, setUrl] = useState("https://coffee.local");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!url.trim()) {
      setError("URL is required");
      return;
    }

    if (!username.trim()) {
      setError("Username is required");
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    const success = await login(url, username, password);
    if (success) {
      toast.success("Login successful!");
      router.push("/sell");
    } else {
      setError("Invalid credentials");
      toast.error("Invalid URL, username, or password");
    }
  };

  return (
    <div className="h-dvh overflow-hidden bg-slate-950">
      <div className="mx-auto grid h-full w-full max-w-7xl grid-cols-1 gap-3 p-3 md:grid-cols-2 md:gap-4 md:p-4 lg:p-6">
        {/* Left: Sign in form */}
        <section className="flex h-full min-h-0 items-center justify-center rounded-3xl bg-white px-5 py-6 shadow-2xl sm:px-8">
          <div className="w-full max-w-md space-y-5">
            <div className="text-center">
              <div className="mx-auto mb-3 inline-flex size-14 items-center justify-center rounded-full bg-blue-600">
                <Coffee className="size-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                Coffee Corner
              </h1>
              <p className="mt-1 text-sm text-slate-600">Cashier sign in</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  URL
                </label>
                <Input
                  type="url"
                  placeholder="https://coffee.local"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError("");
                  }}
                  disabled={isLoading}
                  className="h-11 w-full"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Username
                </label>
                <Input
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError("");
                  }}
                  disabled={isLoading}
                  className="h-11 w-full"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  disabled={isLoading}
                  className="h-11 w-full"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={
                  !url.trim() || !username.trim() || !password || isLoading
                }
                className="h-11 w-full text-base font-semibold bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="mb-2 text-sm font-semibold text-slate-900">
                Demo Credentials
              </p>
              <p>URL: https://coffee.local</p>
              <p>Sarah: sarah / password123</p>
              <p>Mike: mike / password123</p>
              <p>Lisa: lisa / password123</p>
            </div>
          </div>
        </section>

        {/* Right: Image + message panel */}
        <section className="relative hidden h-full min-h-0 overflow-hidden rounded-3xl md:block">
          <Image
            src="/placeholder.jpg"
            alt="Coffee bar workspace"
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-slate-900/45 to-blue-900/70" />
          <div className="absolute inset-0 flex h-full flex-col justify-between p-6 text-white lg:p-8">
            <div>
              <p className="text-sm font-medium text-blue-100">
                Point of Sale System
              </p>
              <h2 className="mt-2 text-3xl font-bold leading-tight lg:text-4xl">
                Keep every shift fast, clear, and in control.
              </h2>
              <p className="mt-3 max-w-md text-sm text-slate-100/95 lg:text-base">
                Sign in and start selling with live totals, drafts, and daily
                history in one smooth flow.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="flex items-start gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-100" />
                <p className="text-sm text-slate-50">
                  Secure role-based access for each cashier session.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
                <TimerReset className="mt-0.5 size-4 shrink-0 text-blue-100" />
                <p className="text-sm text-slate-50">
                  Resume saved drafts instantly during busy hours.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
                <TrendingUp className="mt-0.5 size-4 shrink-0 text-blue-100" />
                <p className="text-sm text-slate-50">
                  Track sales, taxes, and performance as orders close.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
