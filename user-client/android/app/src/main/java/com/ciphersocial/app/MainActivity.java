package com.ciphersocial.app;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaScannerConnection;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int PERMISSION_REQUEST_CODE = 1001;
    public static volatile boolean isActivityVisible = false;

    private Ringtone activeRingtone = null;
    private ToneGenerator ringbackToneGen = null;
    private Vibrator vibrator = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Turn screen on and show over lockscreen when a call arrives or user launches app
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }

        // Request runtime permissions: only DANGEROUS permissions should be passed to requestPermissions!
        List<String> permissions = new ArrayList<>();
        permissions.add(Manifest.permission.RECORD_AUDIO);
        permissions.add(Manifest.permission.CAMERA);

        if (Build.VERSION.SDK_INT >= 33) { // Android 13+ (TIRAMISU)
            permissions.add("android.permission.POST_NOTIFICATIONS");
        }

        List<String> permissionsToRequest = new ArrayList<>();
        for (String perm : permissions) {
            try {
                if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                    permissionsToRequest.add(perm);
                }
            } catch (Throwable ignored) {}
        }

        if (!permissionsToRequest.isEmpty()) {
            try {
                ActivityCompat.requestPermissions(
                    this,
                    permissionsToRequest.toArray(new String[0]),
                    PERMISSION_REQUEST_CODE
                );
            } catch (Throwable ignored) {}
        }

        // Expose JavaScript Interface to React Web App
        try {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void startCallService(String username, String wsUrl) {
                        try {
                            CallBackgroundService.startService(MainActivity.this, username, wsUrl);
                        } catch (Throwable ignored) {}
                    }

                    @JavascriptInterface
                    public void stopCallService() {
                        try {
                            CallBackgroundService.stopService(MainActivity.this);
                        } catch (Throwable ignored) {}
                    }

                    @JavascriptInterface
                    public void dismissRingtone() {
                        try {
                            stopIncomingRingtoneInternal();
                            stopRingbackInternal();
                            CallBackgroundService.dismissRingtone(MainActivity.this);
                        } catch (Throwable ignored) {}
                    }

                    // Native file saving to public Downloads folder
                    @JavascriptInterface
                    public void saveFile(String base64Data, String fileName, String mimeType) {
                        saveFileToDownloads(base64Data, fileName, mimeType);
                    }

                    // System audio stream routing (STREAM_SYSTEM / STREAM_NOTIFICATION / STREAM_RING)
                    @JavascriptInterface
                    public void playSystemSound(String soundType) {
                        handlePlaySystemSound(soundType);
                    }

                    @JavascriptInterface
                    public void startIncomingRingtone() {
                        startIncomingRingtoneInternal();
                    }

                    @JavascriptInterface
                    public void stopIncomingRingtone() {
                        stopIncomingRingtoneInternal();
                    }
                }, "AndroidCallBridge");
            }
        } catch (Throwable ignored) {}
    }

    private void saveFileToDownloads(String base64Data, String fileName, String mimeType) {
        new Thread(() -> {
            try {
                if (base64Data == null || base64Data.isEmpty()) return;
                String cleanBase64 = base64Data;
                if (cleanBase64.contains(",")) {
                    cleanBase64 = cleanBase64.substring(cleanBase64.indexOf(",") + 1);
                }
                byte[] bytes = Base64.decode(cleanBase64, Base64.DEFAULT);

                String cleanFileName = (fileName != null && !fileName.trim().isEmpty())
                        ? fileName.trim()
                        : ("download_" + System.currentTimeMillis());
                cleanFileName = cleanFileName.replaceAll("[\\\\/:*?\"<>|]", "_");

                String resolvedMime = (mimeType != null && !mimeType.trim().isEmpty())
                        ? mimeType.trim()
                        : "application/octet-stream";

                boolean success = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // Android 10+
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, cleanFileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, resolvedMime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri != null) {
                        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                            if (os != null) {
                                os.write(bytes);
                                os.flush();
                                success = true;
                            }
                        }
                    }
                } else { // Android 9 and below
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!downloadsDir.exists()) downloadsDir.mkdirs();
                    File destFile = new File(downloadsDir, cleanFileName);
                    try (FileOutputStream fos = new FileOutputStream(destFile)) {
                        fos.write(bytes);
                        fos.flush();
                        success = true;
                    }
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{destFile.getAbsolutePath()}, new String[]{resolvedMime}, null);
                }

                if (success) {
                    final String finalName = cleanFileName;
                    runOnUiThread(() -> {
                        Toast.makeText(MainActivity.this, "Saved " + finalName + " to Downloads", Toast.LENGTH_SHORT).show();
                    });
                }
            } catch (Throwable t) {
                Log.e(TAG, "Error saving file to Downloads", t);
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "Failed to save file: " + t.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        }).start();
    }

    private void handlePlaySystemSound(String soundType) {
        try {
            if ("message_sent".equals(soundType)) {
                // STREAM_SYSTEM routes to System sounds volume (not Media)
                ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_SYSTEM, 90);
                tg.startTone(ToneGenerator.TONE_PROP_BEEP, 100);
            } else if ("message_received".equals(soundType)) {
                // STREAM_NOTIFICATION routes to Notification volume (not Media)
                Uri alert = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                Ringtone r = RingtoneManager.getRingtone(getApplicationContext(), alert);
                if (r != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        r.setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build());
                    }
                    r.play();
                }
            } else if ("call_ended".equals(soundType)) {
                // STREAM_RING routes to Ringtone volume
                ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_RING, 90);
                tg.startTone(ToneGenerator.TONE_PROP_PROMPT, 300);
            } else if ("ringback_start".equals(soundType)) {
                stopRingbackInternal();
                ringbackToneGen = new ToneGenerator(AudioManager.STREAM_RING, 80);
                ringbackToneGen.startTone(ToneGenerator.TONE_SUP_RINGTONE);
            } else if ("ringback_stop".equals(soundType)) {
                stopRingbackInternal();
            }
        } catch (Throwable t) {
            Log.w(TAG, "Error playing system sound: " + soundType, t);
        }
    }

    private void startIncomingRingtoneInternal() {
        try {
            stopIncomingRingtoneInternal();
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            activeRingtone = RingtoneManager.getRingtone(getApplicationContext(), ringtoneUri);
            if (activeRingtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    activeRingtone.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
                }
                activeRingtone.play();
            }

            if (vibrator == null) {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 1000, 800, 1000};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "Error starting incoming ringtone", t);
        }
    }

    private void stopIncomingRingtoneInternal() {
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) {
                activeRingtone.stop();
            }
            activeRingtone = null;
            if (vibrator != null) {
                vibrator.cancel();
            }
        } catch (Throwable ignored) {}
    }

    private void stopRingbackInternal() {
        try {
            if (ringbackToneGen != null) {
                ringbackToneGen.stopTone();
                ringbackToneGen.release();
                ringbackToneGen = null;
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public void onStart() {
        super.onStart();
        isActivityVisible = true;
        try {
            stopIncomingRingtoneInternal();
            stopRingbackInternal();
            CallBackgroundService.dismissRingtone(this);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        isActivityVisible = true;
        try {
            stopIncomingRingtoneInternal();
            stopRingbackInternal();
            CallBackgroundService.dismissRingtone(this);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        isActivityVisible = false;
        try {
            stopIncomingRingtoneInternal();
            stopRingbackInternal();
        } catch (Throwable ignored) {}
    }

    @Override
    public void onStop() {
        super.onStop();
        isActivityVisible = false;
        try {
            stopIncomingRingtoneInternal();
            stopRingbackInternal();
        } catch (Throwable ignored) {}
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        isActivityVisible = true;
        try {
            stopIncomingRingtoneInternal();
            stopRingbackInternal();
            CallBackgroundService.dismissRingtone(this);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onDestroy() {
        try {
            stopIncomingRingtoneInternal();
            stopRingbackInternal();
        } catch (Throwable ignored) {}
        super.onDestroy();
    }
}
