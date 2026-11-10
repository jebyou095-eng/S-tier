package app.pocketstats;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Pocket Stats for Android: hosts the app (assets/index.html) in a WebView.
 *
 * The page is served from a virtual https origin so the browser treats it as a
 * secure context (needed for encryption and the camera). It never loads anything
 * from the internet except the food-database requests you allow inside the app.
 * Your data lives in this app's private storage and is excluded from cloud backup.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/index.html";
    private static final int REQ_CAMERA = 1;
    private static final int REQ_PICK_FILE = 2;
    private static final int REQ_SAVE_FILE = 3;

    private WebView web;
    private PermissionRequest pendingPermission;
    private ValueCallback<Uri[]> pendingFileCallback;
    private String pendingSaveText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        // The page's light/dark theme follows this activity theme.
        setTheme(dark ? android.R.style.Theme_Material_NoActionBar : android.R.style.Theme_Material_Light_NoActionBar);
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(dark ? Color.rgb(20, 20, 20) : Color.rgb(246, 245, 242));
        getWindow().setNavigationBarColor(dark ? Color.rgb(31, 31, 30) : Color.WHITE);
        if (!dark) {
            getWindow().getDecorView().setSystemUiVisibility(0x00002000 /* LIGHT_STATUS_BAR */);
        }

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setSaveFormData(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) return null; // food databases: normal network
                String path = url.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                try {
                    InputStream in = getAssets().open(path.substring(1));
                    String mime = path.endsWith(".html") ? "text/html"
                            : path.endsWith(".json") ? "application/json"
                            : path.endsWith(".webp") ? "image/webp"
                            : path.endsWith(".jpg") ? "image/jpeg"
                            : path.endsWith(".png") ? "image/png"
                            : "application/octet-stream";
                    return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, in);
                } catch (IOException e) {
                    // Unknown local path: answer 404 here so nothing goes out to the network.
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                            new ByteArrayInputStream(new byte[0]));
                }
            }

            @Override
            @SuppressWarnings("deprecation") // the String form works on every Android version
            public boolean shouldOverrideUrlLoading(WebView view, String link) {
                Uri url = Uri.parse(link);
                if (HOST.equals(url.getHost())) return false;
                // Links such as PubMed references open in your normal browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException ignored) {
                    // no browser installed
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        boolean wantsCamera = false;
                        for (String r : request.getResources()) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                        }
                        if (!wantsCamera || !HOST.equals(request.getOrigin().getHost())) {
                            request.deny();
                            return;
                        }
                        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                        } else {
                            pendingPermission = request;
                            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                        }
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingFileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "PocketStatsAndroid");
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START);
    }

    /** Small bridge used by the page: save a backup file and toggle screen privacy. */
    private class Bridge {
        @JavascriptInterface
        public void save(final String filename, final String mime, final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingSaveText = text;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    i.putExtra(Intent.EXTRA_TITLE, filename);
                    try {
                        startActivityForResult(i, REQ_SAVE_FILE);
                    } catch (ActivityNotFoundException e) {
                        pendingSaveText = null;
                        Toast.makeText(MainActivity.this, "No app available to save files", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void setSecure(final boolean secure) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (secure) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (code != REQ_CAMERA || pendingPermission == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            pendingPermission.deny();
        }
        pendingPermission = null;
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_PICK_FILE && pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingFileCallback = null;
        } else if (code == REQ_SAVE_FILE) {
            String text = pendingSaveText;
            pendingSaveText = null;
            if (result != RESULT_OK || data == null || data.getData() == null || text == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
            } catch (IOException | NullPointerException e) {
                Toast.makeText(this, "Couldn't save the file", Toast.LENGTH_LONG).show();
            }
        } else {
            super.onActivityResult(code, result, data);
        }
    }

    @Override
    public void onBackPressed() {
        // Back closes an open sheet or dialog first; otherwise it leaves the app.
        web.evaluateJavascript(
                "(function(){var d=document.querySelector('dialog[open]');"
                        + "if(d){d.dispatchEvent(new Event('cancel',{cancelable:true}));return 1}return 0})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (!"1".equals(value)) MainActivity.super.onBackPressed();
                    }
                });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
