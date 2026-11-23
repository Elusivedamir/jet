package com.jetson.poc;
import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
public class RuntimeConfigTest {
    @Test public void acceptsPublicAppKeyAndSecureWebSocketUrl() {
        assertTrue(RuntimeConfig.isValid("public-app-key", "wss://im.example.test"));
    }
    @Test public void rejectsMissingAppKey() {
        assertFalse(RuntimeConfig.isValid("", "wss://im.example.test"));
        assertFalse(RuntimeConfig.isValid(null, "wss://im.example.test"));
    }
    @Test public void rejectsInsecureOrMalformedEndpoint() {
        assertFalse(RuntimeConfig.isValid("public-app-key", "ws://im.example.test"));
        assertFalse(RuntimeConfig.isValid("public-app-key", "https://im.example.test"));
        assertFalse(RuntimeConfig.isValid("public-app-key", "wss://"));
        assertFalse(RuntimeConfig.isValid("public-app-key", null));
    }
}
