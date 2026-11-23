package com.jetson.poc;
import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
public final class MainActivity extends Activity {
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView status = new TextView(this);
        status.setText(RuntimeConfig.isValid(BuildConfig.JUGGLE_APP_KEY, BuildConfig.JUGGLE_WSS_URL)
                ? "Jetson Android PoC\nSDK initialized. Backend-issued test token is still required."
                : "Jetson Android PoC\nConfiguration is empty. No server connection is made.");
        status.setTextSize(18);
        status.setPadding(32, 48, 32, 32);
        setContentView(status);
    }
}
