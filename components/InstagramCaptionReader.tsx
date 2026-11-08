/**
 * Reads an Instagram post's caption on Android. The Instagram app won't let
 * you copy a caption, but Instagram's public embed page (the one websites use
 * to show a post) has it as text. That page only fills in inside a real
 * browser, so this opens it in an invisible web view on the phone, waits for
 * the caption to appear, and hands back its HTML. Nothing goes through our
 * server, so it costs nothing.
 *
 * The web app can't read another site's page this way; see the .web version.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

const TIMEOUT_MS = 20_000;

/**
 * Runs in the embed page: posts the caption element's HTML once it's there,
 * or an empty string if the page says the post is unavailable or nothing shows
 * after a while.
 */
const READ_CAPTION = `(function () {
  var tries = 0;
  function send(html) { window.ReactNativeWebView.postMessage(JSON.stringify({ caption: html })); }
  function look() {
    var caption = document.querySelector('.Caption');
    if (caption) return send(caption.outerHTML);
    if (document.querySelector('.EmbedBrokenMedia') || ++tries > 60) return send('');
    setTimeout(look, 250);
  }
  look();
})(); true;`;

type Props = {
  embedUrl: string;
  /** The caption element's HTML, or null when the caption couldn't be read. */
  onDone: (captionHtml: string | null) => void;
};

export default function InstagramCaptionReader({ embedUrl, onDone }: Props) {
  const done = useRef(false);
  const finish = (html: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(html);
  };

  useEffect(() => {
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const { caption } = JSON.parse(e.nativeEvent.data) as { caption?: string };
      finish(caption || null);
    } catch {
      finish(null);
    }
  };

  return (
    <View style={styles.hidden} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        source={{ uri: embedUrl }}
        injectedJavaScript={READ_CAPTION}
        onMessage={onMessage}
        onError={() => finish(null)}
        onHttpError={() => finish(null)}
        // Links in the embed open Instagram; stay on the embed page.
        onShouldStartLoadWithRequest={(req) => req.url.startsWith(embedUrl) || !req.isTopFrame}
        incognito
        mediaPlaybackRequiresUserAction
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 360, height: 640, left: -10000, top: 0, opacity: 0 },
  web: { flex: 1 },
});
