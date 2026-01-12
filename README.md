# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Google Maps (Trips map)

The trip detail modal uses Google Maps to render the route on an interactive map.

### Environment variables

Create a `.env.local` (ignored by git) with:

```sh
# Supabase (Auth)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# Client (will be visible in the browser; restrict by HTTP referrer + limit APIs to "Maps JavaScript API")
VITE_GOOGLE_MAPS_BROWSER_KEY=...

# Server-only (keep secret; used by /api/google/* proxies for Directions/Geocoding/Places)
GOOGLE_MAPS_SERVER_KEY=...

# Google OAuth (Calendar/Drive)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/google/oauth/callback
GOOGLE_OAUTH_STATE_SECRET=... # random secret for signing state

# Electricity Maps (real-time grid CO₂ intensity for Austria "AT")
ELECTRICITY_MAPS_API_KEY=...
ELECTRICITY_MAPS_DEFAULT_ZONE=AT

# Climatiq (gasoline/diesel emissions factor, kg CO₂e/L)
CLIMATIQ_API_KEY=...
# Used by `/api/climatiq/fuel-factor` (Data API `/data/v1/search` + `/data/v1/estimate`).

# Supabase server (for /api/google/* Calendar/Drive)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Local dev: Calendar/Drive OAuth

In production, `/api/google/*` is served by Vercel functions (folder `api/`). In local dev, `npm run dev` only starts Vite, so the OAuth/Calendar/Drive endpoints are not available unless you run them too.

This repo supports a dev proxy for those endpoints:

1. Start the Vercel functions locally (separate terminal):

```sh
npx vercel dev --listen 3000
```

2. Add this to your `.env.local`:

```sh
VERCEL_DEV_API_ORIGIN=http://localhost:3000
```

3. Start Vite:

```sh
npm run dev
```

Now `http://localhost:8080/api/google/oauth/*` and `http://localhost:8080/api/google/calendar/*` will be proxied to the local Vercel dev server.

### Security note

For interactive maps, the **Maps JavaScript API key must be sent to the browser**. The recommended approach is:

- Use a **browser-restricted key** for `VITE_GOOGLE_MAPS_BROWSER_KEY` (HTTP referrer restrictions + only "Maps JavaScript API").
- Use a **server key** for `GOOGLE_MAPS_SERVER_KEY` and call Directions/Geocoding/Places via the serverless proxies (`/api/google/*`).

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
