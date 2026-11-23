package com.jetson.poc;

import java.net.URI;
import java.net.URISyntaxException;

final class RuntimeConfig {
    private RuntimeConfig() {}

    static boolean isValid(String appKey, String wssUrl) {
        if (appKey == null || appKey.trim().isEmpty() || wssUrl == null) {
            return false;
        }

        try {
            URI endpoint = new URI(wssUrl);
            int port = endpoint.getPort();
            return "wss".equalsIgnoreCase(endpoint.getScheme())
                    && endpoint.getHost() != null
                    && !endpoint.getHost().isEmpty()
                    && endpoint.getUserInfo() == null
                    && endpoint.getFragment() == null
                    && (port == -1 || (port >= 1 && port <= 65535));
        } catch (URISyntaxException exception) {
            return false;
        }
    }
}
