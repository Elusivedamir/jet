package com.jetson.poc;

import android.app.Application;
import android.util.Log;

import com.juggle.im.JIM;
import com.juggle.im.JIM.InitConfig;
import com.juggle.im.internal.logger.JLogConfig;
import com.juggle.im.internal.logger.JLogLevel;

import java.util.Collections;

public final class JetsonApplication extends Application {
    private static final String TAG = "JetsonPoC";

    @Override public void onCreate() {
        super.onCreate();
        if (!RuntimeConfig.isValid(BuildConfig.JUGGLE_APP_KEY, BuildConfig.JUGGLE_WSS_URL)) {
            Log.i(TAG, "PoC is not configured. No IM connection will be opened.");
            return;
        }
        JIM.getInstance().setServerUrls(Collections.singletonList(BuildConfig.JUGGLE_WSS_URL));

        // Temporary PoC diagnostics: expose SDK sync stages (without logging credentials
        // or message bodies) so a stalled post-CONNECTED pipeline can be located.
        JLogConfig logConfig = new JLogConfig.Builder(this)
                .setLogConsoleLevel(JLogLevel.JLogLevelVerbose)
                .build();
        InitConfig initConfig = new InitConfig.Builder()
                .setJLogConfig(logConfig)
                .build();
        JIM.getInstance().init(this, BuildConfig.JUGGLE_APP_KEY, initConfig);
        Log.i(TAG, "JuggleIM initialized; SDK diagnostic logging enabled; no user session has been opened.");
    }
}
