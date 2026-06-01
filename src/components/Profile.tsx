import { useState, useEffect, FormEvent } from "react";
import { UserProfile, Post } from "../types";
import { db } from "../firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  onSnapshot, 
  writeBatch 
} from "firebase/firestore";
import PostCard from "./PostCard";
import { 
  Calendar, 
  CheckCircle2, 
  Image, 
  Edit, 
  RotateCw, 
  Plus, 
  Check, 
  FileText, 
  Award,
  Globe
} from "lucide-react";

interface ProfileProps {
  userId: string; // The active targeted user trace
  currentUserProfile: UserProfile | null;
  onProfileClick?: (userId: string) => void;
  onRefreshCurrentUserProfile?: () => void;
}

export default function Profile({
  userId,
  currentUserProfile,
  onProfileClick,
  onRefreshCurrentUserProfile
}: ProfileProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPhotoURL, setEditPhotoURL] = useState("");
  const [editBannerURL, setEditBannerURL] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [saving, setSaving] = useState(false);

  // Follow State
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);

  const isOwnProfile = currentUserProfile?.uid === userId;
  const compositeFollowId = currentUserProfile ? `${currentUserProfile.uid}_${userId}` : "";

  // Subscribe/Fetch Profile Details
  useEffect(() => {
    setLoading(true);
    const docRef = doc(db, "users", userId);
    
    const unsubProfile = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const uProfile = { uid: snap.id, ...snap.data() } as UserProfile;
        setProfile(uProfile);
        
        // Initializing editing fields
        setEditDisplayName(uProfile.displayName);
        setEditBio(uProfile.bio || "");
        setEditPhotoURL(uProfile.photoURL);
        setEditBannerURL(uProfile.bannerURL || "");
        setEditUsername(uProfile.username);
      } else {
        console.warn("Targeted profile document record not found in Firestore users");
      }
      setLoading(false);
    }, (err) => {
      console.error("Profile sub error:", err);
      setLoading(false);
    });

    return () => unsubProfile();
  }, [userId]);

  // Subscribe to profile posts
  useEffect(() => {
    setPostsLoading(true);
    const postsRef = collection(db, "posts");
    const q = query(
      postsRef, 
      where("authorId", "==", userId), 
      orderBy("createdAt", "desc")
    );

    const unsubPosts = onSnapshot(q, (snap) => {
      const list: Post[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Post);
      });
      setPosts(list);
      setPostsLoading(false);
    }, (err) => {
      console.error("Posts collection fetch failure of profile index:", err);
      setPostsLoading(false);
    });

    return () => unsubPosts();
  }, [userId]);

  // Check Follow conditions
  useEffect(() => {
    if (!currentUserProfile || isOwnProfile) return;

    const followRef = doc(db, "followers", compositeFollowId);
    const unsubFollow = onSnapshot(followRef, (snap) => {
      setIsFollowing(snap.exists());
    }, () => {});

    return () => unsubFollow();
  }, [userId, currentUserProfile, isOwnProfile]);

  // Trigger Follow/Unfollow Transaction Batch
  const toggleFollow = async () => {
    if (!currentUserProfile || !profile) return;

    const followRef = doc(db, "followers", compositeFollowId);
    const loggedInUserRef = doc(db, "users", currentUserProfile.uid);
    const targetUserRef = doc(db, "users", userId);
    const batch = writeBatch(db);

    try {
      if (isFollowing) {
        // Unfollow
        batch.delete(followRef);
        batch.update(loggedInUserRef, {
          followingCount: Math.max(0, (currentUserProfile.followingCount || 0) - 1)
        });
        batch.update(targetUserRef, {
          followersCount: Math.max(0, (profile.followersCount || 0) - 1)
        });
        setIsFollowing(false);
      } else {
        // Follow
        batch.set(followRef, {
          id: compositeFollowId,
          followerId: currentUserProfile.uid,
          followingId: userId,
          createdAt: new Date()
        });
        batch.update(loggedInUserRef, {
          followingCount: (currentUserProfile.followingCount || 0) + 1
        });
        batch.update(targetUserRef, {
          followersCount: (profile.followersCount || 0) + 1
        });
        setIsFollowing(true);

        // Dispatch alert notification
        const notifyRef = doc(collection(db, "notifications"));
        batch.set(notifyRef, {
          id: notifyRef.id,
          recipientId: userId,
          senderId: currentUserProfile.uid,
          senderUsername: currentUserProfile.username,
          senderPhotoURL: currentUserProfile.photoURL,
          type: "FOLLOW",
          targetId: currentUserProfile.uid,
          contentSnippet: "commenced following your profile channel.",
          isRead: false,
          createdAt: new Date()
        });
      }

      await batch.commit();
      onRefreshCurrentUserProfile?.();
    } catch (err) {
      console.error("Follow transaction batch execution failure:", err);
    }
  };

  // Submit Profile Changes
  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !currentUserProfile) return;
    setSaving(true);

    try {
      const userRef = doc(db, "users", profile.uid);
      await updateDoc(userRef, {
        displayName: editDisplayName.trim(),
        username: editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
        bio: editBio.trim(),
        photoURL: editPhotoURL.trim(),
        bannerURL: editBannerURL.trim()
      });

      setIsEditing(false);
      onRefreshCurrentUserProfile?.();
      alert("Biography and display nodes aligned successfully.");
    } catch (err) {
      console.error("Profile saving error:", err);
      alert("Error committed: Check input constraints or rules security limit.");
    } finally {
      setSaving(false);
    }
  };

  // Request premium verified badge (mock verification trigger)
  const handleRequestVerification = async () => {
    if (!profile) return;
    if (profile.isVerified) {
      alert("Your profile handle has already attained the Gold Verified identity badge.");
      return;
    }

    try {
      const reportRef = doc(collection(db, "reports"));
      await setDoc(reportRef, {
        id: reportRef.id,
        reporterId: userId,
        targetType: "USER",
        targetId: userId,
        reason: "User requested premium verified certification badge.",
        status: "PENDING",
        createdAt: new Date()
      });
      alert("Verification requested. Pulse engineers will inspect your timeline for verification eligibility.");
    } catch (err) {
      console.error("Verification submit error:", err);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <RotateCw className="w-8 h-8 text-zinc-550 animate-spin mx-auto mb-2" />
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest block leading-none">Accessing handle nodes...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20 text-center text-zinc-400">
        <p className="font-semibold text-sm">Requested trace profile missing.</p>
        <p className="text-[11px] text-zinc-600 font-mono mt-1">Check UID exists.</p>
      </div>
    );
  }

  return (
    <div id="profile-root" className="flex-1 max-w-2xl text-left">
      
      {/* Banner Area */}
      <div className="relative h-44 bg-zinc-950 border-b border-zinc-900 w-full overflow-hidden">
        {profile.bannerURL ? (
          <img
            src={profile.bannerURL}
            alt="User banner cover"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950" />
        )}
      </div>

      {/* Profile Details Header */}
      <div className="px-6 relative pb-6 border-b border-zinc-900/50 mb-6">
        
        {/* Profile Photo */}
        <div className="absolute -top-12 left-6">
          <img
            src={profile.photoURL}
            alt={profile.displayName}
            className="w-24 h-24 rounded-full border-4 border-black object-cover bg-zinc-950"
          />
        </div>

        {/* Action button row (Edit details vs Follow) */}
        <div className="flex justify-end pt-4 gap-2 mb-4">
          {isOwnProfile ? (
            <>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-4 py-2 bg-zinc-950 border border-zinc-800 text-xs font-semibold rounded-xl text-white hover:bg-zinc-900 cursor-pointer flex items-center gap-1.5 transition-all select-none"
              >
                <Edit className="w-3.5 h-3.5 shrink-0" />
                <span>Adjust Profile</span>
              </button>
              
              <button
                onClick={handleRequestVerification}
                className="px-4 py-2 bg-zinc-950 border border-zinc-800 text-xs font-semibold rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-900 cursor-pointer flex items-center gap-1.5 transition-all"
                title="Verify timeline identity badge"
              >
                <Award className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>Verify ID</span>
              </button>
            </>
          ) : (
            <button
              onClick={toggleFollow}
              className={`px-5.5 py-2 rounded-xl text-xs font-black select-none cursor-pointer transition-all ${
                isFollowing 
                  ? "bg-zinc-900 text-white border border-zinc-801 hover:border-red-900 hover:text-red-400" 
                  : "bg-white text-black hover:bg-zinc-200"
              }`}
            >
              {isFollowing ? (
                <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Following</span>
              ) : (
                <span className="flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Follow</span>
              )}
            </button>
          )}
        </div>

        {/* Display Text details */}
        <div className="mt-8 space-y-2">
          <div>
            <h1 className="text-xl font-bold font-serif text-white flex items-center gap-1.5">
              <span>{profile.displayName}</span>
              {profile.isVerified && (
                <span title="Gold Checked Profile">
                  <CheckCircle2 className="w-4.5 h-4.5 text-white fill-white shrink-0" />
                </span>
              )}
            </h1>
            <span className="text-xs font-mono text-zinc-500">@{profile.username}</span>
          </div>

          <p className="text-sm font-sans text-zinc-250 pr-4 leading-relaxed max-w-xl whitespace-pre-wrap">
            {profile.bio || "No biography updated."}
          </p>

          {/* Joined date */}
          <div className="flex items-center gap-3.5 pt-1.5 text-[11px] font-mono text-zinc-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-650" /> Joined {formatDate(profile.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-zinc-650" /> Pulse Certified ID
            </span>
          </div>

          {/* Counts indices */}
          <div className="flex items-center gap-5 pt-3 text-xs font-mono text-zinc-400">
            <div className="hover:text-white transition-all cursor-pointer">
              <strong className="text-white text-sm mr-1">{profile.followingCount || 0}</strong>
              <span className="text-[11px] text-zinc-500">Following</span>
            </div>
            <div className="hover:text-white transition-all cursor-pointer">
              <strong className="text-white text-sm mr-1">{profile.followersCount || 0}</strong>
              <span className="text-[11px] text-zinc-500">Followers</span>
            </div>
            <div>
              <strong className="text-white text-sm mr-1">{profile.postsCount || posts.length}</strong>
              <span className="text-[11px] text-zinc-500">Posts</span>
            </div>
          </div>
        </div>
      </div>

      {/* ADJUST PROFILE DETAILS PANEL MODAL */}
      {isEditing && (
        <section className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 mb-6 mx-4 md:mx-0">
          <h2 className="text-sm font-black uppercase text-zinc-300 tracking-wider mb-5">Adjust Account Attributes</h2>
          
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1.5 tracking-wider">Display Name</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                  placeholder="Your display text"
                  maxLength={50}
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1.5 tracking-wider">Username Handle</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-[11.5px] text-xs font-mono text-zinc-550">@</span>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    className="w-full pl-8 pr-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-zinc-700 font-mono"
                    placeholder="handle"
                    maxLength={30}
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1.5 tracking-wider">Biography</label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full h-20 px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 font-serif leading-relaxed"
                placeholder="Write bios snippet..."
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1.5 tracking-wider">Profile Photo URI link</label>
                <input
                  type="url"
                  value={editPhotoURL}
                  onChange={(e) => setEditPhotoURL(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 font-mono"
                  placeholder="https://..."
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-zinc-550 mb-1.5 tracking-wider">Banner Cover Cover Image link</label>
                <input
                  type="url"
                  value={editBannerURL}
                  onChange={(e) => setEditBannerURL(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 font-mono"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-zinc-900 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5.5 py-2 bg-white text-black font-semibold rounded-xl text-xs hover:bg-zinc-200 transition-all cursor-pointer disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Adjustments"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* USERTIMELINE LIST VIEW */}
      <div className="px-4 md:px-0">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-zinc-600" /> User Timeline Chronology
        </h3>

        {postsLoading ? (
          <div className="py-12 text-center">
            <RotateCw className="w-6 h-6 text-zinc-550 animate-spin mx-auto mb-2" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">Querying timeline...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center border border-zinc-900 rounded-2xl bg-zinc-950/10">
            <p className="text-xs text-zinc-600 italic">No posts published by @{profile.username} yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserProfile={currentUserProfile}
                onProfileClick={onProfileClick}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
