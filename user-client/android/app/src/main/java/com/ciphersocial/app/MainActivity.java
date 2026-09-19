package com.ciphersocial.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_CODE = 1001;
    public static volatile boolean isActivityVisible = false;

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

        // Request audio, camera, and notification permissions
        List<String> permissions = new ArrayList<>();
        permissions.add(Manifest.permission.RECORD_AUDIO);
        permissions.add(Manifest.permission.CAMERA);
        permissions.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);

        if (Build.VERSION.SDK_INT >= 33) { // Android 13+ (TIRAMISU)
            permissions.add("android.permission.POST_NOTIFICATIONS");
        }

        List<String> permissionsToRequest = new ArrayList<>();
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(perm);
            }
        }

        if (!permissionsToRequest.isEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toArray(new String[0]),
                PERMISSION_REQUEST_CODE
            );
        }

        // Expose JavaScript Interface to React Web App
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void startCallService(String username, String wsUrl) {
                    CallBackgroundService.startService(MainActivity.this, username, wsUrl);
                }

                @JavascriptInterface
                public void stopCallService() {
                    CallBackgroundService.stopService(MainActivity.this);
                }

                @JavascriptInterface
                public void dismissRingtone() {
                    CallBackgroundService.dismissRingtone(MainActivity.this);
                }
            }, "AndroidCallBridge");
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        isActivityVisible = true;
        CallBackgroundService.dismissRingtone(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        isActivityVisible = true;
        CallBackgroundService.dismissRingtone(this);
    }

    @Override
    public void onPause() {
        super.onPause();
        isActivityVisible = false;
    }

    @Override
    public void onStop() {
        super.onStop();
        isActivityVisible = false;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        isActivityVisible = true;
        CallBackgroundService.dismissRingtone(this);
    }
}
