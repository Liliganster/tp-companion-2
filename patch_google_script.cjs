const fs = require('fs');
const file = 'api/google.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Add flow to state
content = content.replace(
  `  const state = buildSignedState({
    userId: user.id,
    returnTo,
    scopes: [...requested],
    exp: Date.now() + 10 * 60 * 1000,
    nonce: Math.random().toString(16).slice(2),
  });`,
  `  const state = buildSignedState({
    userId: user.id,
    returnTo,
    scopes: [...requested],
    exp: Date.now() + 10 * 60 * 1000,
    nonce: Math.random().toString(16).slice(2),
    flow: body?.flow === "popup" ? "popup" : "redirect",
  });`
);

// 2. Handle state expiration in a popup
content = content.replace(
  `  if (typeof state.exp === "number" && Date.now() > state.exp) return sendJson(res, 400, { error: "State expired" });`,
  `  if (typeof state.exp === "number" && Date.now() > state.exp) {
    if (state.flow === "popup") {
      res.statusCode = 200; res.setHeader("Content-Type", "text/html");
      res.end('<html><body><script>if(window.opener) window.opener.postMessage({ type: "OAUTH_ERROR", error: "state_expired" }, "*"); window.close();</script></body></html>');
      return;
    }
    return sendJson(res, 400, { error: "State expired" });
  }`
);

// 3. Handle popup success HTML vs redirect
content = content.replace(
  `  const rawReturnTo = typeof state.returnTo === "string" ? state.returnTo : "/";
  let returnTo = "/";
  if (rawReturnTo.startsWith("/")) {
    returnTo = rawReturnTo;
  } else {
    try {
      const url = new URL(rawReturnTo);
      if (url.protocol === "https:" || url.protocol === "http:") returnTo = url.toString();
    } catch { /* ignore */ }
  }
  res.statusCode = 302; res.setHeader("Location", returnTo); res.end();
}`,
  `  if (state.flow === "popup") {
    res.statusCode = 200; res.setHeader("Content-Type", "text/html");
    res.end(\`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: "OAUTH_SUCCESS", scopes: "\${mergedScopes}" }, "*");
            }
            window.close();
          </script>
        </body>
      </html>
    \`);
    return;
  }

  const rawReturnTo = typeof state.returnTo === "string" ? state.returnTo : "/";
  let returnTo = "/";
  if (rawReturnTo.startsWith("/")) {
    returnTo = rawReturnTo;
  } else {
    try {
      const url = new URL(rawReturnTo);
      if (url.protocol === "https:" || url.protocol === "http:") returnTo = url.toString();
    } catch { /* ignore */ }
  }
  res.statusCode = 302; res.setHeader("Location", returnTo); res.end();
}`
);

fs.writeFileSync(file, content);
console.log("Done patching api/google.ts");
