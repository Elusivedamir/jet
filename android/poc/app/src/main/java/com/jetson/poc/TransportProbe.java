package com.jetson.poc;

import android.util.Base64;
import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Debug-only raw TLS and WebSocket Upgrade probe.
 * Bypasses JuggleIM SDK and sends no credentials or message content.
 */
final class TransportProbe {
    private static final String TAG = "JetsonPoC";

    private TransportProbe() {}

    static void run(String configuredEndpoint) {
        Thread thread = new Thread(() -> {
            try {
                URI endpoint = URI.create(configuredEndpoint);
                if (!"wss".equalsIgnoreCase(endpoint.getScheme()) || endpoint.getHost() == null) {
                    throw new IllegalArgumentException("Configured endpoint is not a valid WSS URI");
                }
                String host = endpoint.getHost();
                int port = endpoint.getPort() > 0 ? endpoint.getPort() : 443;
                String path = endpoint.getRawPath();
                if (path == null || path.isEmpty()) path = "/";
                if (endpoint.getRawQuery() != null) path += "?" + endpoint.getRawQuery();

                SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
                try (SSLSocket socket = (SSLSocket) factory.createSocket(host, port)) {
                    socket.setSoTimeout(10000);
                    socket.startHandshake();
                    Log.i(TAG, "POC_TRANSPORT_TLS_OK protocol="
                            + socket.getSession().getProtocol()
                            + " cipher=" + socket.getSession().getCipherSuite());

                    byte[] nonce = new byte[16];
                    new SecureRandom().nextBytes(nonce);
                    String wsKey = Base64.encodeToString(nonce, Base64.NO_WRAP);
                    String hostHeader = host + (port == 443 ? "" : ":" + port);
                    String request = "GET " + path + " HTTP/1.1\r\n"
                            + "Host: " + hostHeader + "\r\n"
                            + "Upgrade: websocket\r\n"
                            + "Connection: Upgrade\r\n"
                            + "Sec-WebSocket-Key: " + wsKey + "\r\n"
                            + "Sec-WebSocket-Version: 13\r\n"
                            + "\r\n";
                    socket.getOutputStream().write(request.getBytes(StandardCharsets.US_ASCII));
                    socket.getOutputStream().flush();

                    BufferedReader reader = new BufferedReader(
                            new InputStreamReader(socket.getInputStream(), StandardCharsets.ISO_8859_1));
                    String status = reader.readLine();
                    if (status == null) throw new java.io.IOException("Server closed without HTTP response");
                    Log.i(TAG, "POC_TRANSPORT_WS_STATUS " + status);
                    // Consume bounded response headers; never log their values.
                    for (int i = 0; i < 40; i++) {
                        String header = reader.readLine();
                        if (header == null || header.isEmpty()) break;
                    }
                }
            } catch (Exception exception) {
                Log.e(TAG, "POC_TRANSPORT_PROBE_FAILED type="
                        + exception.getClass().getSimpleName(), exception);
            }
        }, "jetson-transport-probe");
        thread.start();
    }
}
