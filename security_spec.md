# Firebase security specifications for Pulse

This document outlines the Security Invariants, the "Dirty Dozen" attack payloads, and the validation tests for the the Pulse security design.

## 1. Security Invariants
- **User Integrity**: A user can only write, update, or edit their own profile under `/users/{userId}`. They are strictly blocked from writing to their private info subcollection unless they are the owner.
- **Admin Immunity**: Only verified administrator users can access, moderate, delete reports, or suspend users. Users cannot modify their own roles or `isVerified` flags.
- **Post Invariants**: Posts are limited to 500 characters, must have the `authorId` match the authenticated UID, and the `createdAt` must match the server timestamp.
- **Reponse Keys Verification**: When updating counters (like `likesCount` or `commentsCount`), client-side changes must be validated synchronously against relational records.
- **DMs Isolation**: DM rooms and messages are strictly restricted to the two participants explicitly defined in `participantIds`. No other user may read or write inside.

## 2. The Dirty Dozen (Malicious Payloads)
Below are 12 specific payloads attempting to evade rules. Each is expected to return `PERMISSION_DENIED`:

1. **Privilege Escalation (User makes self verified):**
   - Action: `CREATE` on `/users/attackerUID` with `{"username": "attacker", "displayName": "Attacker", "isVerified": true}`.
   - Objective: Forbid self-assignment of admin-controlled fields like `isVerified` or `isSuspended`.

2. **Spam Overflow / Char limit bypass:**
   - Action: `CREATE` on `/posts/post123` with content containing over 500 characters of junk text.
   - Objective: Enforce char limits at rule level.

3. **Identity Spoofing on Post creation:**
   - Action: `CREATE` on `/posts/post123` with `{"authorId": "victimUID", "content": "Unapproved comment"}`.
   - Objective: Author ID mismatch check.

4. **Shadow Update Gate bypass (Ghost field injection):**
   - Action: `UPDATE` on `/posts/post123` with extra unapproved field `{"extraPremiumState": true}`.
   - Objective: Enforce exact keys hasOnly diffing.

5. **Temporal Integrity breach (Client-controlled timestamp):**
   - Action: `CREATE` on `/posts/post123` with `{"content": "A post", "createdAt": "2030-01-01T00:00:00Z"}` instead of server timestamp.
   - Objective: Force `request.time`.

6. **Eavesdropping on Private Chatrooms:**
   - Action: `GET` or `LIST` on `/rooms/roomAB/messages` by `attackerUID` who is not in `participantIds`.
   - Objective: Enforce private messages isolation.

7. **Double Liking / Duplicate record poisoning:**
   - Action: `CREATE` on `/likes/anotherId` where the ID is not formatted as `userId_postId`.
   - Objective: Rigid document ID validation logic.

8. **PII Data sniffing attempt:**
   - Action: `GET` on `/users/victimUID/private/info` by `attackerUID`.
   - Objective: Strict isolation of email and other private details.

9. **Follow State Shortcutting (Follow self):**
   - Action: `CREATE` on `/followers/attackerUID_attackerUID` where follower matches following.
   - Objective: Block self-following relationship.

10. **Admin action forging:**
    - Action: `DELETE` on `/posts/postVictim` by non-admin user `attackerUID` claiming to do moderation.
    - Objective: Only allow deletion by author or verified system admins.

11. **Report Manipulation / Resolving own abuse report:**
    - Action: `UPDATE` on `/reports/report123` by non-admin member changing state to `RESOLVED_DISMISSED`.
    - Objective: Restrict update of report states to admins.

12. **Comment Forgery on unowned content:**
    - Action: `CREATE` on `/comments/comment123` with stolen author credentials or invalid `postId` referentials.
    - Objective: Ensure comment is only created by the signed-in user and targets existing posts.

---

## 3. Test Cases (firestore.rules.test.ts mockup)
We will enforce these payloads return `PERMISSION_DENIED` across all collection endpoints.
