import { useState, useEffect, FormEvent } from "react";
import { Post, Comment, UserProfile } from "../types";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  writeBatch 
} from "firebase/firestore";
import { 
  Heart, 
  MessageCircle, 
  Repeat2, 
  Share2, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  PlusCircle, 
  CornerDownRight, 
  Clock,
  X 
} from "lucide-react";

interface PostCardProps {
  post: Post;
  currentUserProfile: UserProfile | null;
  onProfileClick?: (userId: string) => void;
  onTagClick?: (tag: string) => void;
}

export default function PostCard({
  post,
  currentUserProfile,
  onProfileClick,
  onTagClick
}: PostCardProps) {
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likesCount || 0);
  const [reposting, setReposting] = useState(false);
  const [repostsCount, setRepostsCount] = useState(post.repostsCount || 0);

  // Comments state
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commenting, setCommenting] = useState(false);

  // Overlay state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);

  // Link share status
  const [shareCopied, setShareCopied] = useState(false);

  // Check if like exists
  const compositeLikeId = currentUserProfile ? `${currentUserProfile.uid}_${post.id}` : "";

  useEffect(() => {
    if (!currentUserProfile) return;
    const likeRef = doc(db, "likes", compositeLikeId);
    
    // Subscribe to like doc state
    const unsubLike = onSnapshot(likeRef, (snap) => {
      setLiked(snap.exists());
    }, (err) => {
      console.warn("Permission denied listening to specific like.");
    });

    return () => unsubLike();
  }, [post.id, currentUserProfile]);

  // Subscribe to comments
  useEffect(() => {
    if (!showComments) return;

    const commentsRef = collection(db, "comments");
    const q = query(
      commentsRef, 
      where("postId", "==", post.id), 
      orderBy("createdAt", "asc")
    );

    const unsubComments = onSnapshot(q, (snap) => {
      const list: Comment[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Comment);
      });
      setComments(list);
    }, (err) => {
      console.error("Failed comments retrieval:", err);
    });

    return () => unsubComments();
  }, [post.id, showComments]);

  // Handle Like/Unlike
  const toggleLike = async () => {
    if (!currentUserProfile) return;

    const likeRef = doc(db, "likes", compositeLikeId);
    const postRef = doc(db, "posts", post.id);
    const batch = writeBatch(db);

    try {
      if (liked) {
        // Unlike
        batch.delete(likeRef);
        batch.update(postRef, {
          likesCount: Math.max(0, likesCount - 1)
        });
        setLikesCount(Math.max(0, likesCount - 1));
        setLiked(false);
      } else {
        // Like
        batch.set(likeRef, {
          id: compositeLikeId,
          userId: currentUserProfile.uid,
          postId: post.id,
          createdAt: new Date()
        });
        batch.update(postRef, {
          likesCount: likesCount + 1
        });
        setLikesCount(likesCount + 1);
        setLiked(true);

        // Dispatch a real notification if not self-action
        if (currentUserProfile.uid !== post.authorId) {
          const notifyRef = doc(collection(db, "notifications"));
          batch.set(notifyRef, {
            id: notifyRef.id,
            recipientId: post.authorId,
            senderId: currentUserProfile.uid,
            senderUsername: currentUserProfile.username,
            senderPhotoURL: currentUserProfile.photoURL,
            type: "LIKE",
            targetId: post.id,
            contentSnippet: post.content.substring(0, 50),
            isRead: false,
            createdAt: new Date()
          });
        }
      }

      await batch.commit();
    } catch (error) {
      console.error("Failed toggleLike:", error);
      try {
        handleFirestoreError(error, OperationType.WRITE, "likes");
      } catch (err) {}
    }
  };

  // Create Mirror / Repost
  const handleRepost = async () => {
    if (!currentUserProfile) return;
    if (reposting) return;
    setReposting(true);

    try {
      const batch = writeBatch(db);
      const newPostRef = doc(collection(db, "posts"));
      
      batch.set(newPostRef, {
        id: newPostRef.id,
        authorId: currentUserProfile.uid,
        authorUsername: currentUserProfile.username,
        authorDisplayName: currentUserProfile.displayName,
        authorPhotoURL: currentUserProfile.photoURL,
        content: `Reposted from @${post.authorUsername}: ${post.content.substring(0, 300)}`,
        createdAt: new Date(),
        likesCount: 0,
        commentsCount: 0,
        repostsCount: 0,
        isRepost: true,
        repostedPostId: post.id,
        repostedAuthorName: post.authorDisplayName
      });

      // Increment original post reposts count
      const originalPostRef = doc(db, "posts", post.id);
      batch.update(originalPostRef, {
        repostsCount: repostsCount + 1
      });

      // Dispatch a notification
      if (currentUserProfile.uid !== post.authorId) {
        const notifyRef = doc(collection(db, "notifications"));
        batch.set(notifyRef, {
          id: notifyRef.id,
          recipientId: post.authorId,
          senderId: currentUserProfile.uid,
          senderUsername: currentUserProfile.username,
          senderPhotoURL: currentUserProfile.photoURL,
          type: "REPOST",
          targetId: post.id,
          contentSnippet: `mirrored your update.`,
          isRead: false,
          createdAt: new Date()
        });
      }

      await batch.commit();
      setRepostsCount(repostsCount + 1);
      alert("Post mirrored to your timeline successfully.");
    } catch (err) {
      console.error("Repost failed:", err);
    } finally {
      setReposting(false);
    }
  };

  // Submit Comment
  const submitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile || !newComment.trim()) return;
    setCommenting(true);

    try {
      // Moderate content first to stop toxic replies!
      const modRes = await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment })
      });
      const modCheck = await modRes.json();
      if (modCheck && !modCheck.approved) {
        alert(`Moderation Warning: ${modCheck.reason}`);
        setCommenting(false);
        return;
      }

      const batch = writeBatch(db);
      const commentRef = doc(collection(db, "comments"));
      
      batch.set(commentRef, {
        id: commentRef.id,
        postId: post.id,
        authorId: currentUserProfile.uid,
        authorUsername: currentUserProfile.username,
        authorDisplayName: currentUserProfile.displayName,
        authorPhotoURL: currentUserProfile.photoURL,
        content: newComment.trim(),
        createdAt: new Date()
      });

      // Bump comments count on original post
      const postRef = doc(db, "posts", post.id);
      batch.update(postRef, {
        commentsCount: (post.commentsCount || 0) + 1
      });

      // Send real notification
      if (currentUserProfile.uid !== post.authorId) {
        const notifyRef = doc(collection(db, "notifications"));
        batch.set(notifyRef, {
          id: notifyRef.id,
          recipientId: post.authorId,
          senderId: currentUserProfile.uid,
          senderUsername: currentUserProfile.username,
          senderPhotoURL: currentUserProfile.photoURL,
          type: "COMMENT",
          targetId: post.id,
          contentSnippet: newComment.substring(0, 50),
          isRead: false,
          createdAt: new Date()
        });
      }

      await batch.commit();
      setNewComment("");
    } catch (err: any) {
      console.error("Comments creation error:", err);
    } finally {
      setCommenting(false);
    }
  };

  // Report Abuse
  const submitReport = async () => {
    if (!currentUserProfile || !reportReason.trim()) return;
    setReporting(true);

    try {
      const reportRef = doc(collection(db, "reports"));
      await setDoc(reportRef, {
        id: reportRef.id,
        reporterId: currentUserProfile.uid,
        targetType: "POST",
        targetId: post.id,
        reason: reportReason.trim(),
        status: "PENDING",
        createdAt: new Date()
      });
      alert("This post has been reported for review. Thank you for keeping Pulse clean.");
      setShowReportModal(false);
      setReportReason("");
    } catch (err) {
      console.error("Report submit error:", err);
    } finally {
      setReporting(false);
    }
  };

  // Post Deletion logic
  const handleDeletePost = async () => {
    if (!currentUserProfile) return;
    const canDelete = currentUserProfile.uid === post.authorId || currentUserProfile.uid === "farmanshafi2007@gmail.com";
    if (!canDelete) return;

    if (confirm("Are you sure you want to permanently erase this update? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "posts", post.id));
        alert("Erase accomplished successfully.");
      } catch (err) {
        console.error("Failed deleting post:", err);
      }
    }
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  // Formatting date string nicely
  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Convert plaintext hashtags and handles to clickable links
  const renderFormattedContent = (content: string) => {
    const tokens = content.split(/(\s+)/);
    return tokens.map((part, index) => {
      if (part.startsWith("#") && part.length > 1) {
        return (
          <button
            key={index}
            onClick={() => onTagClick?.(part)}
            className="text-white font-semibold hover:underline bg-zinc-900/40 text-xs px-1.5 py-0.5 rounded cursor-pointer transition-all inline-block"
          >
            {part}
          </button>
        );
      }
      if (part.startsWith("@") && part.length > 1) {
        const handle = part.replace(/[^a-zA-Z0-9_]/g, "");
        return (
          <button
            key={index}
            onClick={() => {
              // Extract profile ID if we can or treat handle click
              if (onProfileClick) onProfileClick(handle);
            }}
            className="text-zinc-300 font-mono text-xs hover:underline cursor-pointer"
          >
            {part}
          </button>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const isAuthorOrAdmin = currentUserProfile && (currentUserProfile.uid === post.authorId || currentUserProfile.uid === "farmanshafi2007@gmail.com");

  return (
    <article className="border border-zinc-900 bg-zinc-950/80 rounded-2xl p-5 backdrop-blur-md relative overflow-hidden transition-all hover:border-zinc-800 hover:shadow-xl hover:shadow-white/[0.01] group mb-4">
      
      {/* Mirror Header */}
      {post.isRepost && (
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-zinc-500 mb-3.5 pb-2 border-b border-zinc-900/40">
          <Repeat2 className="w-3.5 h-3.5 text-zinc-500" />
          <span>Mirrored from {post.repostedAuthorName} timeline</span>
        </div>
      )}

      {/* Main post layout */}
      <div className="flex gap-4">
        {/* Author Photo */}
        <div className="shrink-0">
          <img
            src={post.authorPhotoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${post.authorUsername}`}
            alt={post.authorDisplayName}
            onClick={() => onProfileClick?.(post.authorId)}
            className="w-10 h-10 rounded-full bg-zinc-900 object-cover cursor-pointer hover:opacity-80 transition-all border border-zinc-900"
          />
        </div>

        {/* Content Section */}
        <div className="flex-1 min-w-0">
          <header className="flex items-start justify-between gap-2 mb-1.5">
            <div 
              className="text-left cursor-pointer"
              onClick={() => onProfileClick?.(post.authorId)}
            >
              <div className="font-semibold text-xs text-white flex items-center gap-1 leading-snug">
                <span>{post.authorDisplayName}</span>
                {post.authorId === "farmanshafi2007@gmail.com" && (
                  <span title="Verified Creator">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white fill-white" />
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                @{post.authorUsername}
              </span>
            </div>

            <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-mono">
              <Clock className="w-3 h-3 text-zinc-600" />
              <span>{formatDate(post.createdAt)}</span>
            </div>
          </header>

          <p className="text-sm text-zinc-200 leading-relaxed break-words mb-4 text-left whitespace-pre-wrap selection:bg-white select-text font-serif max-w-full">
            {renderFormattedContent(post.content)}
          </p>

          {/* Foot Action Buttons */}
          <footer className="flex items-center justify-between text-zinc-500 pt-3 border-t border-zinc-900/30">
            {/* LIKES button */}
            <button
              onClick={toggleLike}
              className={`flex items-center gap-1.5 text-xs font-mono transition-all hover:text-red-400 group/btn cursor-pointer ${
                liked ? "text-white font-semibold" : ""
              }`}
            >
              <Heart className={`w-[15px] h-[15px] transition-transform group-active/btn:scale-125 ${
                liked ? "fill-white text-white scale-110" : "text-zinc-600 group-hover/btn:text-red-400"
              }`} />
              <span>{likesCount}</span>
            </button>

            {/* REPLY comments button */}
            <button
              onClick={() => setShowComments(!showComments)}
              className={`flex items-center gap-1.5 text-xs font-mono transition-all hover:text-white group/btn cursor-pointer ${
                showComments ? "text-white" : ""
              }`}
            >
              <MessageCircle className={`w-[15px] h-[15px] ${showComments ? "text-white" : "text-zinc-600 group-hover/btn:text-white"}`} />
              <span>{comments.length || post.commentsCount || 0}</span>
            </button>

            {/* REPOST button */}
            <button
              onClick={handleRepost}
              className="flex items-center gap-1.5 text-xs font-mono transition-all hover:text-zinc-300 group/btn cursor-pointer"
              title="Mirror timeline"
            >
              <Repeat2 className="w-[15px] h-[15px] text-zinc-600 group-hover/btn:text-zinc-300" />
              <span>{repostsCount}</span>
            </button>

            {/* SHARE COPY link */}
            <button
              onClick={copyShareLink}
              className={`flex items-center gap-1.5 text-xs font-mono transition-all hover:text-zinc-350 cursor-pointer ${
                shareCopied ? "text-zinc-300" : ""
              }`}
              title="Copy deep link"
            >
              <Share2 className="w-[15px] h-[15px] text-zinc-650 shrink-0" />
              <span>{shareCopied ? "Copied" : "Share"}</span>
            </button>

            {/* Auxiliary actions: Report, Admin action */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowReportModal(true)}
                className="p-1 px-1.5 rounded-lg text-zinc-600 hover:text-amber-500 hover:bg-zinc-900/60 transition-all cursor-pointer"
                title="Report Post"
              >
                <AlertTriangle className="w-[13px] h-[13px]" />
              </button>

              {isAuthorOrAdmin && (
                <button
                  onClick={handleDeletePost}
                  className="p-1 px-1.5 rounded-lg text-zinc-600 hover:text-red-500 hover:bg-zinc-900/60 transition-all cursor-pointer animate-pulse"
                  title="Erase Post"
                >
                  <Trash2 className="w-[13px] h-[13px]" />
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>

      {/* Accordion Reply list Drawer */}
      {showComments && (
        <section className="mt-5 pt-4 border-t border-zinc-900 text-left">
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1">
            <CornerDownRight className="w-3.5 h-3.5" /> Dialogue thread
          </h3>

          <div className="space-y-3 max-h-60 overflow-y-auto mb-4 border-l border-zinc-900 pl-3">
            {comments.length === 0 ? (
              <p className="text-xs text-zinc-600 italic py-2">No comments published yet. Be primary.</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="text-left text-sm py-1 border-b border-zinc-900/40 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-xs text-white">{comment.authorDisplayName}</span>
                    <span className="text-[10px] font-mono text-zinc-500">@{comment.authorUsername}</span>
                    <span className="text-[10px] font-mono text-zinc-600 ml-auto">{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="text-zinc-305 text-xs font-serif leading-relaxed pr-2">{comment.content}</p>
                </div>
              ))
            )}
          </div>

          {currentUserProfile && (
            <form onSubmit={submitComment} className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Compose response dialog text..."
                maxLength={250}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-zinc-700 transition-all font-serif"
                required
              />
              <button
                type="submit"
                disabled={commenting}
                className="bg-white text-black px-4 py-2 rounded-xl text-xs font-semibold hover:bg-zinc-200 cursor-pointer disabled:opacity-50"
              >
                Send
              </button>
            </form>
          )}
        </section>
      )}

      {/* Moderation reporting popup modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-[400px] p-6 relative">
            <button
              onClick={() => setShowReportModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-semibold mb-2 text-white">Report Content</h3>
            <p className="text-xs text-zinc-400 mb-4 leading-tight">
              Submit abuse reports for spam, harassment, hate speech, or offensive content. Action will be taken content-wide by admins.
            </p>

            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="State clear reasons or violating tags of the post..."
              className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-550 focus:outline-none focus:border-zinc-700 mb-4 font-serif"
              maxLength={500}
              required
            />

            <button
              onClick={submitReport}
              disabled={reporting || !reportReason.trim()}
              className="w-full bg-red-650 hover:bg-red-700 text-white font-medium text-xs py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              {reporting ? "Filing..." : "Submit Abuse Report"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
