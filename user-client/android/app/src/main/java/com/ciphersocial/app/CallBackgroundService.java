package com.ciphersocial.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class CallBackgroundService extends Service {
    private static final String TAG = "CallBgService";

    public static final String ACTION_START = "com.ciphersocial.app.START_CALL_SERVICE";
    public static final String ACTION_STOP = "com.ciphersocial.app.STOP_CALL_SERVICE";
    public static final String ACTION_DECLINE = "com.ciphersocial.app.DECLINE_CALL";
    public static final String ACTION_DISMISS_RINGTONE = "com.ciphersocial.app.DISMISS_RINGTONE";

    public static final String EXTRA_USERNAME = "username";
    public static final String EXTRA_WS_URL = "ws_url";
    public static final String EXTRA_CALLER = "caller";

    private static final String SERVICE_CHANNEL_ID = "ciphersocial_service_channel";
    private static final String CALL_CHANNEL_ID = "ciphersocial_call_channel";
    private static final int SERVICE_NOTIFICATION_ID = 9001;
    private static final int CALL_NOTIFICATION_ID = 9002;

    private static volatile CallBackgroundService instance;

    private String currentUsername;
    private String currentWsUrl;
    private OkHttpClient httpClient;
    private WebSocket webSocket;
    private Handler handler;
    private boolean isDestroyed = false;

    private PowerManager.WakeLock wakeLock;
    private Ringtone ringtone;
    private Vibrator vibrator;
    private String activeCaller;

    public static void startService(Context context, String username, String wsUrl) {
        if (context == null || username == null || username.trim().isEmpty()) return;
        try {
            Intent intent = new Intent(context, CallBackgroundService.class);
            intent.setAction(ACTION_START);
            intent.putExtra(EXTRA_USERNAME, username.trim());
            intent.putExtra(EXTRA_WS_URL, wsUrl);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Throwable t) {
            Log.e(TAG, "Failed to start CallBackgroundService via startForegroundService", t);
            try {
                Intent fallback = new Intent(context, CallBackgroundService.class);
                fallback.setAction(ACTION_START);
                fallback.putExtra(EXTRA_USERNAME, username.trim());
                fallback.putExtra(EXTRA_WS_URL, wsUrl);
                context.startService(fallback);
            } catch (Throwable ignored) {}
        }
    }

    public static void stopService(Context context) {
        if (instance != null) {
            try {
                instance.stopCallAlert();
                instance.disconnectWebSocket();
                instance.stopForeground(true);
                instance.stopSelf();
            } catch (Throwable ignored) {}
            return;
        }
        if (context == null) return;
        try {
            Intent intent = new Intent(context, CallBackgroundService.class);
            intent.setAction(ACTION_STOP);
            context.startService(intent);
        } catch (Throwable ignored) {}
    }

    public static void dismissRingtone(Context context) {
        if (instance != null) {
            try {
                instance.stopCallAlert();
            } catch (Throwable ignored) {}
            return;
        }
        if (context == null) return;
        try {
            Intent intent = new Intent(context, CallBackgroundService.class);
            intent.setAction(ACTION_DISMISS_RINGTONE);
            context.startService(intent);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        try {
            handler = new Handler(Looper.getMainLooper());
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            createNotificationChannels();

            httpClient = new OkHttpClient.Builder()
                    .readTimeout(0, TimeUnit.MILLISECONDS)
                    .pingInterval(15, TimeUnit.SECONDS)
                    .build();
        } catch (Throwable t) {
            Log.e(TAG, "Error in onCreate", t);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (intent == null) return START_STICKY;

            String action = intent.getAction();
            if (ACTION_START.equals(action)) {
                String user = intent.getStringExtra(EXTRA_USERNAME);
                String url = intent.getStringExtra(EXTRA_WS_URL);
                if (user != null && !user.isEmpty()) {
                    currentUsername = user;
                }
                if (url != null && !url.isEmpty()) {
                    currentWsUrl = url;
                }
                startForegroundSafely();
                connectWebSocket();
            } else if (ACTION_STOP.equals(action)) {
                stopCallAlert();
                disconnectWebSocket();
                stopForeground(true);
                stopSelf();
            } else if (ACTION_DECLINE.equals(action)) {
                String caller = intent.getStringExtra(EXTRA_CALLER);
                declineIncomingCall(caller);
                stopCallAlert();
            } else if (ACTION_DISMISS_RINGTONE.equals(action)) {
                stopCallAlert();
            }
        } catch (Throwable t) {
            Log.e(TAG, "Error in onStartCommand", t);
        }

        return START_STICKY;
    }

    private void startForegroundSafely() {
        try {
            Notification notification = buildServiceNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // In Android 14+ (API 34+), dataSync is the safest FGS type for websocket/data synchronization
                int fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
                startForeground(SERVICE_NOTIFICATION_ID, notification, fgsType);
            } else {
                startForeground(SERVICE_NOTIFICATION_ID, notification);
            }
        } catch (Throwable t) {
            Log.w(TAG, "startForeground with dataSync failed, attempting fallback", t);
            try {
                startForeground(SERVICE_NOTIFICATION_ID, buildServiceNotification());
            } catch (Throwable t2) {
                Log.e(TAG, "All startForeground attempts failed", t2);
            }
        }
    }

    private void createNotificationChannels() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;

                // 1. Service persistence channel (Silent)
                NotificationChannel serviceChannel = new NotificationChannel(
                        SERVICE_CHANNEL_ID,
                        "SadiSocial Service",
                        NotificationManager.IMPORTANCE_LOW
                );
                serviceChannel.setDescription("Keeps secure calling active in background");
                serviceChannel.setShowBadge(false);
                nm.createNotificationChannel(serviceChannel);

                // 2. Incoming Call channel (High importance with sound & vibration)
                NotificationChannel callChannel = new NotificationChannel(
                        CALL_CHANNEL_ID,
                        "Incoming Calls",
                        NotificationManager.IMPORTANCE_HIGH
                );
                callChannel.setDescription("Incoming voice and video calls");
                callChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                callChannel.enableVibration(true);
                callChannel.setVibrationPattern(new long[]{0, 1000, 800, 1000});

                Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                if (ringtoneUri != null) {
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .build();
                    callChannel.setSound(ringtoneUri, audioAttributes);
                }

                nm.createNotificationChannel(callChannel);
            }
        } catch (Throwable t) {
            Log.e(TAG, "Failed to create notification channels", t);
        }
    }

    private Notification buildServiceNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        return new NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
                .setContentTitle("SadiSocial")
                .setContentText("Ready for secure incoming calls")
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }

    private synchronized void connectWebSocket() {
        if (isDestroyed || currentUsername == null || currentWsUrl == null) return;

        disconnectWebSocket();

        try {
            String targetWs = currentWsUrl;
            if (!targetWs.endsWith("/ws") && !targetWs.contains("?")) {
                targetWs = targetWs.replaceAll("/+$", "") + "/ws";
            }
            String url = targetWs + (targetWs.contains("?") ? "&" : "?") + "user=" + Uri.encode(currentUsername) + "&service=bg";

            Request request = new Request.Builder().url(url).build();
            webSocket = httpClient.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket ws, Response response) {
                    Log.d(TAG, "Background WebSocket connected for user: " + currentUsername);
                }

                @Override
                public void onMessage(WebSocket ws, String text) {
                    handleWsMessage(text);
                }

                @Override
                public void onClosing(WebSocket ws, int code, String reason) {
                    ws.close(1000, null);
                }

                @Override
                public void onClosed(WebSocket ws, int code, String reason) {
                    scheduleReconnect();
                }

                @Override
                public void onFailure(WebSocket ws, Throwable t, Response response) {
                    Log.w(TAG, "Background WebSocket error: " + t.getMessage());
                    scheduleReconnect();
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Failed to connect background WS", e);
            scheduleReconnect();
        }
    }

    private synchronized void disconnectWebSocket() {
        if (webSocket != null) {
            try {
                webSocket.close(1000, "Service update");
            } catch (Exception ignored) {}
            webSocket = null;
        }
    }

    private void scheduleReconnect() {
        if (isDestroyed) return;
        try {
            handler.removeCallbacks(this::connectWebSocket);
            handler.postDelayed(this::connectWebSocket, 5000);
        } catch (Throwable ignored) {}
    }

    private void handleWsMessage(String text) {
        try {
            JSONObject data = new JSONObject(text);
            String type = data.optString("type");

            if ("CALL_OFFER".equals(type)) {
                String target = data.optString("target");
                if (target.equalsIgnoreCase(currentUsername)) {
                    String caller = data.optString("caller");
                    String callerDisplayName = data.optString("callerDisplayName", caller);
                    boolean isVideo = data.optBoolean("isVideo", false);
                    activeCaller = caller;

                    handler.post(() -> onIncomingCallReceived(caller, callerDisplayName, isVideo));
                }
            } else if ("CALL_HANGUP".equals(type) || "CALL_REJECT".equals(type)) {
                handler.post(this::stopCallAlert);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling WS message in background", e);
        }
    }

    private void onIncomingCallReceived(String caller, String callerDisplayName, boolean isVideo) {
        try {
            // If MainActivity is in foreground and screen is on, let in-app CallModal handle audio
            if (MainActivity.isActivityVisible) {
                Log.d(TAG, "MainActivity is in foreground, in-app CallModal handles audio");
                return;
            }

            acquireWakeLock();
            startRingtoneAndVibration();
            showIncomingCallNotification(caller, callerDisplayName, isVideo);
        } catch (Throwable t) {
            Log.e(TAG, "Error in onIncomingCallReceived", t);
        }
    }

    private void showIncomingCallNotification(String caller, String callerDisplayName, boolean isVideo) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            // Full-screen intent to wake device and launch MainActivity over lockscreen
            Intent fullScreenIntent = new Intent(this, MainActivity.class);
            fullScreenIntent.setAction("INCOMING_CALL");
            fullScreenIntent.putExtra("caller", caller);
            fullScreenIntent.putExtra("callerDisplayName", callerDisplayName);
            fullScreenIntent.putExtra("isVideo", isVideo);
            fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                    this, 101, fullScreenIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            // Answer Action
            Intent answerIntent = new Intent(this, MainActivity.class);
            answerIntent.setAction("ANSWER_CALL");
            answerIntent.putExtra("caller", caller);
            answerIntent.putExtra("isVideo", isVideo);
            answerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            PendingIntent answerPendingIntent = PendingIntent.getActivity(
                    this, 102, answerIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            // Decline Action
            Intent declineIntent = new Intent(this, CallBackgroundService.class);
            declineIntent.setAction(ACTION_DECLINE);
            declineIntent.putExtra(EXTRA_CALLER, caller);

            PendingIntent declinePendingIntent = PendingIntent.getService(
                    this, 103, declineIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            String title = (isVideo ? "Incoming Video Call" : "Incoming Voice Call");
            String content = (callerDisplayName != null && !callerDisplayName.isEmpty()) ? callerDisplayName : ("@" + caller);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.sym_call_incoming)
                    .setContentTitle(title)
                    .setContentText(content)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setAutoCancel(true)
                    .setOngoing(true)
                    .setFullScreenIntent(fullScreenPendingIntent, true)
                    .addAction(android.R.drawable.ic_menu_call, "Answer", answerPendingIntent)
                    .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePendingIntent);

            nm.notify(CALL_NOTIFICATION_ID, builder.build());
        } catch (Throwable t) {
            Log.e(TAG, "Error displaying incoming call notification", t);
        }
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(
                            PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                            "SadiSocial:IncomingCallWakeLock"
                    );
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(60000); // 60s max
            }
        } catch (Throwable e) {
            Log.w(TAG, "Failed to acquire wake lock", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Throwable ignored) {}
    }

    private void startRingtoneAndVibration() {
        // Ringtone
        try {
            if (ringtone == null) {
                Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                if (ringtoneUri != null) {
                    ringtone = RingtoneManager.getRingtone(getApplicationContext(), ringtoneUri);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && ringtone != null) {
                        ringtone.setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build());
                    }
                }
            }
            if (ringtone != null && !ringtone.isPlaying()) {
                ringtone.play();
            }
        } catch (Throwable e) {
            Log.w(TAG, "Failed to play native ringtone", e);
        }

        // Vibration
        try {
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 1000, 800, 1000};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Throwable ignored) {}
    }

    private void stopCallAlert() {
        // Stop ringtone
        try {
            if (ringtone != null && ringtone.isPlaying()) {
                ringtone.stop();
            }
            ringtone = null;
        } catch (Throwable ignored) {}

        // Stop vibration
        try {
            if (vibrator != null) {
                vibrator.cancel();
            }
        } catch (Throwable ignored) {}

        // Cancel notification
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(CALL_NOTIFICATION_ID);
            }
        } catch (Throwable ignored) {}

        releaseWakeLock();
        activeCaller = null;
    }

    private void declineIncomingCall(String caller) {
        String target = caller != null ? caller : activeCaller;
        if (target != null && webSocket != null) {
            try {
                JSONObject reject = new JSONObject();
                reject.put("type", "CALL_REJECT");
                reject.put("target", target);
                reject.put("sender", currentUsername);
                webSocket.send(reject.toString());
            } catch (Throwable e) {
                Log.e(TAG, "Failed to send CALL_REJECT", e);
            }
        }
    }

    @Override
    public void onDestroy() {
        isDestroyed = true;
        try {
            stopCallAlert();
            disconnectWebSocket();
        } catch (Throwable ignored) {}
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
