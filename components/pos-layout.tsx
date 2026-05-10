"use client";

import { useAuth } from "@/provider/auth-provider";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "./protected-route";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import appLogo from "@/assets/images/logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User } from "lucide-react";
import Link from "next/link";

interface POSLayoutProps {
  children: React.ReactNode;
  currentPage: "sell" | "orders" | "history" | "profile";
}

export function POSLayout({ children, currentPage }: POSLayoutProps) {
  const { user, business, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const navItems = [
    { href: "/sell", label: "Sell", page: "sell" as const },
    { href: "/orders", label: "Orders", page: "orders" as const },
    { href: "/history", label: "History", page: "history" as const },
  ];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 shadow-md sticky top-0 z-50">
          <div className="flex items-center justify-between px-6 py-4">
            {/* Logo */}
            <Link href="/sell" className="flex items-center gap-2">
              <div className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-slate-200 overflow-hidden">
                <Image
                  src={appLogo}
                  alt="Ebtabo logo"
                  fill
                  className="object-contain p-1"
                />
              </div>
              <span className="text-lg font-bold text-slate-900">Ebtabo</span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.page}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    currentPage === item.page
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* User Menu */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-slate-900">
                  {user?.name || user?.username || business?.name || "User"}
                </p>
                <p className="text-xs text-slate-500 capitalize">
                  {business?.account_type || user?.role || "POS User"}
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <User className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer">
                      <User className="w-4 h-4 mr-2" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-red-600"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Mobile Navigation */}
          <nav className="md:hidden border-t border-slate-200 flex gap-1 px-6 py-2 overflow-x-auto">
            {navItems.map((item) => (
              <Link
                key={item.page}
                href={item.href}
                className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition-colors ${
                  currentPage === item.page
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        {/* Main Content */}
        <main className="flex-1">{children}</main>
      </div>
    </ProtectedRoute>
  );
}
