package com.jetson.poc;
final class RuntimeConfig {
    private RuntimeConfig() {}
    static boolean isValid(String appKey, String wssUrl) {
        return appKey != null && !appKey.trim().isEmpty()
                && wssUrl != null && wssUrl.startsWith("wss://")
                && wssUrl.length() > "wss://".length();
    }
}
