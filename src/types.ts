export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  bio: string;
  photoURL: string;
  bannerURL: string;
  createdAt: any; // Firestore Timestamp
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isVerified: boolean;
  isSuspended: boolean;
}

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorPhotoURL: string;
  content: string;
  createdAt: any; // Firestore Timestamp
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  isRepost: boolean;
  repostedPostId?: string;
  repostedAuthorName?: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorPhotoURL: string;
  content: string;
  createdAt: any; // Firestore Timestamp
}

export interface Like {
  id: string; // composite userId_postId
  userId: string;
  postId: string;
  createdAt: any;
}

export interface Follower {
  id: string; // composite followerId_followingId
  followerId: string;
  followingId: string;
  createdAt: any;
}

export enum NotificationType {
  FOLLOW = 'FOLLOW',
  LIKE = 'LIKE',
  COMMENT = 'COMMENT',
  REPOST = 'REPOST',
  MENTION = 'MENTION',
  MSG = 'MSG'
}

export interface Notification {
  id: string;
  recipientId: string;
  senderId: string;
  senderUsername: string;
  senderPhotoURL: string;
  type: NotificationType;
  targetId: string; // post ID or message room ID
  contentSnippet?: string;
  isRead: boolean;
  createdAt: any; // Firestore Timestamp
}

export interface Room {
  id: string;
  participantIds: string[];
  lastMessage?: string;
  lastSenderId?: string;
  updatedAt: any;
  typingStatus?: { [userId: string]: boolean };
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: any;
  isRead: boolean;
}

export interface Report {
  id: string;
  reporterId: string;
  targetType: 'POST' | 'USER';
  targetId: string;
  reason: string;
  status: 'PENDING' | 'RESOLVED_BANNED' | 'RESOLVED_DISMISSED';
  createdAt: any;
}

export interface AnalyticsSummary {
  totalUsers: number;
  dailyActiveUsers: number;
  totalPosts: number;
  engagementRate: number; // calculated mathematically
  totalReports: number;
}
