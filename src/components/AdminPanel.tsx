import { useState, useEffect } from "react";
import { UserProfile, Report, Post } from "../types";
import { db } from "../firebase";
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  onSnapshot 
} from "firebase/firestore";
import { 
  ShieldAlert, 
  Users, 
  FileText, 
  AlertOctagon, 
  Check, 
  X, 
  Trash2, 
  RotateCw, 
  CheckCircle2, 
  SlidersHorizontal 
} from "lucide-react";

interface AdminPanelProps {
  currentUserProfile: UserProfile | null;
}

export default function AdminPanel({ currentUserProfile }: AdminPanelProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  // Platform metricsState
  const [totalPosts, setTotalPosts] = useState(0);
  const [activeUsersCount, setActiveUsersCount] = useState(0);

  // Lists fetcher callback
  useEffect(() => {
    const fetchAdminData = async () => {
      setLoading(true);
      try {
        // Fetch all platform users
        const usersSnap = await getDocs(collection(db, "users"));
        const usersList: UserProfile[] = [];
        usersSnap.forEach((docSnap) => {
          usersList.push({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
        });
        setUsers(usersList);
        setActiveUsersCount(usersList.length);

        // Fetch platform reports
        const reportsSnap = await getDocs(collection(db, "reports"));
        const reportsList: Report[] = [];
        reportsSnap.forEach((docSnap) => {
          reportsList.push({ id: docSnap.id, ...docSnap.data() } as Report);
        });
        setReports(reportsList);

        // Fetch posts count metrics
        const postsSnap = await getDocs(collection(db, "posts"));
        setTotalPosts(postsSnap.size);

      } catch (err) {
        console.error("Admin data fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, [currentUserProfile]);

  // Handle assign Gold verification badge
  const toggleVerification = async (userId: string, currentState: boolean) => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        isVerified: !currentState
      });
      
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, isVerified: !currentState } : u));
      alert("Profile verification state shifted successfully.");
    } catch (err) {
      console.error("Verification adjustment error:", err);
    }
  };

  // Handle suspend block user accounts toggle
  const toggleSuspension = async (userId: string, currentState: boolean) => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        isSuspended: !currentState
      });

      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, isSuspended: !currentState } : u));
      alert(`User suspension status switched to ${!currentState}.`);
    } catch (err) {
      console.error("Suspension switch error:", err);
    }
  };

  // Resolve Lodged Abuse Reports
  const resolveReport = async (reportId: string, resolution: "RESOLVED_BANNED" | "RESOLVED_DISMISSED", targetId: string, targetType: "POST" | "USER") => {
    try {
      const reportRef = doc(db, "reports", reportId);
      
      // Update report status
      await updateDoc(reportRef, {
        status: resolution
      });

      // Execute actual moderation action if Banned
      if (resolution === "RESOLVED_BANNED") {
        if (targetType === "POST") {
          await deleteDoc(doc(db, "posts", targetId));
          alert("Platform moderation: Post document deleted from Firestore.");
        } else if (targetType === "USER") {
          await updateDoc(doc(db, "users", targetId), {
            isSuspended: true
          });
          alert("Platform moderation: User profile locked to suspended state.");
        }
      } else {
        alert("Report record marked as resolved/dismissed.");
      }

      // Re-fetch or locally mutate
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: resolution } : r));
    } catch (err) {
      console.error("Failed report action transaction:", err);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <RotateCw className="w-8 h-8 text-zinc-550 animate-spin mx-auto mb-2" />
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest block leading-none">Syncing admin dashboard datasets...</span>
      </div>
    );
  }

  return (
    <div id="admin-root" className="flex-1 max-w-2xl px-4 md:px-0 text-left pb-16">
      
      {/* Title */}
      <h2 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2 mb-6 sticky top-0 bg-black py-3 z-30">
        <ShieldAlert className="w-5 h-5 text-white animate-pulse" />
        <span>Platform Admin Control Deck</span>
      </h2>

      {/* Metrics Row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
          <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider">Total Accounts</span>
          <p className="text-2xl font-bold font-serif text-white mt-1">{users.length}</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
          <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider">Active Stream Updates</span>
          <p className="text-2xl font-bold font-serif text-white mt-1">{totalPosts}</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
          <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider">Abuse Reports Filed</span>
          <p className="text-2xl font-bold font-serif text-red-500 mt-1">{reports.length}</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
          <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider">Platform Security</span>
          <p className="text-sm font-bold text-green-400 mt-1 uppercase font-mono">Hardened Rules</p>
        </div>
      </section>

      {/* LODGED USER VIOLATIONS AND REPORTS DRAWER */}
      <section className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 mb-8 text-left">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2 text-white">
          <SlidersHorizontal className="w-4 h-4" />
          Pending Abuse Reports ({reports.filter(r => r.status === "PENDING").length})
        </h3>
        <p className="text-xs text-zinc-500 mb-5 leading-relaxed">Resolve system abuse, explicit links, harassment, or self-verification requests.</p>

        <div className="space-y-4">
          {reports.length === 0 ? (
            <p className="text-xs text-zinc-600 font-mono italic text-center py-4">No logged user violation reports in database logs.</p>
          ) : (
            reports.map((rep) => (
              <div key={rep.id} className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest bg-zinc-950 px-2 py-0.5 rounded">
                      {rep.targetType}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">Target ID: {rep.targetId.substring(0, 10)}...</span>
                  </div>
                  <p className="text-xs text-zinc-200 font-serif leading-relaxed">Reasoning: "{rep.reason}"</p>
                  <span className={`text-[10px] font-mono font-bold uppercase ${rep.status === "PENDING" ? "text-amber-500" : "text-green-500"}`}>
                    Status: {rep.status}
                  </span>
                </div>

                {rep.status === "PENDING" && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => resolveReport(rep.id, "RESOLVED_BANNED", rep.targetId, rep.targetType)}
                      className="text-[10px] bg-red-650 hover:bg-red-700 text-white font-medium p-2 px-3 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Approve & Ban
                    </button>
                    <button
                      onClick={() => resolveReport(rep.id, "RESOLVED_DISMISSED", rep.targetId, rep.targetType)}
                      className="text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white font-medium p-2 px-3 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* USERS ACCOUNT CODES INDEX MODERATION */}
      <section className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 text-left">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2 text-white">
          <Users className="w-4 h-4" />
          Pulse Platform Registered Index ({users.length})
        </h3>
        <p className="text-xs text-zinc-500 mb-5 leading-relaxed font-sans">Manage user accounts privileges, toggle custom Gold verified badge checkmarks, or lock logins.</p>

        <div className="divide-y divide-zinc-900">
          {users.map((usr) => (
            <div key={usr.uid} className="py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={usr.photoURL}
                  alt={usr.displayName}
                  className="w-9 h-9 rounded-full object-cover bg-zinc-900"
                />
                <div className="text-left text-xs leading-none">
                  <h4 className="font-bold text-white mb-1 flex items-center gap-1">
                    {usr.displayName}
                    {usr.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-white fill-white shrink-0" />}
                  </h4>
                  <span className="text-[10px] font-mono text-zinc-500">@{usr.username}</span>
                </div>
              </div>

              {/* Privilege adjustments buttons row */}
              <div className="flex gap-2">
                <button
                  onClick={() => toggleVerification(usr.uid, usr.isVerified)}
                  className={`text-[10px] font-bold p-2 px-3.5 rounded-lg border transition-all cursor-pointer ${
                    usr.isVerified 
                      ? "bg-zinc-950 border-zinc-801 text-white" 
                      : "bg-white text-black hover:bg-zinc-200 border-transparent"
                  }`}
                >
                  {usr.isVerified ? "Revoke Checked Class" : "Assign Verified Badges"}
                </button>
                
                <button
                  onClick={() => toggleSuspension(usr.uid, usr.isSuspended)}
                  className={`text-[10px] font-bold p-2 px-3.5 rounded-lg border transition-all cursor-pointer ${
                    usr.isSuspended 
                      ? "bg-red-950/40 border-red-900 text-red-200" 
                      : "bg-zinc-950 hover:bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white"
                  }`}
                >
                  {usr.isSuspended ? "Unsuspend account login" : "Suspend Account Block"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
