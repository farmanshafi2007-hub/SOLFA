import { useState, useEffect } from "react";
import { collection, getDocs, onSnapshot, query, limit } from "firebase/firestore";
import { db } from "../firebase";
import { Post, UserProfile } from "../types";
import PostCard from "./PostCard";
import { Search as SearchIcon, UserPlus, FileText, CheckCircle2, TrendingUp, AlertCircle, Sparkles } from "lucide-react";

interface SearchProps {
  currentUserProfile: UserProfile | null;
  onProfileClick?: (userId: string) => void;
  onTagClick?: (tag: string) => void;
  suggestedTag?: string; // Prepopulate if clicked from post
}

export default function Search({
  currentUserProfile,
  onProfileClick,
  onTagClick,
  suggestedTag
}: SearchProps) {
  const [searchQuery, setSearchQuery] = useState(suggestedTag || "");
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [postsList, setPostsList] = useState<Post[]>([]);

  // Filtered outcomes
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);

  const [loading, setLoading] = useState(false);
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

  // Prepopulate query if clicked through tags in cards
  useEffect(() => {
    if (suggestedTag) {
      setSearchQuery(suggestedTag);
    }
  }, [suggestedTag]);

  // Load all users and posts to filter securely
  useEffect(() => {
    const fetchDataset = async () => {
      setLoading(true);
      try {
        // Fetch posts
        const postsSnap = await getDocs(collection(db, "posts"));
        const postsData: Post[] = [];
        postsSnap.forEach((doc) => {
          postsData.push({ id: doc.id, ...doc.data() } as Post);
        });
        setPostsList(postsData);

        // Fetch users
        const usersSnap = await getDocs(collection(db, "users"));
        const usersData: UserProfile[] = [];
        usersSnap.forEach((doc) => {
          usersData.push({ uid: doc.id, ...doc.data() } as UserProfile);
        });
        setUsersList(usersData);
      } catch (err) {
        console.error("Failed fetching search base datasets:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDataset();
  }, []);

  // Trigger filtering when query changes
  useEffect(() => {
    const text = searchQuery.trim().toLowerCase();
    if (!text) {
      setFilteredUsers([]);
      setFilteredPosts([]);
      return;
    }

    if (text.startsWith("#")) {
      // Filter posts matching tag exactly
      const matched = postsList.filter(
        p => p.content.toLowerCase().includes(text)
      );
      setFilteredPosts(matched);
      setFilteredUsers([]);
    } else {
      // Filter users matching handle or display name
      const matchedUsers = usersList.filter(
        u => u.username.toLowerCase().includes(text) || u.displayName.toLowerCase().includes(text)
      );
      setFilteredUsers(matchedUsers);

      // Filter posts matching general content
      const matchedPosts = postsList.filter(
        p => p.content.toLowerCase().includes(text)
      );
      setFilteredPosts(matchedPosts);
    }
  }, [searchQuery, usersList, postsList]);

  return (
    <div id="search-root" className="flex-1 max-w-2xl px-4 md:px-0 text-left">
      
      {/* Title */}
      <h2 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2 mb-6 sticky top-0 bg-black py-3 z-30">
        <SearchIcon className="w-5 h-5 text-white" />
        <span>Explore Arena</span>
      </h2>

      {/* Input box */}
      <div className="relative mb-8">
        <SearchIcon className="absolute left-4 top-[14px] w-[17px] h-[17px] text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Explore user handles, hashtags (#DevWeek), or general terms..."
          className="w-full pl-11 pr-4 py-3 bg-zinc-950 border border-zinc-900 rounded-2xl text-sm text-white placeholder-zinc-650 focus:outline-none focus:border-zinc-700 transition-all font-serif shadow-inner"
        />
      </div>

      {loading && (
        <p className="text-xs text-zinc-500 font-mono text-center">Reading indices database records...</p>
      )}

      {/* MATCHED VIEWS */}
      {!searchQuery.trim() ? (
        <div className="space-y-8">
          {/* Default suggestion tags list */}
          {apiTrends.length > 0 ? (
            <section className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6">
              <h3 className="text-sm font-semibold mb-1 flex items-center gap-2 text-white">
                <TrendingUp className="w-4 h-4 text-white" />
                Trending Topics Summary
              </h3>
              <p className="text-xs text-zinc-500 mb-5 leading-relaxed">Dynamic summarization aggregated worldwide in real time via Gemini API.</p>
              
              <div className="divide-y divide-zinc-900">
                {apiTrends.map((trend, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setSearchQuery(trend.tag);
                      onTagClick?.(trend.tag);
                    }}
                    className="py-3.5 flex items-center justify-between cursor-pointer group hover:opacity-85 transition-all"
                  >
                    <div>
                      <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider block mb-0.5">{trend.category}</span>
                      <span className="text-sm font-bold text-white group-hover:underline">{trend.tag}</span>
                    </div>
                    <span className="font-mono text-xs text-zinc-500">{trend.volume} posts</span>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="py-12 text-center rounded-2xl border border-zinc-900 bg-zinc-950/20">
              <Sparkles className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
              <p className="text-xs text-zinc-500 max-w-xs mx-auto">Explore is active. Key in tags, keywords, or profile handles above to retrieve database results.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8 pb-10">
          
          {/* Render Users */}
          {filteredUsers.length > 0 && (
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Users matching handle ({filteredUsers.length})
              </h3>
              
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 divide-y divide-zinc-900">
                {filteredUsers.map((user) => (
                  <div
                    key={user.uid}
                    onClick={() => onProfileClick?.(user.uid)}
                    className="py-3 flex items-center justify-between cursor-pointer hover:bg-zinc-950/60 transition-all px-2 "
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={user.photoURL}
                        alt={user.displayName}
                        className="w-10 h-10 rounded-full object-cover bg-zinc-900"
                      />
                      <div>
                        <div className="font-semibold text-xs text-white flex items-center gap-0.5 leading-none mb-0.5">
                          {user.displayName}
                          {user.isVerified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white fill-white shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">@{user.username}</span>
                      </div>
                    </div>
                    <button className="bg-white text-black font-semibold text-[10px] px-3.5 py-1.5 rounded-lg">View Biography</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Render Posts */}
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Posts matching queries ({filteredPosts.length})
            </h3>

            {filteredPosts.length === 0 ? (
              <div className="py-16 text-center border border-zinc-900 rounded-2xl bg-zinc-950/10">
                <AlertCircle className="w-6 h-6 text-zinc-800 mx-auto mb-2" />
                <h4 className="text-zinc-500 font-semibold text-xs tracking-tight">Zero matches found</h4>
                <p className="text-[10px] text-zinc-650 max-w-xs mx-auto">Verify the search parameters match actual content keywords.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPosts.map((post) => (
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
      )}

    </div>
  );
}
