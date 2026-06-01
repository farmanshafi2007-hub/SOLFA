import { useState, useEffect } from "react";
import { Notification, UserProfile } from "../types";
import { db } from "../firebase";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  writeBatch 
} from "firebase/firestore";
import { 
  Bell, 
  Heart, 
  MessageCircle, 
  UserPlus, 
  Repeat2, 
  ShieldCheck, 
  RotateCw,
  Mail
} from "lucide-react";

interface NotificationsProps {
  currentUserProfile: UserProfile | null;
  onProfileClick?: (userId: string) => void;
  onPostClick?: (postId: string) => void;
}

export default function Notifications({
  currentUserProfile,
  onProfileClick,
  onPostClick
}: NotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to recipient notifications feed
  useEffect(() => {
    if (!currentUserProfile) return;
    setLoading(true);

    const notifyRef = collection(db, "notifications");
    const q = query(
      notifyRef, 
      where("recipientId", "==", currentUserProfile.uid), 
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubNotifications = onSnapshot(q, (snap) => {
      const list: Notification[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Notification);
      });
      setNotifications(list);
      setLoading(false);

      // Instantly resolve / dismiss unreads in a secure atomic batch write
      const batch = writeBatch(db);
      snap.forEach((doc) => {
        const notif = doc.data() as Notification;
        if (!notif.isRead) {
          batch.update(doc.ref, { isRead: true });
        }
      });
      batch.commit().catch(() => {});
    }, (err) => {
      console.warn("Notifications read denial (Normal before first write / login):", err);
      setLoading(false);
    });

    return () => unsubNotifications();
  }, [currentUserProfile]);

  return (
    <div id="notifications-root" className="flex-1 max-w-2xl px-4 md:px-0 text-left">
      
      {/* Upper sticky top bar */}
      <h2 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2 mb-6 sticky top-0 bg-black py-3 z-30">
        <Bell className="w-5 h-5 text-white" />
        <span>Activity Stream</span>
      </h2>

      {loading ? (
        <div className="py-20 text-center">
          <RotateCw className="w-6 h-6 text-zinc-550 animate-spin mx-auto mb-2" />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block leading-none">Syncing feed events...</span>
        </div>
      ) : notifications.length === 0 ? (
        <div className="py-32 border border-zinc-900 rounded-2xl bg-zinc-950/20 text-center flex flex-col items-center justify-center p-8">
          <Bell className="w-10 h-10 text-zinc-850 mb-3" />
          <h4 className="text-zinc-400 font-semibold text-sm tracking-tight mb-1">Silence in notifications</h4>
          <p className="text-xs text-zinc-650 max-w-xs leading-normal">Interactions from other Pulse users like comments, profile follows, or likes will surface right here.</p>
        </div>
      ) : (
        <div className="space-y-4 pb-16">
          {notifications.map((notif) => {
            const isUnread = !notif.isRead;
            return (
              <div
                key={notif.id}
                className={`border border-zinc-900 rounded-2xl p-4 flex gap-4 backdrop-blur-md relative transition-all ${
                  isUnread ? "bg-zinc-90 w-full" : "bg-zinc-950/65"
                }`}
              >
                {/* Active alert indicator bullet point */}
                {isUnread && (
                  <span className="absolute top-4 right-4 w-2 h-2 bg-white rounded-full animate-pulse" />
                )}

                {/* Sub category Icons resolve */}
                <div className="shrink-0 mt-1">
                  {notif.type === "LIKE" && (
                    <Heart className="w-5 h-5 text-white fill-white" />
                  )}
                  {notif.type === "COMMENT" && (
                    <MessageCircle className="w-5 h-5 text-zinc-300" />
                  )}
                  {notif.type === "FOLLOW" && (
                    <UserPlus className="w-5 h-5 text-zinc-300" />
                  )}
                  {notif.type === "REPOST" && (
                    <Repeat2 className="w-5 h-5 text-zinc-455" />
                  )}
                  {notif.type === "MSG" && (
                    <Mail className="w-5 h-5 text-zinc-350" />
                  )}
                </div>

                {/* Info Text coordinates */}
                <div className="flex-1 text-left select-none">
                  <header className="flex items-center gap-2 mb-1.5">
                    <img
                      src={notif.senderPhotoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${notif.senderUsername}`}
                      alt={notif.senderUsername}
                      onClick={() => onProfileClick?.(notif.senderId)}
                      className="w-7 h-7 rounded-full object-cover bg-zinc-900 cursor-pointer hover:opacity-85"
                    />
                    <div className="text-xs">
                      <strong
                        onClick={() => onProfileClick?.(notif.senderId)}
                        className="text-white hover:underline cursor-pointer"
                      >
                        @{notif.senderUsername}
                      </strong>
                    </div>
                  </header>

                  <p className="text-xs text-zinc-300 font-serif leading-relaxed">
                    {notif.type === "FOLLOW" && "commenced following your profile channel."}
                    {notif.type === "LIKE" && "liked your update: "}
                    {notif.type === "COMMENT" && "replied to your update: "}
                    {notif.type === "REPOST" && "mirrored your timeline update: "}
                    {notif.type === "MSG" && "dispatched a direct message thread packet: "}
                  </p>

                  {/* Attachment body block */}
                  {notif.contentSnippet && (
                    <div 
                      onClick={() => {
                        if (notif.type === "MSG") {
                          if (onPostClick) onPostClick(notif.type); // Redirect messages tab
                        } else {
                          if (onPostClick) onPostClick(notif.targetId);
                        }
                      }}
                      className="mt-2.5 p-3.5 bg-black/60 border border-zinc-900 rounded-xl max-w-full text-[11px] font-mono text-zinc-500 hover:text-zinc-300 hover:border-zinc-800 transition-all cursor-pointer truncate"
                    >
                      {notif.contentSnippet}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
