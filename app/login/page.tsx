"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/provider/auth-provider";
import appLogo from "@/assets/images/logo.png";
import homepageImage from "@/assets/images/homepage.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";
import { toast } from "sonner";

function StyledField({
  label,
  value,
  type = "text",
  placeholder,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative border border-[#c1bbbb] bg-white px-5 py-3">
      <p
        className="mb-1 text-sm text-black/60"
        style={{ fontFamily: "Roboto, sans-serif" }}
      >
        {label}
      </p>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-7 border-0 bg-transparent px-0 py-0 text-base text-[#3751fe] shadow-none focus-visible:ring-0"
      />
      <span className="absolute inset-y-0 left-0 w-1 bg-[#3751fe]" />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuth();
  const [url, setUrl] = useState(
    () =>
      Storage.getItem(STORAGE_KEYS.clientUrl) ||
      process.env.NEXT_PUBLIC_EBITABO_API_PROXY_TARGET ||
      "",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!url.trim()) {
      setError("Server URL is required");
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
      toast.success("Login successful");
      router.push("/sell");
      return;
    }

    setError("Invalid URL, username, or password");
    toast.error("Invalid URL, username, or password");
  };

  return (
    <div className="h-dvh overflow-hidden bg-[#f2f2f2]">
      <div className="grid h-full w-full grid-cols-1 lg:grid-cols-[46%_54%]">
        <section className="flex h-full flex-col overflow-hidden px-6 py-6 sm:px-10 lg:px-[86px] lg:py-10">
          <div className="mb-16 flex items-center gap-3 lg:mb-20">
            <div className="relative size-9 overflow-hidden rounded-md border border-slate-200 bg-white">
              <Image
                src={appLogo}
                alt="Ebtabo logo"
                fill
                className="object-contain p-1"
                priority
              />
            </div>
            <p
              className="text-3xl font-bold text-[#3751fe]"
              style={{ fontFamily: "Roboto, sans-serif" }}
            >
              Ebtabo
            </p>
          </div>

          <div className="max-w-[560px]">
            <p
              className="text-lg text-black/60"
              style={{ fontFamily: "Roboto, sans-serif" }}
            >
              Welcome back! Please login to your account.
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="mt-10 w-full max-w-[560px] space-y-4 lg:mt-14"
          >
            <StyledField
              label="Username"
              value={username}
              onChange={(value) => {
                setUsername(value);
                setError("");
              }}
              placeholder="Enter your username"
              disabled={isLoading}
            />

            <StyledField
              label="Password"
              type="password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setError("");
              }}
              placeholder="Enter your password"
              disabled={isLoading}
            />

            <StyledField
              label="Server URL"
              value={url}
              onChange={(value) => {
                setUrl(value);
                setError("");
              }}
              placeholder="https://your-business-domain.com"
              disabled={isLoading}
            />

            <div
              className="flex items-center justify-between pt-1 text-sm"
              style={{ fontFamily: "Roboto, sans-serif" }}
            >
              <label className="inline-flex items-center gap-2 text-black/75">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="size-4 accent-[#3751fe]"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() =>
                  toast.info(
                    "Please contact your administrator to reset password.",
                  )
                }
                className="text-black/65 underline-offset-2 hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            {error && (
              <div className="border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-4 pt-3">
              <Button
                type="submit"
                disabled={isLoading}
                className="h-[54px] min-w-[140px] rounded-none bg-[#3751fe] px-8 text-base font-semibold hover:bg-[#2f44d5]"
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-[54px] min-w-[140px] rounded-none border-[#3751fe] px-8 text-base font-semibold text-[#3751fe] hover:bg-[#eef1ff]"
                onClick={() =>
                  toast.info("Use your assigned cashier account to login.")
                }
              >
                Sign Up
              </Button>
            </div>
          </form>
        </section>

        <section className="relative hidden h-full overflow-hidden bg-[rgba(229,229,229,0.41)] lg:block">
          <Image
            src={homepageImage}
            alt="Homepage visual"
            fill
            className="object-cover"
            priority
          />
        </section>
      </div>
    </div>
  );
}
