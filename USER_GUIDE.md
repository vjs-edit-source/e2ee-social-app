# 📖 SadiSocial User Guide & Quickstart Manual
### *The Zero-Knowledge, End-to-End Encrypted Social Network & Messenger*

Welcome to **SadiSocial**! SadiSocial is engineered from the ground up for uncompromising privacy, security, and human connection. Unlike conventional social media apps that store your unencrypted messages and personal photos on corporate servers, SadiSocial ensures that **only you and the person you communicate with hold the decryption keys**.

Even the server and database host cannot read your texts, view your photos, or listen to your calls.

---

## 📑 Table of Contents
1. [🌟 Core Philosophy: The Zero-Knowledge Guarantee](#1--core-philosophy-the-zero-knowledge-guarantee)
2. [📱 Installation & Setup](#2--installation--setup)
   - [Installing on Android (APK)](#installing-on-android-apk)
   - [Using in Web Browser (PC & Mobile)](#using-in-web-browser-pc--mobile)
3. [🔐 Account Creation & Security Vault](#3--account-creation--security-vault)
   - [Creating an Account](#creating-an-account)
   - [Your Secret Recovery Key (Crucial!)](#your-secret-recovery-key-crucial)
   - [App Lock: PIN & Biometric Protection](#app-lock-pin--biometric-protection)
4. [💬 Direct Messaging (DMs)](#4--direct-messaging-dms)
   - [Starting a Chat](#starting-a-chat)
   - [Sending Text, Audio Chimes & Haptics](#sending-text-audio-chimes--haptics)
   - [Sending Encrypted Photos, Videos & Files](#sending-encrypted-photos-videos--files)
   - [Disappearing Messages (Self-Destruct)](#disappearing-messages-self-destruct)
   - [Deleting Messages](#deleting-messages)
5. [📞 Encrypted Voice & Video Calling](#5--encrypted-voice--video-calling)
   - [Making a Voice or Video Call](#making-a-voice-or-video-call)
   - [Answering / Declining Calls](#answering--declining-calls)
   - [In-Call Controls](#in-call-controls)
   - [Microphone & Camera Permissions Guide](#microphone--camera-permissions-guide)
6. [📸 24-Hour Status Stories](#6--24-hour-status-stories)
   - [Sharing a Story (Text, Photo, Video)](#sharing-a-story-text-photo-video)
   - [Viewing & Interacting with Stories](#viewing--interacting-with-stories)
7. [👥 Groups & Communities](#7--groups--communities)
   - [Secret Groups vs. Public Communities](#secret-groups-vs-public-communities)
   - [Managing Members & Permissions](#managing-members--permissions)
8. [📰 Feed & Wall Posts](#8--feed--wall-posts)
   - [Publishing Posts](#publishing-posts)
   - [Reactions & Comments](#reactions--comments)
9. [🛡️ Advanced Privacy & Power Features](#9--advanced-privacy--power-features)
   - [Zero-Knowledge Server Inspector (Live Audit)](#zero-knowledge-server-inspector-live-audit)
   - [Custom Backend Engine (Self-Hosting)](#custom-backend-engine-self-hosting)
   - [Panic Mode (Instant Emergency Wipe)](#panic-mode-instant-emergency-wipe)
10. [❓ Frequently Asked Questions (FAQ) & Troubleshooting](#10--frequently-asked-questions-faq--troubleshooting)

---

## 1. 🌟 Core Philosophy: The Zero-Knowledge Guarantee

Traditional social networks process your data in plaintext. SadiSocial uses **Zero-Knowledge Client-Side Cryptography**:
- **Encrypted in Your Browser / Phone**: Before any text, status, photo, voice message, or video leaves your device, it is encrypted locally with **AES-256-GCM** using keys negotiated via **X25519 & Double Ratchet** protocols.
- **Server Sees Only Scrambled Noise**: The relay server only sees random ciphertext blocks (e.g. `iv: 8f2c... ciphertext: 3a91...`).
- **P2P Audio & Video Calls**: Voice and video calls stream directly between caller and callee using WebRTC with **DTLS-SRTP** encryption. Media streams never route through unencrypted media servers.

---

## 2. 📱 Installation & Setup

### Installing on Android (APK)
1. **Download the APK**:
   - Download `SadiSocial.apk` directly from your server URL (or transfer it to your phone via USB / Google Drive).
2. **Allow Installation from Unknown Sources**:
   - When tapping the downloaded APK, Android may say *"For your security, your phone is not allowed to install unknown apps from this source."*
   - Tap **Settings** on the prompt and toggle **"Allow from this source"**.
   - Tap **Install**.
3. **Grant Permissions**:
   - When launching the app for the first time, Android will ask for **Microphone** and **Camera** permissions.
   - Tap **"While using the app"** so that voice notes, encrypted calls, and photo/video attachments function smoothly.

### Using in Web Browser (PC & Mobile)
- **Supported Browsers**: Google Chrome, Brave, Mozilla Firefox, Microsoft Edge, and Apple Safari (iOS & macOS).
- **Access URL**: Open your SadiSocial URL (e.g., `https://sadisocial-engine.onrender.com` or your custom server address).
- **Add to Home Screen (Mobile Web / PWA)**:
  - On Safari (iOS): Tap the **Share** button → Tap **"Add to Home Screen"**.
  - On Chrome (Android): Tap the **Three Dots Menu** → Tap **"Install App"** or **"Add to Home Screen"**.

---

## 3. 🔐 Account Creation & Security Vault

### Creating an Account
1. Open SadiSocial and tap **Create Account**.
2. Pick a unique **Username** (alphanumeric, e.g., `sadi`, `alice`, `bob`).
3. Enter your preferred **Display Name** (e.g., `Sadi K.`, `Alice Wonder`).
4. Set a strong **Master Passphrase**.

> [!IMPORTANT]
> **Zero-Knowledge Architecture Note**:
> SadiSocial servers **do not store passwords**. Your passphrase derives your master encryption keys directly inside your device's memory using cryptographic key-stretching (PBKDF2/Argon2). If you forget your passphrase without saving your Recovery Key, nobody—not even the server administrator—can recover your account!

### Your Secret Recovery Key (Crucial!)
During registration or in **Settings → Security Vault**, you will receive a **Secret Recovery Key** (a 128-bit hexadecimal token).
- **Copy and store it in a password manager or write it down on paper.**
- If you lose your phone or clear browser storage, entering this recovery key restores your identity and decryption keys instantly.

### App Lock: PIN & Biometric Protection
Keep your conversations private even if someone borrows your unlocked phone:
1. Navigate to **Settings** → **Security & Privacy**.
2. Tap **Set App Lock PIN**.
3. Enter a 4-to-6 digit PIN.
4. If your device supports Fingerprint or Face ID, SadiSocial can automatically authenticate via WebAuthn/Biometrics.
5. **Auto-Lock**: Whenever you switch to another app or turn off your screen, SadiSocial immediately locks and presents the PIN shield upon return.

---

## 4. 💬 Direct Messaging (DMs)

### Starting a Chat
1. Tap the **Messages** tab on the navigation bar.
2. Tap the **New Chat / Search** button (or press `Ctrl + K` / `Cmd + K` on desktop).
3. Search for any user by their username or display name.
4. Tap their name to open the secure chat room.
5. A green **"End-to-End Encrypted (AES-256-GCM)"** lock banner confirms your direct cryptographic session.

### Sending Text, Audio Chimes & Haptics
- Type your message and hit **Send** (or press Enter).
- **Sound Feedback**: A distinctive dual-harmonic chime confirms message transmission.
- **Haptic Vibration**: On supported mobile devices, a subtle dual-pulse vibration confirms the send action.
- **Delivery Indicators**:
  - One tick (✓) = Sent & encrypted to relay server.
  - Two ticks (✓✓) = Delivered to recipient's device.

### Sending Encrypted Photos, Videos & Files
1. In any chat, tap the **Paperclip / Attachment** button (+).
2. Choose your media:
   - 📷 **Photo / Image** (JPEG, PNG, GIF, WebP, HEIC)
   - 🎥 **Video** (MP4, WebM, MOV)
   - 🎤 **Voice Note**
   - 📄 **Document / PDF** (Up to 100 MB)
3. The attachment is encrypted **locally on your device** with a unique one-time symmetric key.
4. **Previews & Playback**: Tapping on an image or video opens the full-screen encrypted media viewer.

### Disappearing Messages (Self-Destruct)
Need extra privacy? Set your messages to vanish automatically after being read:
1. Inside the chat, tap the **Timer / Clock** icon in the header.
2. Select your expiration interval:
   - `5 Seconds` (Ultra-ephemeral)
   - `1 Minute`
   - `1 Hour`
   - `24 Hours`
   - `7 Days`
   - `Off`
3. Any message sent while the timer is active will display a live countdown timer and automatically erase itself from both devices once expired.

### Deleting Messages
- Long-press (or right-click) any message:
  - **Delete for Me**: Cleans up your local chat history.
  - **Delete for Everyone**: Sends a signed revocation signal that deletes the ciphertext from both the relay server and the recipient's phone.

---

## 5. 📞 Encrypted Voice & Video Calling

SadiSocial includes peer-to-peer (P2P) voice and video calling secured with DTLS-SRTP encryption.

### Making a Voice or Video Call
1. Open a direct chat with a contact.
2. Tap the **Phone Icon** 📞 for an Encrypted Voice Call.
3. Tap the **Video Icon** 📹 for an Encrypted Video Call.
4. SadiSocial initiates a secure WebRTC handshake. A pleasant calling tone will play while ringing.

### Answering / Declining Calls
- When someone calls you, a full-screen incoming call modal appears with the caller's avatar and profile name.
- Tap the **Green Phone** to answer with audio.
- Tap the **Blue Camera** to answer with video.
- Tap the **Red Phone** to decline.

### In-Call Controls
While connected:
- **Mute / Unmute**: Tap the **Microphone** button to toggle your mic.
- **Camera On / Off**: Tap the **Camera** button to toggle your video stream.
- **Switch Camera**: Switch between front-facing and rear cameras during video calls.
- **End Call**: Tap the large **Red Hangup** button.
- **Security Badge**: The top bar displays a green **"End-to-End Encrypted (P2P DTLS-SRTP)"** badge along with the call duration.

### Microphone & Camera Permissions Guide
If you see a **"Permission Required"** banner when placing a call:
1. **On Android**:
   - Open your phone's **Settings** → **Apps** → **SadiSocial**.
   - Tap **Permissions**.
   - Tap **Microphone** → Select **"Allow only while using the app"**.
   - Tap **Camera** → Select **"Allow only while using the app"**.
   - Return to SadiSocial and tap **Try Again**.
2. **In Web Browser**:
   - Click the **Padlock / Tune icon** to the left of the website URL in your address bar.
   - Ensure **Camera** and **Microphone** are set to **"Allow"**.
   - Reload the page.

---

## 6. 📸 24-Hour Status Stories

Share fleeting moments with friends that disappear automatically after 24 hours.

### Sharing a Story (Text, Photo, Video)
1. Tap the **Status** tab on the bottom/top navigation bar.
2. Under **My Status**, tap **"Add Status"** or the **+** button.
3. Choose your format:
   - **Text Story**: Type your thought, choose a background gradient, and customize typography.
   - **Photo / Video Story**: Select an image or video clip from your gallery.
4. Add an optional caption.
5. Tap **Post Encrypted Status**.
6. The circular progress ring indicates local encryption and upload.

### Viewing & Interacting with Stories
- Friends with active stories appear in the **Recent Updates** carousel with a glowing gradient ring around their avatar.
- Tap on any friend's avatar to launch the **Story Viewer**:
  - **Auto-advance**: Stories play sequentially for 5 seconds (or the full duration of a video).
  - **Tap Right**: Skip to the next story slide.
  - **Tap Left**: Go back to the previous slide.
  - **Press & Hold**: Pause the story.
  - **Send Reply**: Type in the quick reply box at the bottom of the story to start a private conversation about that status.

---

## 7. 👥 Groups & Communities

Collaborate, organize, or socialize in encrypted groups.

### Secret Groups vs. Public Communities
- **Secret Groups**:
  - Entirely invitation-only.
  - All messages, media, and member rosters are encrypted end-to-end.
  - Ideal for family, teams, and close friends.
- **Public Communities**:
  - Discoverable in the Community Directory.
  - Anyone can request to join or browse open topics.
  - Ideal for public channels, hobby groups, and announcements.

### Managing Members & Permissions
Group Creators and Admins have granular control:
- **Invite New Members**: Generate a secure invitation code or select existing contacts.
- **Member Approval System**: Set group security to require admin approval before new members can enter.
- **Admin Roles**: Promote trusted members to Admin to help moderate the group.
- **Remove / Ban**: Remove disruptive members with one tap.

---

## 8. 📰 Feed & Wall Posts

Share longer-form thoughts, announcements, and albums on the public or friends feed.

### Publishing Posts
1. Tap the **Feed** tab.
2. Tap the compose box at the top.
3. Write your post (supports markdown formatting and emojis).
4. Attach images, videos, audio clips, or documents.
5. Tap **Publish Post**.

### Reactions & Comments
- **Likes & Reactions**: Tap the heart ❤️ to express appreciation.
- **Encrypted Comments**: Tap the comment bubble to view discussions or join the thread.
- **Zero-Knowledge Media Audit**: Every post preview features an encryption badge showing that the media was delivered in encrypted ciphertext.

---

## 9. 🛡️ Advanced Privacy & Power Features

### Zero-Knowledge Server Inspector (Live Audit)
Don't just take our word for it—verify the encryption yourself!
1. Tap the **Shield / Inspector** icon in the navigation bar (or visit `/inspector`).
2. The **Zero-Knowledge Cryptographic Audit Dashboard** renders in real-time:
   - Inspect the exact raw JSON blobs stored on the server.
   - Observe how user messages, media attachments, and status stories exist purely as encrypted hexadecimal strings.
   - Confirm that zero plaintext keys or passwords exist in server storage.

### Custom Backend Engine (Self-Hosting)
Want 100% control over your data hosting? You can run your own SadiSocial server!
1. In SadiSocial, tap **Settings** → **Engine & Backend**.
2. Tap **Custom Server URL**.
3. Enter your own server's address (e.g. `https://my-private-server.com` or `http://192.168.1.50:4000`).
4. Tap **Connect & Test Health**.
5. SadiSocial seamlessly points all WebSocket connections, messaging, and storage to your self-hosted instance.

### Panic Mode (Instant Emergency Wipe)
If your device is compromised or inspected without your consent:
1. Tap **Settings** → **Security Vault** → **Trigger Panic Mode** (or tap **Panic** on the App Lock screen).
2. Confirm the prompt.
3. SadiSocial instantly executes:
   - Wipes all decrypted caches and cryptographic keys from device storage.
   - Clears session tokens, message drafts, and cached thumbnails.
   - Returns to a clean first-time setup state.

---

## 10. ❓ Frequently Asked Questions (FAQ) & Troubleshooting

#### Q1: What happens if I forget my password?
Because SadiSocial is Zero-Knowledge, there is no "Forgot Password" email link (the server never knows your email or password!). You must enter your **Secret Recovery Key** to restore access.

#### Q2: Can the server host or internet provider see who I am calling or messaging?
No. All messaging is encrypted with AES-256-GCM before transmission. Audio and video calls use peer-to-peer DTLS-SRTP. The network provider only sees encrypted WebRTC and WebSocket packets.

#### Q3: Why didn't I hear my phone ring for an incoming call?
Make sure:
1. SadiSocial has notification permissions enabled in Android Settings.
2. Your phone is not in "Do Not Disturb" or "Silent" mode.
3. Both you and the caller are connected to an active internet connection (Wi-Fi or Mobile Data).

#### Q4: What if a call ends immediately or says "Permission Required"?
This occurs if Android blocked microphone or camera access:
- Open your phone's **Settings → Apps → SadiSocial → Permissions**.
- Enable **Microphone** and **Camera**.
- Re-open SadiSocial and place the call again.

#### Q5: Can I use SadiSocial on my PC and Phone simultaneously?
Yes! You can log in to your account from both your computer browser and your Android phone. Because SadiSocial supports multi-socket routing, incoming messages and calls will synchronize across your active devices.

---

### 🎉 Enjoy True Privacy with SadiSocial!
*Your Data. Your Keys. Your Freedom.*
