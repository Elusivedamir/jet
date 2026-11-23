package com.jetson.poc;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.juggle.im.JIM;
import com.juggle.im.JIMConst;
import com.juggle.im.interfaces.IConnectionManager;
import com.juggle.im.interfaces.IMessageManager;
import com.juggle.im.model.Conversation;
import com.juggle.im.model.Message;
import com.juggle.im.model.messages.TextMessage;

public final class MainActivity extends Activity {
    private static final String TAG = "JetsonPoC";
    private static final String LISTENER_KEY = "jetson-poc-main";
    private static final String DEBUG_TOKEN_EXTRA = "poc_test_token";
    private static final String DEBUG_SIGN_KEY_EXTRA = "poc_test_sign_key";
    private static final String DEBUG_PEER_EXTRA = "poc_peer_user_id";
    private static final String DEBUG_MESSAGE_EXTRA = "poc_test_message";
    private static final String DEBUG_EXPECTED_EXTRA = "poc_expected_message";

    private TextView statusView;
    private EditText tokenInput;
    private EditText signKeyInput;
    private Button connectButton;
    private Button disconnectButton;
    private IConnectionManager connectionManager;
    private IMessageManager messageManager;
    private boolean sdkConfigured;
    private boolean debugMessageSent;
    private String debugPeerUserId;
    private String debugMessage;
    private String debugExpectedMessage;

    private final IConnectionManager.IConnectionStatusListener connectionListener =
            new IConnectionManager.IConnectionStatusListener() {
                @Override
                public void onStatusChange(JIMConst.ConnectionStatus status, int code, String extra) {
                    runOnUiThread(() -> {
                        renderConnectionStatus(status, code);
                        if (status == JIMConst.ConnectionStatus.CONNECTED) {
                            sendDebugMessageIfRequested();
                        }
                    });
                }

                @Override
                public void onDbOpen() {
                    runOnUiThread(() -> appendStatus("Локальная база сообщений открыта."));
                }

                @Override
                public void onDbClose() {
                    runOnUiThread(() -> appendStatus("Локальная база сообщений закрыта."));
                }
            };

    private final IMessageManager.IMessageListener messageListener =
            new IMessageManager.IMessageListener() {
                @Override
                public void onMessageReceive(Message message) {
                    if (message == null || !(message.getContent() instanceof TextMessage)) {
                        return;
                    }
                    TextMessage text = (TextMessage) message.getContent();
                    String content = text.getContent();
                    if (debugExpectedMessage != null && debugExpectedMessage.equals(content)) {
                        Log.i(TAG, "POC_MESSAGE_RECEIVED package=" + getPackageName());
                        runOnUiThread(() -> statusView.setText("Тестовое сообщение получено."));
                    }
                }

                @Override public void onMessageRecall(Message message) {}
                @Override public void onMessageDelete(Conversation conversation, java.util.List<Long> clientMsgNos) {}
                @Override public void onMessageClear(Conversation conversation, long timestamp, String senderId) {}
                @Override public void onMessageUpdate(Message message) {}
                @Override public void onMessageReactionAdd(Conversation conversation, com.juggle.im.model.MessageReaction reaction) {}
                @Override public void onMessageReactionRemove(Conversation conversation, com.juggle.im.model.MessageReaction reaction) {}
                @Override public void onMessageSetTop(Message message, com.juggle.im.model.UserInfo operator, boolean isTop) {}
            };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        sdkConfigured = RuntimeConfig.isValid(
                BuildConfig.JUGGLE_APP_KEY,
                BuildConfig.JUGGLE_WSS_URL
        );
        if (sdkConfigured) {
            connectionManager = JIM.getInstance().getConnectionManager();
            messageManager = JIM.getInstance().getMessageManager();
        }

        buildScreen();
        if (sdkConfigured) {
            connectionManager.addConnectionStatusListener(LISTENER_KEY, connectionListener);
            messageManager.addListener(LISTENER_KEY, messageListener);
            renderConnectionStatus(connectionManager.getConnectionStatus(), 0);
        } else {
            statusView.setText("SDK не настроен. Для PoC нужны тестовые AppKey и WSS endpoint.");
            connectButton.setEnabled(false);
            disconnectButton.setEnabled(false);
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        connectFromDebugIntent();
    }

    @Override
    protected void onDestroy() {
        if (sdkConfigured) {
            connectionManager.removeConnectionStatusListener(LISTENER_KEY);
            messageManager.removeListener(LISTENER_KEY);
        }
        super.onDestroy();
    }

    private void buildScreen() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 48, 32, 32);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        TextView title = new TextView(this);
        title.setText("Jetson Messenger · Android PoC");
        title.setTextSize(22);
        root.addView(title);

        statusView = new TextView(this);
        statusView.setTextSize(16);
        statusView.setPadding(0, 28, 0, 24);
        root.addView(statusView);

        TextView tokenLabel = new TextView(this);
        tokenLabel.setText("Одноразовый тестовый IM-токен");
        tokenLabel.setTextSize(14);
        root.addView(tokenLabel);

        tokenInput = new EditText(this);
        tokenInput.setSingleLine(true);
        tokenInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        tokenInput.setHint("Вставьте токен, выданный тестовым backend");
        tokenInput.setSaveEnabled(false);
        root.addView(tokenInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView signKeyLabel = new TextView(this);
        signKeyLabel.setText("Тестовый ключ подписи App Secret");
        signKeyLabel.setTextSize(14);
        root.addView(signKeyLabel);

        signKeyInput = new EditText(this);
        signKeyInput.setSingleLine(true);
        signKeyInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        signKeyInput.setHint("Ключ подписи, выданный тестовым backend");
        signKeyInput.setSaveEnabled(false);
        root.addView(signKeyInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        connectButton = new Button(this);
        connectButton.setText("Подключить JuggleIM");
        connectButton.setOnClickListener(view -> connectWithTestToken());
        root.addView(connectButton);

        disconnectButton = new Button(this);
        disconnectButton.setText("Отключиться");
        disconnectButton.setOnClickListener(view -> disconnect());
        root.addView(disconnectButton);

        TextView note = new TextView(this);
        note.setText("Токен вводится только в память приложения, не сохраняется в настройках и очищается после передачи SDK. Не используйте production-токен.");
        note.setTextSize(12);
        note.setPadding(0, 24, 0, 0);
        root.addView(note);

        setContentView(root);
    }

    private void connectWithTestToken() {
        connectWithToken(tokenInput.getText().toString().trim(),
                signKeyInput.getText().toString().trim());
    }

    private void connectFromDebugIntent() {
        if (!BuildConfig.DEBUG) {
            return;
        }
        Intent launchIntent = getIntent();
        if (launchIntent == null || !launchIntent.hasExtra(DEBUG_TOKEN_EXTRA)) {
            return;
        }
        String token = launchIntent.getStringExtra(DEBUG_TOKEN_EXTRA);
        String signKey = launchIntent.getStringExtra(DEBUG_SIGN_KEY_EXTRA);
        debugPeerUserId = launchIntent.getStringExtra(DEBUG_PEER_EXTRA);
        debugMessage = launchIntent.getStringExtra(DEBUG_MESSAGE_EXTRA);
        debugExpectedMessage = launchIntent.getStringExtra(DEBUG_EXPECTED_EXTRA);
        launchIntent.removeExtra(DEBUG_TOKEN_EXTRA);
        launchIntent.removeExtra(DEBUG_SIGN_KEY_EXTRA);
        launchIntent.removeExtra(DEBUG_PEER_EXTRA);
        launchIntent.removeExtra(DEBUG_MESSAGE_EXTRA);
        launchIntent.removeExtra(DEBUG_EXPECTED_EXTRA);
        connectWithToken(token == null ? "" : token.trim(),
                signKey == null ? "" : signKey.trim());
    }

    private void connectWithToken(String token, String signKey) {
        tokenInput.setText("");
        signKeyInput.setText("");
        if (!sdkConfigured || connectionManager == null) {
            statusView.setText("Сначала настройте тестовые AppKey и WSS endpoint.");
            return;
        }
        if (token == null || token.isEmpty()) {
            statusView.setText("Введите тестовый токен, выданный сервером.");
            return;
        }
        if (signKey == null || signKey.isEmpty()) {
            statusView.setText("Не задан ключ подписи App Secret. Подключение остановлено.");
            return;
        }

        statusView.setText("Передаю тестовые параметры SDK. Ожидаю состояние соединения…");
        try {
            connectionManager.setConnectParams(signKey, java.util.Collections.emptyMap());
            connectionManager.connect(token);
        } catch (RuntimeException exception) {
            Log.e(TAG, "JuggleIM connect invocation failed", exception);
            statusView.setText("Не удалось начать подключение. Проверьте endpoint, AppKey, ключ подписи и тестовый токен.");
        }
    }

    private void sendDebugMessageIfRequested() {
        if (!BuildConfig.DEBUG || debugMessageSent || debugPeerUserId == null
                || debugPeerUserId.trim().isEmpty() || debugMessage == null
                || debugMessage.isEmpty() || messageManager == null) {
            return;
        }
        debugMessageSent = true;
        Conversation conversation = new Conversation(
                Conversation.ConversationType.PRIVATE,
                debugPeerUserId
        );
        TextMessage content = new TextMessage(debugMessage);
        messageManager.sendMessage(content, conversation, new IMessageManager.ISendMessageCallback() {
            @Override
            public void onSuccess(Message message) {
                Log.i(TAG, "POC_MESSAGE_SENT package=" + getPackageName()
                        + " messageId=" + (message == null ? "missing" : message.getMessageId()));
                runOnUiThread(() -> statusView.setText("Тестовое сообщение отправлено и подтверждено SDK."));
            }

            @Override
            public void onError(Message message, int errorCode) {
                Log.e(TAG, "POC_MESSAGE_SEND_FAILED code=" + errorCode);
                runOnUiThread(() -> statusView.setText("Не удалось отправить тестовое сообщение. Код: " + errorCode));
            }
        });
    }

    private void disconnect() {
        if (connectionManager == null) {
            return;
        }
        try {
            connectionManager.disconnect(false);
            statusView.setText("Запрошено отключение от JuggleIM.");
        } catch (RuntimeException exception) {
            Log.e(TAG, "JuggleIM disconnect invocation failed", exception);
            statusView.setText("Не удалось выполнить отключение.");
        }
    }

    private void renderConnectionStatus(JIMConst.ConnectionStatus status, int code) {
        if (status == null) {
            statusView.setText("Состояние соединения пока неизвестно.");
            return;
        }
        Log.i(TAG, "JuggleIM connection state=" + status + " code=" + code
                + " package=" + getPackageName());
        switch (status) {
            case CONNECTED:
                statusView.setText("JuggleIM: соединение установлено.");
                break;
            case CONNECTING:
                statusView.setText("JuggleIM: выполняется подключение…");
                break;
            case DISCONNECTED:
                statusView.setText("JuggleIM: соединение отсутствует.");
                break;
            case FAILURE:
                statusView.setText("JuggleIM: ошибка подключения. Код: " + code);
                break;
            case IDLE:
            default:
                statusView.setText("JuggleIM: ожидание подключения.");
                break;
        }
    }

    private void appendStatus(String message) {
        if (statusView != null) {
            statusView.setText(statusView.getText() + "\n" + message);
        }
    }
}
