# Authentication CAPTCHA deployment

This implementation uses Cloudflare Turnstile. Supabase validates the token on the server; the client-side button state alone is not abuse protection.

1. Create a Managed Turnstile widget for dashboard.fahrtenbuchpro.com and auth.fahrtenbuchpro.com. Use a separate test widget for previews/local testing.
2. Set the public site key as VITE_TURNSTILE_SITE_KEY in Vercel Production and redeploy this code. Never put the secret key in a VITE variable or Git.
3. Check the widget renders and completes on both production domains before enabling enforcement.
4. In Supabase Authentication > Attack Protection, select Turnstile, enter its secret key, enable CAPTCHA and save.
5. Test signup, email login, Google login and recovery with a disposable test account. Check requests without a token or with expired/reused tokens fail, while fresh valid tokens succeed. Do not consume a token with a separate verification request before Supabase receives it.

The widget clears tokens on expiry, error, mode changes and after requests. Failed loading offers a retry. Omitting the site key keeps the previous frontend behavior for staged deployment; never enable Supabase CAPTCHA until the production frontend has a valid site key.

Status: implementation prepared locally; production provider setup and end-to-end checks pending.
