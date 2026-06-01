import { useState, useEffect, FormEvent } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { UserProfile } from "./types";

// Modular UI Layers
import AuthPage from "./components/AuthPage";
import Navigation from "./components/Navigation";
import Feed from "./components/Feed";
import Search from "./components/Search";
import Notifications from "./components/Notifications";
import Messages from "./components/Messages";
import Profile from "./components/Profile";
import AdminPanel from "./components/AdminPanel";

// Utility icons
import { 
  Lock, 
  RotateCw, 
  PenSquare, 
  X, 
  Sparkles, 
  ShieldAlert,
  AlertOctagon
} from "lucide-react";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Router tab controls
  const [activeTab, setActiveTab] = useState<string>("FEED");
  
  // UX Parameter passes
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedTagQuery, setSelectedTagQuery] = useState<string | null>(null);

  // Global compose modal control
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [modalText, setModalText] = useState("");
  const [modalWarning, setModalWarning] = useState<string | null>(null);
  const [modalPosting, setModalPosting] = useState(false);

  // Real-time unread badges counters
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  // Subscribe to Authentication state changed
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        await refreshUserProfile(firebaseUser.uid);
      } else {
        setUser(null);
        setCurrentUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  // Fetch / Refresh corresponding Firestore User profile block
  const refreshUserProfile = async (uid: string) => {
    try {
      const docRef = doc(db, "users", uid);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        setCurrentUserProfile({ uid: snap.id, ...snap.data() } as UserProfile);
      } else {
        console.warn("User has credentials, but lacks associated Firestore metadata Profile document.");
        setCurrentUserProfile(null);
      }
    } catch (err) {
      console.error("Firestore user profile pull failure:", err);
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to Notification feed unreads
  useEffect(() => {
    if (!currentUserProfile) return;

    const notifRef = collection(db, "notifications");
    const q = query(
      notifRef,
      where("recipientId", "==", currentUserProfile.uid),
      where("isRead", "==", false)
    );

    const unsubCount = onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    }, () => {});

    return () => unsubCount();
  }, [currentUserProfile]);

  // Subscribe to Message Rooms unread indicators
  useEffect(() => {
    if (!currentUserProfile) return;

    // We can count rooms unreads simply by scanning active message notifications
    const notifyRef = collection(db, "notifications");
    const q = query(
      notifyRef,
      where("recipientId", "==", currentUserProfile.uid),
      where("type", "==", "MSG"),
      where("isRead", "==", false)
    );

    const unsubMsgCount = onSnapshot(q, (snap) => {
      setUnreadMsgCount(snap.size);
    }, () => {});

    return () => unsubMsgCount();
  }, [currentUserProfile]);

  // Dynamic profile navigator pass
  const handleProfileSelected = (targetUserId: string) => {
    setSelectedProfileId(targetUserId);
    setActiveTab("PROFILE");
  };

  // Dynamic tag finder pass
  const handleTagSelected = (tagString: string) => {
    setSelectedTagQuery(tagString);
    setActiveTab("SEARCH");
  };

  const forceCurrentUserRefresh = () => {
    if (user) {
      refreshUserProfile(user.uid);
    }
  };

  // Compose post submit handler (modal panel version)
  const handleModalPostSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile || !modalText.trim() || modalPosting) return;
    if (modalText.length > 500) {
      setModalWarning("Strict character restriction of 500 characters reached.");
      return;
    }

    setModalPosting(true);
    setModalWarning(null);

    try {
      // Moderate content
      const res = await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: modalText })
      });
      const check = await res.json();

      if (check && !check.approved) {
        setModalWarning(`Moderation warning: ${check.reason}`);
        setModalPosting(false);
        return;
      }

      // Write safely onto firestore
      const writeRef = doc(collection(db, "posts"));
      const authorPhotoURL = currentUserProfile.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUserProfile.username}`;

      await setDoc(writeRef, {
        id: writeRef.id,
        authorId: currentUserProfile.uid,
        authorUsername: currentUserProfile.username,
        authorDisplayName: currentUserProfile.displayName,
        authorPhotoURL: authorPhotoURL,
        content: modalText.trim(),
        createdAt: new Date(),
        likesCount: 0,
        commentsCount: 0,
        repostsCount: 0,
        isRepost: false
      });

      setModalText("");
      setShowComposeModal(false);
      // Auto routing back to timeline to see post live
      setActiveTab("FEED");
    } catch (err) {
      console.error("Eror publishing update from modal overlay:", err);
      setModalWarning("Write failed. verify security rules.");
    } finally {
      setModalPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center gap-3">
        <RotateCw className="w-8 h-8 text-white animate-spin" />
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest block select-none">Initializing Pulse Environment...</span>
      </div>
    );
  }

  // Not Logged in state
  if (!user || !currentUserProfile) {
    return <AuthPage onAuthSuccess={forceCurrentUserRefresh} />;
  }

  // Block platform access if active profile state is suspended
  if (currentUserProfile.isSuspended) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center px-4">
        <div className="w-full max-w-[400px] bg-zinc-950 border border-zinc-900 rounded-3xl p-8 text-center relative z-10 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-red-950/50 border border-red-900 mx-auto flex items-center justify-center text-red-500 mb-6">
            <AlertOctagon className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white mb-2">Profile Suspended</h1>
          <p className="text-xs text-zinc-400 leading-normal mb-6">
            Your Pulse profile associated with <span className="font-mono text-zinc-200">@{currentUserProfile.username}</span> has been locked by Pulse Moderation Engineers due to platform guidelines violations.
          </p>
          <button
            onClick={() => auth.signOut()}
            className="w-full bg-white text-black py-2.5 rounded-xl font-semibold text-xs active:scale-95 transition-all cursor-pointer"
          >
            Access Other Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex justify-center selection:bg-white selection:text-black">
      
      {/* Container holding left rail, center dashboard, and right trending topics pane */}
      <div className="w-full max-w-6xl flex justify-center">
        
        {/* RESPONSIVE LEFT NAVIGATION BAR */}
        <Navigation
          activeTab={activeTab}
          setActiveTab={(tab) => {
            // Reset state maps when navigating tabs
            setSelectedProfileId(null);
            setSelectedTagQuery(null);
            setActiveTab(tab);
          }}
          currentUserProfile={currentUserProfile}
          unreadCount={unreadCount}
          unreadMsgCount={unreadMsgCount}
          onOpenCompose={() => setShowComposeModal(true)}
        />

        {/* CENTRAL SCREEN WORKSPACE */}
        <main className="flex-1 min-w-0 max-w-[620px] pb-24 md:pb-6 pt-4 border-r border-zinc-900/60 h-screen overflow-y-auto px-4 md:px-6">
          {activeTab === "FEED" && (
            <Feed
              currentUserProfile={currentUserProfile}
              onProfileClick={handleProfileSelected}
              onTagClick={handleTagSelected}
            />
          )}

          {activeTab === "SEARCH" && (
            <Search
              currentUserProfile={currentUserProfile}
              onProfileClick={handleProfileSelected}
              onTagClick={handleTagSelected}
              suggestedTag={selectedTagQuery || undefined}
            />
          )}

          {activeTab === "NOTIFICATIONS" && (
            <Notifications
              currentUserProfile={currentUserProfile}
              onProfileClick={handleProfileSelected}
              onPostClick={(targetId) => {
                if (targetId === "MSG") {
                  setActiveTab("MESSAGES");
                } else {
                  // Standard redirect search post match
                  setSelectedTagQuery(targetId);
                  setActiveTab("SEARCH");
                }
              }}
            />
          )}

          {activeTab === "MESSAGES" && (
            <Messages
              currentUserProfile={currentUserProfile}
              onProfileClick={handleProfileSelected}
            />
          )}

          {activeTab === "PROFILE" && (
            <Profile
              userId={selectedProfileId || currentUserProfile.uid}
              currentUserProfile={currentUserProfile}
              onProfileClick={handleProfileSelected}
              onRefreshCurrentUserProfile={() => refreshUserProfile(currentUserProfile.uid)}
            />
          )}

          {activeTab === "ADMIN" && (
            <AdminPanel
              currentUserProfile={currentUserProfile}
            />
          )}
        </main>

        {/* OPTIONAL RIGHT SIDEBAR - Recommended lists & system tips (Desktop only) */}
        <aside className="hidden lg:flex w-72 flex-col px-6 py-6 space-y-6 shrink-0 text-left h-screen sticky top-0 overflow-y-auto">
          {/* Welcome Alert */}
          <section className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4.5 ">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-white shrink-0" />
              <h4 className="font-bold text-white text-xs">Pulse Premium Setup</h4>
            </div>
            <p className="text-[11px] text-zinc-550 leading-relaxed font-sans">
              Welcome to the elite visual timeline module, built on pure black Apple-inspired glassmorphism, zero-leak firestore attributes and Gemini safety tools.
            </p>
          </section>

          {/* Quick legal checklist */}
          <footer className="text-[10px] font-mono text-zinc-600 space-y-1.5 select-none pl-1 pb-6 pt-4">
            <p>© 2026 Pulse Platform Co.</p>
            <div className="flex flex-wrap gap-x-2 text-zinc-650">
              <a href="#rules" className="hover:underline">Security Rules</a>
              <span>•</span>
              <a href="#terms" className="hover:underline">Terms of Service</a>
              <span>•</span>
              <a href="#privacy" className="hover:underline">Privacy Policy</a>
            </div>
          </footer>
        </aside>

      </div>

      {/* GLOBAL MODAL COMPOSE UPDATE BOARD SCREEN */}
      {showComposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-[480px] p-6 relative">
            <button
              onClick={() => {
                setShowComposeModal(false);
                setModalWarning(null);
              }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-4.5 h-4.5" />
            </button>

            <h3 className="text-sm font-semibold mb-4 text-white flex items-center gap-1.5">
              <PenSquare className="w-4 h-4" /> Share new update
            </h3>

            {modalWarning && (
              <div className="mb-4 p-3 bg-red-950/45 border border-red-900 rounded-xl flex items-start gap-2 max-w-full">
                <span className="text-[11px] text-red-200 leading-snug">{modalWarning}</span>
              </div>
            )}

            <form onSubmit={handleModalPostSubmit} className="space-y-4">
              <textarea
                value={modalText}
                onChange={(e) => {
                  setModalText(e.target.value);
                  if (modalWarning) setModalWarning(null);
                }}
                placeholder="Share your pulse..."
                className="w-full h-32 bg-transparent text-sm text-zinc-200 focus:outline-none resize-none font-serif leading-relaxed"
                maxLength={500}
                required
              />

              <div className="flex items-center justify-between pt-3 border-t border-zinc-900">
                <span className="text-[10px] font-mono text-zinc-600">{modalText.length}/500 chars</span>
                <button
                  type="submit"
                  disabled={modalPosting || !modalText.trim()}
                  className="bg-white text-black text-xs font-semibold px-4.5 py-2 rounded-xl hover:bg-zinc-200 cursor-pointer disabled:opacity-40"
                >
                  {modalPosting ? "Moderating..." : "Publish pulse"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
