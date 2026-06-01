import { UserProfile } from "../types";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { 
  Home, 
  Search, 
  Bell, 
  Mail, 
  User, 
  ShieldAlert,
  LogOut, 
  PenSquare, 
  CheckCircle2 
} from "lucide-react";

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUserProfile: UserProfile | null;
  unreadCount?: number;
  unreadMsgCount?: number;
  onOpenCompose: () => void;
}

export default function Navigation({
  activeTab,
  setActiveTab,
  currentUserProfile,
  unreadCount = 0,
  unreadMsgCount = 0,
  onOpenCompose
}: NavigationProps) {

  const isAdmin = currentUserProfile?.uid === "farmanshafi2007@gmail.com" || currentUserProfile?.username === "admin";

  const handleLogout = async () => {
    if (confirm("Are you sure you want to sign out of Pulse?")) {
      await signOut(auth);
    }
  };

  const navItems = [
    { id: "FEED", label: "Home", icon: Home },
    { id: "SEARCH", label: "Search", icon: Search },
    { 
      id: "NOTIFICATIONS", 
      label: "Notifications", 
      icon: Bell, 
      count: unreadCount 
    },
    { 
      id: "MESSAGES", 
      label: "Messages", 
      icon: Mail, 
      count: unreadMsgCount 
    },
    { id: "PROFILE", label: "Profile", icon: User }
  ];

  if (isAdmin) {
    navItems.push({ id: "ADMIN", label: "Admin", icon: ShieldAlert });
  }

  return (
    <>
      {/* LEFT DRAWER - Desktop Setup (md and higher) */}
      <aside className="hidden md:flex flex-col justify-between w-64 h-screen sticky top-0 border-r border-zinc-900 bg-black text-white py-6 px-4 shrink-0">
        <div className="space-y-8">
          {/* Main Logo */}
          <div className="flex items-center gap-3 px-3 cursor-pointer" onClick={() => setActiveTab("FEED")}>
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-black font-black text-sm select-none">
              P
            </div>
            <span className="font-semibold text-lg tracking-tight hover:opacity-85 transition-all">Pulse</span>
          </div>

          {/* Nav Items */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition-all font-medium text-[14px] cursor-pointer group hover:bg-zinc-900/60 ${
                    isActive ? "text-white bg-zinc-900" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <Icon className={`w-[18px] h-[18px] transition-transform group-hover:scale-105 ${
                      isActive ? "text-white stroke-2" : "text-zinc-400 group-hover:text-white stroke-1.5"
                    }`} />
                    <span>{item.label}</span>
                  </div>
                  {item.count && item.count > 0 ? (
                    <span className="bg-white text-black font-semibold text-[10px] px-2 py-0.5 rounded-full ring-2 ring-black">
                      {item.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          {/* Quick Write compose trigger */}
          <button
            onClick={onOpenCompose}
            className="w-full bg-white text-black font-medium text-xs select-none py-3.5 rounded-xl hover:bg-zinc-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-white/5"
          >
            <PenSquare className="w-4 h-4 shrink-0" />
            <span>Post Update</span>
          </button>
        </div>

        {/* User Card Area */}
        {currentUserProfile && (
          <div className="p-3 bg-zinc-950/60 border border-zinc-900/80 rounded-2xl flex items-center justify-between gap-2 shadow-inner">
            <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => setActiveTab("PROFILE")}>
              <img
                src={currentUserProfile.photoURL}
                alt={currentUserProfile.displayName}
                className="w-8.5 h-8.5 rounded-full object-cover shrink-0 bg-zinc-900"
              />
              <div className="text-left overflow-hidden select-none">
                <div className="font-semibold text-xs text-white truncate flex items-center gap-1 leading-none mb-0.5">
                  {currentUserProfile.displayName}
                  {currentUserProfile.isVerified && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-white fill-white shrink-0" />
                  )}
                </div>
                <span className="text-[10px] font-mono text-zinc-500 truncate block">
                  @{currentUserProfile.username}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-zinc-500 hover:text-red-400 transition-all p-1.5 rounded-lg hover:bg-zinc-900/40 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 shrink-0" />
            </button>
          </div>
        )}
      </aside>

      {/* BOTTOM NAV BAR - Mobile Setup */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-zinc-900 bg-black/85 backdrop-blur-md text-white flex items-center justify-around z-40 px-2 shadow-2xl">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="relative p-3 flex flex-col items-center justify-center cursor-pointer group"
            >
              <Icon className={`w-5 h-5 transition-transform group-active:scale-90 ${
                isActive ? "text-white stroke-2" : "text-zinc-400 stroke-1.5"
              }`} />
              {item.count && item.count > 0 ? (
                <span className="absolute top-1.5 right-1.5 bg-white text-black font-bold text-[8px] px-1.5 py-0.2 rounded-full min-w-[14px] text-center border border-black leading-none">
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
        
        {/* Floating compose button on mobile overlay */}
        <button
          onClick={onOpenCompose}
          className="fixed bottom-20 right-5 bg-white text-black w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all z-40 cursor-pointer border border-zinc-900"
        >
          <PenSquare className="w-5 h-5" />
        </button>
      </footer>
    </>
  );
}
