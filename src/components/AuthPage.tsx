import { useState, FormEvent } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  sendPasswordResetEmail
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Sparkles, MessageCircle, AlertCircle, RefreshCw, KeyRound, ArrowRight } from "lucide-react";

interface AuthPageProps {
  onAuthSuccess: () => void;
}

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);

  const cleanUsername = (name: string) => {
    return name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please complete all required credentials.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        if (!username || !displayName) {
          setError("Username and Display Name are required for new accounts.");
          setLoading(false);
          return;
        }
        const parsedUsername = cleanUsername(username);
        if (parsedUsername.length < 3) {
          setError("Username must be at least 3 alphanumeric characters.");
          setLoading(false);
          return;
        }

        // Create Auth Credentials
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const { user } = userCredential;

        // Register default user profile document in Firestore
        const profileRef = doc(db, "users", user.uid);
        const privateRef = doc(db, "users", user.uid, "private", "info");

        await setDoc(profileRef, {
          uid: user.uid,
          username: parsedUsername,
          displayName: displayName.trim(),
          bio: "I am new on Pulse.",
          photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${parsedUsername}`,
          bannerURL: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1200",
          createdAt: new Date(),
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          isVerified: false,
          isSuspended: false
        });

        await setDoc(privateRef, {
          email: user.email,
          emailVerified: user.emailVerified,
          updatedAt: new Date()
        });

      } else {
        // Sign-In via email
        await signInWithEmailAndPassword(auth, email, password);
      }
      onAuthSuccess();
    } catch (err: any) {
      console.error("Auth Failure:", err);
      let errMsg = "Authentication failed. Please verify credentials.";
      if (err.code === "auth/email-already-in-use") {
        errMsg = "This email is already linked to another profile.";
      } else if (err.code === "auth/weak-password") {
        errMsg = "Password must be at least 6 characters.";
      } else if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        errMsg = "Invalid email or password combination.";
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user already has profile in Firestore
      const profileDoc = await getDoc(doc(db, "users", user.uid));
      if (!profileDoc.exists()) {
        const usernameSeed = user.email ? user.email.split("@")[0] : `user_${user.uid.slice(0, 5)}`;
        const finalUsername = cleanUsername(usernameSeed) + Math.floor(100 + Math.random() * 900);

        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          username: finalUsername,
          displayName: user.displayName || "Anonymous Pulse User",
          bio: "Living in the rhythm of Pulse.",
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${finalUsername}`,
          bannerURL: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1200",
          createdAt: new Date(),
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          isVerified: false,
          isSuspended: false
        });

        await setDoc(doc(db, "users", user.uid, "private", "info"), {
          email: user.email,
          emailVerified: user.emailVerified,
          updatedAt: new Date()
        });
      }
      onAuthSuccess();
    } catch (err: any) {
      console.error("Google Auth failed:", err);
      setError("Google Login failed. Note: Popup actions might be blocked inside iframe views.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async () => {
    if (!email) {
      setError("Please put your email address above to initiate reset request.");
      return;
    }
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setRecoverySent(true);
      setTimeout(() => setRecoverySent(false), 5000);
    } catch (err: any) {
      setError("Failed to dispatch recovery. Ensure email is keyed correctly.");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center px-4 md:px-0" id="auth-page">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-zinc-900 rounded-full blur-3xl opacity-50 pointer-events-none" />

      <div className="w-full max-w-[420px] bg-zinc-950 border border-zinc-900 rounded-2xl p-8 backdrop-blur-xl relative z-10 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-black font-black text-xl tracking-tight mb-3">
            P
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">
            Welcome to Pulse
          </h1>
          <p className="text-sm text-zinc-500 text-center">
            A premium, ultra-fast social environment.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-950/40 border border-red-900/60 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <span className="text-xs text-red-200/90 leading-tight">{error}</span>
          </div>
        )}

        {recoverySent && (
          <div className="mb-6 p-3 bg-green-950/40 border border-green-900/60 rounded-xl flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            <span className="text-xs text-green-200/90 leading-tight">Password reset recovery dispatch email was broadcasted.</span>
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 transition-all"
              placeholder="name@domain.com"
              required
            />
          </div>

          {isSignUp && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-[11.5px] text-sm text-zinc-500">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(cleanUsername(e.target.value))}
                    className="w-full pl-8 pr-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-all font-mono"
                    placeholder="user_handle"
                    maxLength={20}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-all"
                  placeholder="Your Name"
                  maxLength={40}
                  required
                />
              </div>
            </>
          )}

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Password
              </label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handlePasswordRecovery}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-all font-medium"
                >
                  Forgot?
                </button>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-all"
              placeholder="••••••••••••"
              minLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-white text-black py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isSignUp ? (
              <>Create Account <ArrowRight className="w-4 h-4" /></>
            ) : (
              <>Access Account <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-900" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-zinc-950 px-3 text-zinc-600 tracking-wider">Or continue with</span>
          </div>
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-xl text-sm font-medium hover:bg-zinc-850 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.24 10.285V13.4h6.887c-.275 1.564-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.983 0-.74-.08-1.302-.176-1.856H12.24z"/>
              </svg>
              Google Workspace
            </>
          )}
        </button>

        <div className="mt-8 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-zinc-400 font-medium hover:text-white transition-all underline decoration-zinc-800 underline-offset-4"
          >
            {isSignUp ? "Already registered? Sign In" : "New to Pulse? Create an Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
