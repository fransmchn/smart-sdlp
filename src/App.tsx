import React, { useState } from "react";
import { Role, UserProfile, Activity } from "@/types";
import { userActivities, allKegiatan } from "@/data/mockData";
import { Sidebar } from "@/components/Sidebar";
import { TopHeader } from "@/components/TopHeader";
import { LoginPage } from "@/components/LoginPage";
import { UserDashboard } from "@/components/UserDashboard";
import { AdminDashboard } from "@/components/AdminDashboard";
import { InputLaporanPage } from "@/components/InputLaporanPage";
import { RepositoriPage } from "@/components/RepositoriPage";
import { CetakLaporanPage } from "@/components/CetakLaporanPage";
import { ManajemenKegiatanPage } from "@/components/ManajemenKegiatanPage";
import { MasterArsipSMARTPage } from "@/components/MasterArsipSMARTPage";
import { LogAuditPage } from "@/components/LogAuditPage";

const initialAdminProfile: UserProfile = {
  nama: "Admin Pusdatin",
  nip: "19820514 200604 1 002",
  email: "admin.pusdatin@pertanian.go.id",
  jabatan: "Pranata Komputer Ahli Muda",
  unitKerja: "Pusat Data dan Sistem Informasi Pertanian",
  foto: "",
  role: "admin",
};

const initialUserProfile: UserProfile = {
  nama: "Ir. Budi Santoso, M.Si.",
  nip: "19780412 200312 1 001",
  email: "budi.santoso@pertanian.go.id",
  jabatan: "Penanggung Jawab (PJ) Kegiatan",
  unitKerja: "Balai Besar Perakitan dan Modernisasi Sumber Daya Lahan Pertanian",
  foto: "",
  role: "user",
};

const AUTH_STORAGE_KEY = "smart_auth_session";

interface StoredAuthSession {
  isLoggedIn: boolean;
  role: Role;
  userProfile: UserProfile;
  activeMenu: string;
}

export default function App() {
  // Initialize state from local storage or default to unauthenticated
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed: StoredAuthSession = JSON.parse(saved);
        return Boolean(parsed.isLoggedIn);
      }
    } catch {
      // ignore parse error
    }
    return false;
  });

  const [role, setRole] = useState<Role>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed: StoredAuthSession = JSON.parse(saved);
        if (parsed.role === "admin" || parsed.role === "user") {
          return parsed.role;
        }
      }
    } catch {
      // ignore
    }
    return "admin";
  });

  const [activeMenu, setActiveMenu] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed: StoredAuthSession = JSON.parse(saved);
        if (parsed.activeMenu) {
          return parsed.activeMenu;
        }
      }
    } catch {
      // ignore
    }
    return "exec";
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>(() => allKegiatan);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed: StoredAuthSession = JSON.parse(saved);
        if (parsed.userProfile) {
          return parsed.userProfile;
        }
      }
    } catch {
      // ignore
    }
    return initialAdminProfile;
  });

  const saveSession = (
    loggedIn: boolean,
    userRole: Role,
    profile: UserProfile,
    menu: string
  ) => {
    try {
      if (loggedIn) {
        const sessionData: StoredAuthSession = {
          isLoggedIn: true,
          role: userRole,
          userProfile: profile,
          activeMenu: menu,
        };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      // ignore local storage restrictions
    }
  };

  const handleRoleSwitch = (newRole: Role) => {
    const nextProfile = newRole === "admin" ? initialAdminProfile : initialUserProfile;
    let nextMenu = activeMenu;

    if (newRole === "admin") {
      if (["dashboard", "input", "arsip", "unduh"].includes(activeMenu)) {
        nextMenu = "exec";
      }
    } else {
      if (
        [
          "exec",
          "master",
          "repositori",
          "arsip-sp2d",
          "log-audit",
          "cetak",
        ].includes(activeMenu)
      ) {
        nextMenu = "dashboard";
      }
    }

    setRole(newRole);
    setUserProfile(nextProfile);
    setActiveMenu(nextMenu);
    saveSession(true, newRole, nextProfile, nextMenu);
  };

  const handleLogin = (userRole: Role, email?: string) => {
    let targetProfile = userRole === "admin" ? { ...initialAdminProfile } : { ...initialUserProfile };
    if (email) {
      targetProfile.email = email;
    }

    // Role-based target redirect page
    const targetMenu = userRole === "admin" ? "exec" : "dashboard";

    setRole(userRole);
    setUserProfile(targetProfile);
    setActiveMenu(targetMenu);
    setIsLoggedIn(true);

    saveSession(true, userRole, targetProfile, targetMenu);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    saveSession(false, "admin", initialAdminProfile, "exec");
  };

  const handleMenuChange = (newMenu: string) => {
    // Route Guard: enforce role-based access
    if (role === "user") {
      const allowedUserMenus = ["dashboard", "input", "arsip", "unduh"];
      if (!allowedUserMenus.includes(newMenu)) {
        newMenu = "dashboard";
      }
    }
    setActiveMenu(newMenu);
    saveSession(true, role, userProfile, newMenu);
  };

  const handleProfileUpdate = (updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
    saveSession(true, role, updatedProfile, activeMenu);
  };

  // Route Guard: If not logged in, force render LoginPage
  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 font-sans antialiased">
      {/* ── Responsive Sidebar (Desktop sticky & Mobile drawer) ── */}
      <Sidebar
        role={role}
        activeMenu={activeMenu}
        onMenuChange={handleMenuChange}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onLogout={handleLogout}
      />

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Header (Interactive notifications & profile dropdown) */}
        <TopHeader
          role={role}
          activeMenu={activeMenu}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onRoleSwitch={handleRoleSwitch}
          onNavigate={handleMenuChange}
          onLogout={handleLogout}
          userProfile={userProfile}
          onUpdateProfile={handleProfileUpdate}
        />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-5 max-w-[1400px] w-full mx-auto">
          {/* User View Routes */}
          {role === "user" && (
            <>
              {activeMenu === "dashboard" && (
                <UserDashboard
                  activities={userActivities}
                  onNavigate={setActiveMenu}
                />
              )}
              {activeMenu === "input" && <InputLaporanPage />}
            </>
          )}

          {/* Admin View Routes */}
          {role === "admin" && (
            <>
              {activeMenu === "exec" && (
                <AdminDashboard
                  activities={activities}
                  onNavigate={setActiveMenu}
                />
              )}
              {activeMenu === "master" && (
                <ManajemenKegiatanPage
                  activities={activities}
                  onUpdateActivities={setActivities}
                />
              )}
              {activeMenu === "repositori" && <RepositoriPage />}
              {activeMenu === "arsip-sp2d" && (
                <MasterArsipSMARTPage
                  onNavigateToAudit={() => setActiveMenu("log-audit")}
                />
              )}
              {activeMenu === "log-audit" && <LogAuditPage />}
              {activeMenu === "cetak" && <CetakLaporanPage />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
