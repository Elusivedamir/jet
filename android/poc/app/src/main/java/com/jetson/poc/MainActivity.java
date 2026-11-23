package com.jetson.poc;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.juggle.im.JIM;
import com.juggle.im.JIMConst;
import com.juggle.im.interfaces.IConnectionManager;

public final class MainActivity extends Activity {
    private static final String LISTENER_KEY = "jetson-poc-main";

    private TextView statusView;
    private EditText tokenInput;
    private Button connectButton;
    private Button disconnectButton;
    private IConnectionManager connectionManager;
    private boolean sdkConfigured;

    private final IConnectionManager.IConnectionStatusListener connectionListener =
            new IConnectionManager.IConnectionStatusListener() {
                @Override
                public void onStatusChange(JIMConst.ConnectionStatus status, int code, String extra) {
                    runOnUiThread(() -> renderConnectionStatus(status, code));
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        sdkConfigured = RuntimeConfig.isValid(
                BuildConfig.JUGGLE_APP_KEY,
                BuildConfig.JUGGLE_WSS_URL
        );
        if (sdkConfigured) {
            connectionManager = JIM.getInstance().getConnectionManager();
        }

        buildScreen();
        if (sdkConfigured) {
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
        if (sdkConfigured) {
            connectionManager.addConnectionStatusListener(LISTENER_KEY, connectionListener);
            renderConnectionStatus(connectionManager.getConnectionStatus(), 0);
        }
    }

    @Override
    protected void onStop() {
        if (sdkConfigured) {
            connectionManager.removeConnectionStatusListener(LISTENER_KEY);
        }
        super.onStop();
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
        if (!sdkConfigured || connectionManager == null) {
            statusView.setText("Сначала настройте тестовые AppKey и WSS endpoint.");
            return;
        }

        String token = tokenInput.getText().toString().trim();
        tokenInput.setText("");
        if (token.isEmpty()) {
            statusView.setText("Введите тестовый токен, выданный сервером.");
            return;
        }

        statusView.setText("Передаю токен SDK. Ожидаю состояние соединения…");
        try {
            connectionManager.connect(token);
        } catch (RuntimeException exception) {
            statusView.setText("Не удалось начать подключение. Проверьте endpoint, AppKey и тестовый токен.");
        }
    }

    private void disconnect() {
        if (connectionManager == null) {
            return;
        }
        try {
            connectionManager.disconnect(false);
            statusView.setText("Запрошено отключение от JuggleIM.");
        } catch (RuntimeException exception) {
            statusView.setText("Не удалось выполнить отключение.");
        }
    }

    private void renderConnectionStatus(JIMConst.ConnectionStatus status, int code) {
        if (status == null) {
            statusView.setText("Состояние соединения пока неизвестно.");
            return;
        }
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
