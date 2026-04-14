package com.sling.app;

import android.os.Bundle;
import android.os.Message;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Enable JavaScript popups and multiple windows support
        WebView webView = this.getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        
        // Spoof User Agent to bypass "disallowed_useragent" error
        String userAgent = settings.getUserAgentString();
        // Remove "Version/X.X" and "wv" which identify it as a WebView
        userAgent = userAgent.replaceAll("; wv\\)", ")")
                             .replaceAll("Version\\/\\d+\\.\\d+\\s+", "");
        settings.setUserAgentString(userAgent);
        
        // Handle popup windows (required for Firebase signInWithPopup)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                final WebView newWebView = new WebView(MainActivity.this);
                WebSettings newSettings = newWebView.getSettings();
                newSettings.setJavaScriptEnabled(true);
                newSettings.setJavaScriptCanOpenWindowsAutomatically(true);
                newSettings.setSupportMultipleWindows(true);
                
                // Apply User Agent spoofing to the popup window as well
                String popupUserAgent = newSettings.getUserAgentString();
                popupUserAgent = popupUserAgent.replaceAll("; wv\\)", ")")
                                             .replaceAll("Version\\/\\d+\\.\\d+\\s+", "");
                newSettings.setUserAgentString(popupUserAgent);
                
                newWebView.setLayoutParams(new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
                
                final ViewGroup rootView = (ViewGroup) getWindow().getDecorView().findViewById(android.R.id.content);
                rootView.addView(newWebView);
                
                newWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        super.onCloseWindow(window);
                        rootView.removeView(newWebView);
                    }
                });
                
                newWebView.setWebViewClient(new WebViewClient());

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(newWebView);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }
}
