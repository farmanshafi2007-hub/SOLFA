import { useState, useEffect, FormEvent } from "react";
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Post, UserProfile } from "../types";
import PostCard from "./PostCard";
import { 
  Sparkles, 
  TrendingUp, 
  Clock, 
  RotateCw, 
  PenSquare, 
  CheckCircle2, 
  AlertTriangle 
} from "lucide-react";

interface FeedProps {
  currentUserProfile: UserProfile | null;
  onProfileClick?: (userId: string) => void;
  onTagClick?: (tag: string) => void;
}

export default function Feed({
  currentUserProfile,
  onProfileClick,
  onTagClick
}: FeedProps) {
  const [activeSubTab, setActiveSubTab] = useState<"NEW" | "TRENDING">("NEW");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // Compose State
  const [composeText, setComposeText] = useState("");
  const [posting, setPosting] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Direct list trends from API or static failover
  const [apiTrends, setApiTrends] = useState<{ tag: string; volume: string; category: string }[]>([]);

  // Fetch API Trends
  useEffect(() => {
    fetch("/api/trends")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setApiTrends(data);
      })
      .catch(() => {});
  }, []);

  // Fetch Firestore Posts
  useEffect(() => {
    setLoading(true);
    const postsRef = collection(db, "posts");
    
    // Build query based on active sub tab
    const q = activeSubTab === "NEW" 
      ? query(postsRef, orderBy("createdAt", "desc"), limit(40))
      : query(postsRef, orderBy("likesCount", "desc"), limit(45));

    const unsubPosts = onSnapshot(q, (snap) => {
      const list: Post[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Post);
      });
      setPosts(list);
      setLoading(false);
    }, (err) => {
      console.error("Firestore posts fetch error:", err);
      // Fallback placeholder
      setLoading(false);
    });

    return () => unsubPosts();
  }, [activeSubTab]);

  // Publish handle
  const handlePublishPost = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile || !composeText.trim()) return;
    if (composeText.length > 500) {
      alert("Posts are strictly restricted to 500 characters.");
      return;
    }

    setPosting(true);
    setWarningMessage(null);

    try {
      // 1. Moderate content via server-side endpoint first! (Zero Trust)
      const res = await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: composeText })
      });
      const check = await res.json();
      
      if (check && !check.approved) {
        setWarningMessage(`Submission rejected: ${check.reason}`);
        setPosting(false);
        return;
      }

      // 2. Write to Firestore safely
      const newPostRef = doc(collection(db, "posts"));
      const authorPhotoURL = currentUserProfile.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUserProfile.username}`;
      
      await setDoc(newPostRef, {
        id: newPostRef.id,
        authorId: currentUserProfile.uid,
        authorUsername: currentUserProfile.username,
        authorDisplayName: currentUserProfile.displayName,
        authorPhotoURL: authorPhotoURL,
        content: composeText.trim(),
        createdAt: new Date(),
        likesCount: 0,
        commentsCount: 0,
        repostsCount: 0,
        isRepost: false
      });

      setComposeText("");
    } catch (err: any) {
      console.error("Firestore write failure:", err);
      alert("Post publication failed due to network sync errors.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div id="feed-root" className="flex-1 max-w-2xl px-4 md:px-0">
      
      {/* Upper header */}
      <header className="sticky top-0 bg-black/85 backdrop-blur-md z-30 border-b border-zinc-900/60 pb-3 flex items-center justify-between pointer-events-auto">
        <h2 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-white stroke-[1.5]" />
          <span>Pulse Feed</span>
        </h2>

        {/* FEED MODE BUTTONS TOGGLER */}
        <div className="flex bg-zinc-950 p-1 border border-zinc-900 rounded-xl">
          <button
            onClick={() => setActiveSubTab("NEW")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all ${
              activeSubTab === "NEW" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-white"
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Latest</span>
          </button>
          <button
            onClick={() => setActiveSubTab("TRENDING")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all ${
              activeSubTab === "TRENDING" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-white"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span>Popular</span>
          </button>
        </div>
      </header>

      {/* COMPOSER PANEL */}
      {currentUserProfile && (
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 my-5 relative">
          {warningMessage && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-900/45 rounded-xl flex items-start gap-2.5">
              <AlertTriangle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
              <span className="text-xs text-red-200">{warningMessage}</span>
            </div>
          )}

          <form onSubmit={handlePublishPost} className="space-y-4">
            <div className="flex gap-4">
              <img
                src={currentUserProfile.photoURL}
                alt={currentUserProfile.displayName}
                className="w-10 h-10 rounded-full bg-zinc-900 object-cover shrink-0"
              />
              <div className="flex-1">
                <textarea
                  value={composeText}
                  onChange={(e) => {
                    setComposeText(e.target.value);
                    if (warningMessage) setWarningMessage(null);
                  }}
                  className="w-full min-h-[90px] bg-transparent text-sm text-zinc-250 placeholder-zinc-600 focus:outline-none resize-none font-serif leading-relaxed"
                  placeholder="What is pulsing in your stream? State short updates..."
                  maxLength={500}
                  required
                />
              </div>
            </div>

            {/* Compose indicators */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-900/65">
              <div className="text-[10px] font-mono text-zinc-500">
                <span className={composeText.length > 450 ? "text-amber-500" : ""}>
                  {composeText.length}
                </span>
                <span>/500 characters</span>
              </div>
              
              <button
                type="submit"
                disabled={posting || !composeText.trim()}
                className="bg-white hover:bg-zinc-200 text-black px-4.5 py-1.8 rounded-xl font-medium text-xs select-none cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5"
              >
                {posting ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <PenSquare className="w-3.5 h-3.5" />
                    <span>Publish</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TRENDING BAR QUICK BANNER */}
      {apiTrends.length > 0 && activeSubTab === "TRENDING" && (
        <section className="bg-zinc-950/40 border border-zinc-900/60 rounded-2xl p-4 mb-6 hover:border-zinc-800 transition-all text-left">
          <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-zinc-500" /> Dynamic trending tags
          </span>
          <div className="flex flex-wrap gap-2">
            {apiTrends.map((trend, i) => (
              <button
                key={i}
                onClick={() => onTagClick?.(trend.tag)}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-2 border border-zinc-900/40"
              >
                <span className="text-white font-semibold">{trend.tag}</span>
                <span className="text-[9px] font-mono text-zinc-500">{trend.volume}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* POSTS TIMELINE RENDERING */}
      {loading ? (
        <div className="py-20 flex flex-col justify-center items-center gap-3">
          <RotateCw className="w-7 h-7 text-zinc-500 animate-spin" />
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest leading-none">Syncing stream...</span>
        </div>
      ) : posts.length === 0 ? (
        <div className="py-28 border border-zinc-900 rounded-2xl bg-zinc-950/20 text-center select-none flex flex-col items-center justify-center p-8">
          <PenSquare className="w-9 h-9 text-zinc-800 mb-3" />
          <h4 className="text-zinc-400 font-semibold text-sm tracking-tight mb-1">Silence inside details</h4>
          <p className="text-xs text-zinc-650 max-w-[280px]">Be the developer of events. Publish the very first pulse update on this platform.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserProfile={currentUserProfile}
              onProfileClick={onProfileClick}
              onTagClick={onTagClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
