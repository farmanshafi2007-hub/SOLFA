import { useState, useEffect, useRef, FormEvent } from "react";
import { Room, Message, UserProfile } from "../types";
import { db } from "../firebase";
import { 
  collection, 
  doc, 
  getDoc,
  getDocs,
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  writeBatch 
} from "firebase/firestore";
import { Mail, Send, RotateCw, User, MessageSquare, AlertCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react";

interface MessagesProps {
  currentUserProfile: UserProfile | null;
  onProfileClick?: (userId: string) => void;
}

export default function Messages({
  currentUserProfile,
  onProfileClick
}: MessagesProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(true);

  // New Chat form states
  const [showNewChatForm, setShowNewChatForm] = useState(false);
  const [targetUsername, setTargetUsername] = useState("");
  const [searchStatus, setSearchStatus] = useState<string | null>(null);

  // Participant resolution
  const [participantsMap, setParticipantsMap] = useState<{[uid: string]: UserProfile}>({});
  
  // Typing interval
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen to all conversation rooms where current user is a participant
  useEffect(() => {
    if (!currentUserProfile) return;
    setLoadingRooms(true);

    const roomsRef = collection(db, "rooms");
    const q = query(
      roomsRef, 
      where("participantIds", "array-contains", currentUserProfile.uid),
      orderBy("updatedAt", "desc")
    );

    const unsubRooms = onSnapshot(q, async (snap) => {
      const roomsList: Room[] = [];
      const outstandingUids = new Set<string>();

      snap.forEach((doc) => {
        const data = doc.data() as Room;
        roomsList.push({ id: doc.id, ...data });
        data.participantIds.forEach(id => {
          if (id !== currentUserProfile.uid && !participantsMap[id]) {
            outstandingUids.add(id);
          }
        });
      });

      // Synchronously resolve participant profile details
      if (outstandingUids.size > 0) {
        const updatedMap = { ...participantsMap };
        for (const uid of outstandingUids) {
          const docSnap = await getDoc(doc(db, "users", uid));
          if (docSnap.exists()) {
            updatedMap[uid] = docSnap.data() as UserProfile;
          }
        }
        setParticipantsMap(updatedMap);
      }

      setRooms(roomsList);
      setLoadingRooms(false);
    }, (err) => {
      console.warn("Rooms list subscription permission denied or empty:", err);
      setLoadingRooms(false);
    });

    return () => unsubRooms();
  }, [currentUserProfile]);

  // Listen to active room messages
  useEffect(() => {
    if (!activeRoom) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, "rooms", activeRoom.id, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubMessages = onSnapshot(q, (snap) => {
      const messagesList: Message[] = [];
      snap.forEach((doc) => {
        messagesList.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(messagesList);

      // Trigger auto scroll
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);

      // Trigger "Seen" flag updates for peer messages
      if (currentUserProfile) {
        const batch = writeBatch(db);
        snap.forEach((doc) => {
          const msg = doc.data() as Message;
          if (msg.senderId !== currentUserProfile.uid && !msg.isRead) {
            batch.update(doc.ref, { isRead: true });
          }
          // Mark room unreads synced
        });
        batch.commit().catch(() => {});
      }
    }, (err) => {
      console.error("Messages list fetch failed inside activeRoom:", err);
    });

    return () => unsubMessages();
  }, [activeRoom, currentUserProfile]);

  // Set typing status in room metadata
  useEffect(() => {
    if (!activeRoom || !currentUserProfile) return;
    
    const roomRef = doc(db, "rooms", activeRoom.id);
    updateDoc(roomRef, {
      [`typingStatus.${currentUserProfile.uid}`]: typing
    }).catch(() => {});

    // Timeout typing state after quiet
    if (typing) {
      const timer = setTimeout(() => {
        setTyping(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [typing, activeRoom, currentUserProfile]);

  // Create or start a chat chamber alphabetical sorted
  const startChatConversation = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile || !targetUsername.trim()) return;
    setSearchStatus("Searching database handle...");

    const checkUsername = targetUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (checkUsername === currentUserProfile.username) {
      setSearchStatus("You cannot establish direct messaging loops with yourself.");
      return;
    }

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("username", "==", checkUsername));
      const snap = await getDocs(q);

      if (snap.empty) {
        setSearchStatus("User profile handle matching that username does not exist on Pulse.");
        return;
      }

      const targetUser = snap.docs[0].data() as UserProfile;
      
      // Enforce alpha pairing ID to prevent orphaned redundant rooms
      const participantIds = [currentUserProfile.uid, targetUser.uid].sort();
      const roomId = `${participantIds[0]}_${participantIds[1]}`;

      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        await setDoc(roomRef, {
          id: roomId,
          participantIds: participantIds,
          updatedAt: new Date(),
          typingStatus: {
            [currentUserProfile.uid]: false,
            [targetUser.uid]: false
          }
        });
      }

      // Prepopulate target user details mapping list
      setParticipantsMap(prev => ({ ...prev, [targetUser.uid]: targetUser }));

      const currentRoomTarget: Room = {
        id: roomId,
        participantIds: participantIds,
        updatedAt: new Date()
      };

      setActiveRoom(currentRoomTarget);
      setShowNewChatForm(false);
      setTargetUsername("");
      setSearchStatus(null);
    } catch (err) {
      console.error("Failed creating chatroom:", err);
      setSearchStatus("An error occurred. Check security constraints rules.");
    }
  };

  // Dispatch Chat Message
  const dispatchMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile || !activeRoom || !newMessageText.trim()) return;

    const textToSend = newMessageText.trim();
    setNewMessageText("");

    try {
      const batch = writeBatch(db);
      
      const messageColRef = collection(db, "rooms", activeRoom.id, "messages");
      const msgRef = doc(messageColRef);
      
      batch.set(msgRef, {
        id: msgRef.id,
        roomId: activeRoom.id,
        senderId: currentUserProfile.uid,
        content: textToSend,
        createdAt: new Date(),
        isRead: false
      });

      // Update parent Room meta indicators
      const roomRef = doc(db, "rooms", activeRoom.id);
      batch.update(roomRef, {
        lastMessage: textToSend.substring(0, 100),
        lastSenderId: currentUserProfile.uid,
        updatedAt: new Date()
      });

      // Dispatch alert notification to recipient
      const recipientId = activeRoom.participantIds.find(id => id !== currentUserProfile.uid);
      if (recipientId) {
        const notifyRef = doc(collection(db, "notifications"));
        batch.set(notifyRef, {
          id: notifyRef.id,
          recipientId: recipientId,
          senderId: currentUserProfile.uid,
          senderUsername: currentUserProfile.username,
          senderPhotoURL: currentUserProfile.photoURL,
          type: "MSG",
          targetId: activeRoom.id,
          contentSnippet: textToSend.substring(0, 50),
          isRead: false,
          createdAt: new Date()
        });
      }

      await batch.commit();
      setTyping(false);
    } catch (err) {
      console.error("Message dispatch failed:", err);
    }
  };

  // Helper resolving peer profile details
  const getPeerProfile = (room: Room): UserProfile | null => {
    if (!currentUserProfile) return null;
    const peerId = room.participantIds.find(id => id !== currentUserProfile.uid);
    if (!peerId) return null;
    return participantsMap[peerId] || null;
  };

  // Helper verifying seen status of newest message
  const isUnreadRoom = (room: Room): boolean => {
    if (!currentUserProfile || !room.lastMessage) return false;
    return room.lastSenderId !== currentUserProfile.uid; // dynamic list unread criteria
  };

  return (
    <div id="messages-root" className="flex-1 max-w-2xl text-left flex flex-col md:flex-row h-screen border-r border-zinc-900 bg-black text-white pointer-events-auto">
      
      {/* ROOMS CORRESPONDENCE PANEL */}
      <div className="w-full md:w-72 border-r border-zinc-900 flex flex-col shrink-0 h-1/2 md:h-full">
        <header className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-950">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-1.5 leading-none">
            <Mail className="w-4 h-4 text-white" /> Channels list
          </h2>
          <button
            onClick={() => setShowNewChatForm(!showNewChatForm)}
            className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-lg select-none cursor-pointer"
          >
            New Msg
          </button>
        </header>

        {/* Start conversations launcher */}
        {showNewChatForm && (
          <form onSubmit={startChatConversation} className="p-4 border-b border-zinc-900 bg-zinc-950/40 space-y-3">
            <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Start thread via handle</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                placeholder="pulse_username"
                className="flex-1 bg-zinc-900 border border-zinc-850 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none"
                required
              />
              <button
                type="submit"
                className="bg-white text-black text-xs font-semibold px-4 rounded-xl cursor-pointer"
              >
                Find
              </button>
            </div>
            {searchStatus && (
              <p className="text-[10px] text-zinc-500 font-mono italic leading-tight">{searchStatus}</p>
            )}
          </form>
        )}

        <div className="overflow-y-auto flex-1 divide-y divide-zinc-950">
          {loadingRooms ? (
            <div className="py-12 text-center">
              <RotateCw className="w-5 h-5 text-zinc-400 animate-spin mx-auto mb-2" />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">Accessing dialogue...</span>
            </div>
          ) : rooms.length === 0 ? (
            <div className="py-20 text-center text-zinc-500 select-none">
              <MessageSquare className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
              <p className="text-xs">No active correspondence rooms. Start a fresh chat thread.</p>
            </div>
          ) : (
            rooms.map((room) => {
              const peer = getPeerProfile(room);
              const isActive = activeRoom && activeRoom.id === room.id;
              const unread = isUnreadRoom(room);
              return (
                <div
                  key={room.id}
                  onClick={() => setActiveRoom(room)}
                  className={`p-4 flex items-center gap-3.5 cursor-pointer hover:bg-zinc-950/60 transition-all ${
                    isActive ? "bg-zinc-950" : ""
                  }`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={peer?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=peer`}
                      alt={peer?.displayName || "Pulse Peer"}
                      className="w-10 h-10 rounded-full object-cover bg-zinc-900"
                    />
                    {unread && (
                      <span className="absolute top-0 right-0 w-3 h-3 bg-white rounded-full ring-2 ring-black" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-semibold text-white truncate max-w-[120px]">
                        {peer?.displayName || "Synchronizing..."}
                      </span>
                    </div>
                    {room.lastMessage ? (
                      <p className={`text-xs truncate font-serif ${unread ? "text-white font-bold" : "text-zinc-500"}`}>
                        {room.lastMessage}
                      </p>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-650 italic">Dialogue channel open</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CHAT THREAD CONTEXT BOX */}
      <div className="flex-1 flex flex-col h-1/2 md:h-full bg-black">
        {activeRoom ? (
          <>
            {/* Thread topbar bar */}
            <header className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-950">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => onProfileClick?.(getPeerProfile(activeRoom)?.uid || "")}>
                <img
                  src={getPeerProfile(activeRoom)?.photoURL}
                  alt={getPeerProfile(activeRoom)?.displayName}
                  className="w-8.5 h-8.5 rounded-full object-cover bg-zinc-900"
                />
                <div className="text-left text-xs leading-none">
                  <h4 className="font-bold text-white mb-0.5 flex items-center gap-1">
                    {getPeerProfile(activeRoom)?.displayName}
                    {getPeerProfile(activeRoom)?.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-white fill-white shrink-0" />}
                  </h4>
                  <span className="text-[10px] font-mono text-zinc-500">@{getPeerProfile(activeRoom)?.username}</span>
                </div>
              </div>

              {/* Typing notification indicator */}
              {getPeerProfile(activeRoom) && activeRoom.typingStatus?.[getPeerProfile(activeRoom)!.uid] && (
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-400 capitalize animate-pulse">
                  <span>typing...</span>
                </div>
              )}
            </header>

            {/* Bubble logs timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="py-16 text-center text-zinc-600 font-mono italic">Dialogue record is clear. Compose message...</div>
              ) : (
                messages.map((message) => {
                  const isOwn = message.senderId === currentUserProfile?.uid;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                    >
                      <div className="max-w-[70%] text-left">
                        <div
                          className={`p-3.5 rounded-2xl text-xs font-serif ${
                            isOwn 
                              ? "bg-white text-black rounded-tr-none" 
                              : "bg-zinc-900 text-zinc-200 rounded-tl-none"
                          }`}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                        {/* Seen details indicator */}
                        <div className="text-[9px] font-mono text-zinc-600 mt-1 flex items-center justify-end gap-1 px-1">
                          {isOwn && (
                            message.isRead ? (
                              <span className="flex items-center gap-1 text-[8px] text-zinc-500 uppercase font-mono select-none font-bold"><Eye className="w-3 h-3 text-zinc-550 shrink-0" /> Seen</span>
                            ) : (
                              <span className="text-[8px] uppercase select-none font-bold"><EyeOff className="w-3 h-3 text-zinc-650 shrink-0 inline mr-0.5" /> Dispatched</span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {/* Auto scrolling target anchor node */}
              <div ref={scrollRef} />
            </div>

            {/* Form Dispatch footer container */}
            <form onSubmit={dispatchMessage} className="p-4 border-t border-zinc-900 bg-zinc-950/70 flex gap-2">
              <input
                type="text"
                value={newMessageText}
                onChange={(e) => {
                  setNewMessageText(e.target.value);
                  setTyping(true);
                }}
                placeholder="Compose secure DM update..."
                maxLength={1000}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 font-serif"
                required
              />
              <button
                type="submit"
                disabled={!newMessageText.trim()}
                className="bg-white text-black p-2.5 px-4 rounded-xl hover:bg-zinc-200 cursor-pointer disabled:opacity-40 transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8">
            <Mail className="w-10 h-10 text-zinc-800 mb-2" />
            <span className="font-semibold text-sm">Direct Messaging Panel</span>
            <p className="text-xs text-zinc-600 max-w-xs mt-1 text-center">Select or open any conversation room on the left map to start real-time messaging updates securely.</p>
          </div>
        )}
      </div>

    </div>
  );
}
