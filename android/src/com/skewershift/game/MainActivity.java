package com.skewershift.game;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;
import org.json.JSONException;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int BACKGROUND = Color.rgb(21, 23, 20);
    private static final String CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        + "img-src 'self' data: blob:; font-src 'self'; media-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; base-uri 'none'";
    private static final Map<String, String> ASSET_HEADERS = new HashMap<>();
    static {
        ASSET_HEADERS.put("Content-Security-Policy", CSP);
        ASSET_HEADERS.put("X-Content-Type-Options", "nosniff");
    }
    private final ExecutorService network = Executors.newFixedThreadPool(2);
    private WebView game;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(BACKGROUND);
        game = new WebView(this);
        game.setBackgroundColor(BACKGROUND);
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        game.setWebViewClient(new LocalGameClient());
        game.addJavascriptInterface(new Bridge(), "SkewerAndroid");
        container.addView(game, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 35) {
            container.setOnApplyWindowInsetsListener((view, windowInsets) -> {
                int types = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();
                Insets insets = windowInsets.getInsets(types);
                view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(container);
        game.loadUrl("https://" + HOST + "/");
    }

    @Override protected void onPause() {
        game.evaluateJavascript("window.dispatchEvent(new Event('skewer-native-pause'))", null);
        game.onPause();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        game.onResume();
    }

    @Override protected void onDestroy() {
        network.shutdownNow();
        game.removeJavascriptInterface("SkewerAndroid");
        ((FrameLayout) game.getParent()).removeView(game);
        game.destroy();
        super.onDestroy();
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1;
    }

    private final class LocalGameClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            return !isLocal(uri) || !"/".equals(uri.getPath());
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String path = uri.getPath();
            if (!isLocal(uri) || !"GET".equals(request.getMethod()) || path == null || !path.matches("/[A-Za-z0-9/_.-]*")
                || path.contains("..") || path.startsWith("/api/")) return emptyResponse(403, "Forbidden");
            String asset = "/".equals(path) ? "index.html" : path.substring(1);
            try {
                return new WebResourceResponse(mime(asset), "UTF-8", 200, "OK", ASSET_HEADERS, getAssets().open("web/" + asset));
            } catch (IOException missing) {
                return emptyResponse(404, "Not found");
            }
        }
    }

    private static String mime(String asset) {
        if (asset.endsWith(".html")) return "text/html";
        if (asset.endsWith(".js")) return "text/javascript";
        if (asset.endsWith(".css")) return "text/css";
        if (asset.endsWith(".svg")) return "image/svg+xml";
        if (asset.endsWith(".png")) return "image/png";
        if (asset.endsWith(".woff2")) return "font/woff2";
        if (asset.endsWith(".webmanifest")) return "application/manifest+json";
        return "application/octet-stream";
    }

    private static WebResourceResponse emptyResponse(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason, Collections.emptyMap(),
            new ByteArrayInputStream(new byte[0]));
    }

    public final class Bridge {
        @JavascriptInterface public String shareUrl() {
            return BuildConfig.SHARE_URL;
        }

        @JavascriptInterface public void share(String title, String text, String url) {
            if (title == null || text == null || url == null || text.length() > 4096 || url.length() > 2048) return;
            if (!url.isEmpty() && !url.startsWith("https://")) return;
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.putExtra(Intent.EXTRA_SUBJECT, title);
                intent.putExtra(Intent.EXTRA_TEXT, url.isEmpty() ? text : text + "\n" + url);
                if (url.isEmpty()) {
                    Uri apk = Uri.parse("content://" + getPackageName() + ".share/Skewer-Shift.apk");
                    intent.setType(ApkShareProvider.MIME);
                    intent.putExtra(Intent.EXTRA_STREAM, apk);
                    intent.setClipData(ClipData.newRawUri("Skewer Shift", apk));
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } else {
                    intent.setType("text/plain");
                }
                startActivity(Intent.createChooser(intent, "Share Skewer Shift"));
            });
        }

        @JavascriptInterface public void request(String id, String method, String path, String auth, String body) {
            if (id == null || !id.matches("[0-9]{1,15}")) return;
            boolean allowed = ("POST".equals(method) && ("/api/player".equals(path) || "/api/redeem".equals(path)))
                || ("GET".equals(method) && "/api/receipts".equals(path));
            if (!allowed || body == null || body.length() > 1024 || auth == null || auth.length() > 150
                || (!auth.isEmpty() && !auth.matches("Bearer [A-Za-z0-9_-]+"))) {
                reply(id, 400, error("invalid_request", "The code request is invalid."));
                return;
            }
            if (BuildConfig.API_ORIGIN.isEmpty()) {
                replyToPreview(id, path, body);
                return;
            }
            network.execute(() -> requestApi(id, method, path, auth, body));
        }
    }

    private void replyToPreview(String id, String path, String body) {
        if ("/api/player".equals(path)) {
            reply(id, 201, "{\"token\":\"preview_00000000000000000000000000000000000\"}");
            return;
        }
        if ("/api/receipts".equals(path)) {
            reply(id, 200, "{\"receipts\":[]}");
            return;
        }
        try {
            String code = new JSONObject(body).optString("code").trim().toUpperCase(Locale.ROOT);
            if (!"WELCOME".equals(code)) {
                reply(id, 404, error("preview_code", "The offline APK accepts WELCOME. Other codes require a live code server."));
                return;
            }
            reply(id, 200, "{\"receipt\":{\"id\":\"preview-welcome\",\"campaign\":\"preview-welcome\","
                + "\"label\":\"Welcome gift\",\"coins\":300,\"boosters\":{\"collect\":2,\"shuffle\":2,\"time\":2,\"open\":2},"
                + "\"claimedAt\":" + JSONObject.quote(Instant.now().toString()) + "},\"alreadyClaimed\":false}");
        } catch (JSONException invalid) {
            reply(id, 400, error("invalid_request", "The reward request was unreadable."));
        }
    }

    private void requestApi(String id, String method, String path, String auth, String body) {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(BuildConfig.API_ORIGIN + path).openConnection();
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(8000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            if (!auth.isEmpty()) connection.setRequestProperty("Authorization", auth);
            if ("POST".equals(method) && !body.isEmpty()) {
                byte[] data = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(data.length);
                try (OutputStream stream = connection.getOutputStream()) { stream.write(data); }
            }
            int status = connection.getResponseCode();
            String type = connection.getContentType();
            if (status < 200 || status == 204 || status == 205 || (status >= 300 && status < 400)
                || type == null || !type.startsWith("application/json")) throw new IOException("Invalid API response");
            try (InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) {
                if (stream == null) throw new IOException("Missing API response");
                ByteArrayOutputStream result = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                for (int count; (count = stream.read(buffer)) != -1;) {
                    if (result.size() + count > 131072) throw new IOException("API response too large");
                    result.write(buffer, 0, count);
                }
                reply(id, status, new String(result.toByteArray(), StandardCharsets.UTF_8));
            }
        } catch (IOException failure) {
            reply(id, 503, error("service_unavailable", "The code service is unavailable. Try again when you are online."));
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String error(String code, String message) {
        return "{\"error\":" + JSONObject.quote(code) + ",\"message\":" + JSONObject.quote(message) + "}";
    }

    private void reply(String id, int status, String body) {
        runOnUiThread(() -> {
            if (!isFinishing() && !isDestroyed()) {
                String call = "window.skewerApiReply?.(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(body) + ")";
                game.evaluateJavascript(call, null);
            }
        });
    }
}
