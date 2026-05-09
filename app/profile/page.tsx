"use client";

import { useAuth } from "@/lib/context/auth-context";
import { POSLayout } from "@/components/pos-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { User, Mail, Briefcase, Calendar, LogOut, Lock } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    router.push("/login");
  };

  if (!user) {
    return (
      <POSLayout currentPage="profile">
        <div className="max-w-2xl mx-auto p-6">
          <p className="text-slate-500">Loading...</p>
        </div>
      </POSLayout>
    );
  }

  return (
    <POSLayout currentPage="profile">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Profile</h1>
          <p className="text-slate-600 mt-1">Manage your account settings</p>
        </div>

        {/* Profile Card */}
        <Card className="p-8">
          <div className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                <User className="w-10 h-10 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {user.name}
                </h2>
                <p className="text-slate-600 capitalize">{user.role}</p>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Name
                </label>
                <div className="px-4 py-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-900">
                  {user.name}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </label>
                <div className="px-4 py-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-900">
                  {user.email}
                </div>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Role
                </label>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-800 capitalize">
                    {user.role}
                  </Badge>
                </div>
              </div>

              {/* Member Since */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Member Since
                </label>
                <div className="px-4 py-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-900">
                  {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Account Settings */}
        <Card className="p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-6">
            Account Settings
          </h3>

          <div className="space-y-4">
            {/* Change PIN (Demo) */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-slate-600" />
                <div>
                  <p className="font-medium text-slate-900">Change PIN</p>
                  <p className="text-sm text-slate-600">
                    Update your 4-digit PIN
                  </p>
                </div>
              </div>
              <Button
                onClick={() => toast.info("PIN change coming soon")}
                variant="outline"
              >
                Update
              </Button>
            </div>

            {/* Notifications (Demo) */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-slate-600" />
                <div>
                  <p className="font-medium text-slate-900">Notifications</p>
                  <p className="text-sm text-slate-600">
                    Manage notification preferences
                  </p>
                </div>
              </div>
              <Button
                onClick={() => toast.info("Notification settings coming soon")}
                variant="outline"
              >
                Configure
              </Button>
            </div>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="p-8 border-red-200 bg-red-50">
          <h3 className="text-lg font-bold text-red-900 mb-4">Danger Zone</h3>
          <p className="text-sm text-red-800 mb-6">
            Once you logout, you&apos;ll need to enter your PIN again to access
            the system.
          </p>
          <Button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </Card>

        {/* Quick Reference */}
        <Card className="p-8 bg-blue-50 border-blue-200">
          <h3 className="text-lg font-bold text-blue-900 mb-4">
            Quick Reference
          </h3>
          <div className="space-y-3 text-sm text-blue-800">
            <p>
              <span className="font-semibold">Sell Page:</span> Add products to
              cart, apply discounts, and complete sales
            </p>
            <p>
              <span className="font-semibold">Orders:</span> View and resume
              saved order drafts
            </p>
            <p>
              <span className="font-semibold">History:</span> Track sales
              performance and analytics
            </p>
            <p>
              <span className="font-semibold">Your PIN:</span> Your current PIN
              is {user.pin}
            </p>
          </div>
        </Card>
      </div>
    </POSLayout>
  );
}
