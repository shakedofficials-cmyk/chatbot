# ORJN Concierge — Setup Guide

A complete setup guide for a non-technical store owner.

---

## What This Is

A custom AI chatbot for your Shopify store that:
- Recommends products based on what customers ask for
- Shows live prices, sizes, and stock
- Grounds product answers in a synced searchable catalog
- Compares products side by side
- Adds items to cart directly from the chat
- Sends customers to checkout
- Answers policy questions (shipping, returns, authenticity, etc.)

---

## What You Need

1. **Shopify store** with Storefront API access
2. **OpenAI API key** (for the AI) — get one at https://platform.openai.com/api-keys
3. **PostgreSQL database** — any managed PostgreSQL (Supabase, Railway, Neon, or similar)
4. **A server to host the backend** — Railway, Render, Fly.io, or any Node.js host

---

## Step-by-Step Setup

### 1. Create a Shopify Custom App

1. In Shopify Admin, go to **Settings → Apps and sales channels → Develop apps**
2. Create a new app (name it "ORJN Concierge")
3. Under **Configuration → Admin API scopes**, enable:
   - `read_products`
   - `read_inventory`
4. Under **Configuration → Storefront API scopes**, enable:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_write_checkouts`
   - `unauthenticated_read_checkouts`
5. Set the app URL to your backend URL and add this redirect URL:
   - `https://your-backend-url.com/auth/callback`
6. Install the app

### 2. Get Your OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create an account or sign in
3. Create a new secret key
4. Copy the key — you'll need it for the `.env` file

### 3. Set Up the Database

Use any PostgreSQL provider. Copy the connection string — it looks like:
```
postgresql://user:password@host:5432/database_name
```

### 4. Deploy the Backend

1. Clone this repository
2. Copy `.env.example` to `.env` and fill in your values:
   ```
   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
   SHOPIFY_PUBLIC_STORE_URL=https://your-public-store-domain.com
   SHOPIFY_CLIENT_ID=your-shopify-app-client-id
   SHOPIFY_CLIENT_SECRET=your-shopify-app-client-secret
   SHOPIFY_APP_URL=https://your-backend-url.com
   SHOPIFY_AUTH_SCOPES=read_products,read_inventory,unauthenticated_read_product_listings,unauthenticated_read_product_inventory,unauthenticated_read_checkouts,unauthenticated_write_checkouts
   SHOPIFY_STOREFRONT_ACCESS_TOKEN=your-storefront-api-token
   SHOPIFY_WEBHOOK_SECRET=your-webhook-secret
   OPENAI_API_KEY=sk-...
   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   DATABASE_URL=postgresql://...
   PORT=3001
   NODE_ENV=production
   CORS_ORIGIN=https://your-store.myshopify.com
   SYNC_INTERVAL_MINUTES=0
   SYNC_SECRET=your-sync-secret
   RETRIEVAL_DEBUG_SECRET=your-debug-secret
   ```
3. Install dependencies: `npm install`
4. Apply database migrations: `npx prisma migrate deploy`
5. Build: `npm run build`
6. Start: `npm start`
7. Complete the Shopify install flow once:
   - open `https://your-backend-url.com/auth/start?shop=your-store.myshopify.com`
   - approve the app
   - the backend stores the Admin token, creates a managed Storefront token, and refreshes the Admin token automatically when needed

If using **Railway**:
- Connect your GitHub repo
- Add the environment variables above
- Make sure the startup command stays `npm start` so `prisma migrate deploy` runs before the server boots
- Railway auto-detects Node.js and deploys

If using **Render**:
- Create a new Web Service
- Connect repo, set build command to `npm install && npm run build`
- Set start command to `npm start`
- Add environment variables

### 5. Build the Widget

After deploying the backend:
1. Run `npm run build` (builds both server and widget)
2. The compiled widget is at `dist/widget/orjn-concierge.js`
3. The server automatically serves it at `https://your-backend-url.com/orjn-concierge.js` — no separate CDN needed
4. Use that URL as your Widget JS URL in the next step

### 6. Install on Shopify

1. Upload the `extensions/orjn-concierge/` folder to your Shopify theme
   - Or manually add the app embed code (see below)
2. In Shopify Admin: **Online Store → Themes → Customize**
3. Click **App embeds** (bottom-left)
4. Enable **ORJN Concierge**
5. Set the **API URL** to your backend URL
6. Set the **Widget JS URL** to where you hosted the widget JS
7. Save

**Manual embed alternative** — add this before `</body>` in your theme's `theme.liquid`:
```html
<div id="orjn-concierge-root"></div>
<script>
  window.__ORJN_CONFIG__ = {
    apiUrl: "https://your-backend-url.com",
    shopDomain: "your-store.myshopify.com"
  };
</script>
<script src="https://your-server.com/orjn-concierge.js" defer></script>
```

---

## Editing Policies

The chatbot answers policy questions using a local knowledge base. To edit:

1. Open `src/server/services/knowledge/policies.ts`
2. Find the policy you want to change (Shipping, Returns, Authenticity, etc.)
3. Edit the `content` field — this is what the bot tells customers
4. Add new `keywords` if needed — these help match customer questions
5. Rebuild and redeploy

You can also add entirely new policies by adding entries to the `policies` array.

---

## Adding Product Metafields

The chatbot can read custom product data from Shopify metafields. To use this:

1. In Shopify Admin, add metafields to your products under the namespace `orjn`:
   - `orjn.fit_profile` — e.g. "Runs true to size"
   - `orjn.true_to_size_note` — sizing advice
   - `orjn.authenticity_note` — authenticity info
   - `orjn.style_tags` — JSON array of style tags
   - `orjn.material_summary` — e.g. "Premium leather upper"
   - `orjn.recommended_use` — e.g. "Daily wear, casual"
   - `orjn.compare_highlights` — key selling points

These show up automatically in product cards and comparisons.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_STORE_DOMAIN` | Yes | Your `.myshopify.com` domain |
| `SHOPIFY_PUBLIC_STORE_URL` | No | Public storefront URL used for View More/search links |
| `SHOPIFY_CLIENT_ID` | Yes | Shopify app client ID |
| `SHOPIFY_CLIENT_SECRET` | Yes | Shopify app client secret |
| `SHOPIFY_APP_URL` | Yes for OAuth install flow | Public backend base URL used for OAuth redirects |
| `SHOPIFY_AUTH_SCOPES` | No | Comma-separated scopes used by `/auth/start` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Yes | Storefront API token. Do not reuse the Shopify client secret here |
| `SHOPIFY_WEBHOOK_SECRET` | Yes | Secret used to verify Shopify product webhooks |
| `SHOPIFY_STOREFRONT_TOKEN_TITLE` | No | Title used when creating a managed Storefront access token |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `OPENAI_EMBEDDING_MODEL` | No | Embedding model for semantic retrieval; defaults to `text-embedding-3-small` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | No | Allowed origins — set to your store domain in production |
| `SYNC_INTERVAL_MINUTES` | No | Optional extra catalog resync interval in minutes. `0` disables interval sync |
| `SYNC_SECRET` | Yes | Secret for `POST /api/sync` and production sync status requests |
| `RETRIEVAL_DEBUG_SECRET` | No | Secret for `POST /api/retrieval/debug`; falls back to `SYNC_SECRET` if omitted |
| `VITE_API_URL` | No | API URL for local dev widget |

---

## Hybrid Retrieval Notes

The live chatbot now answers product questions from the synced Postgres catalog, not from direct Shopify product fetches on every chat turn.

- Shopify remains the source of truth
- the app syncs products into Postgres on startup, once daily at 3AM UTC, and whenever the freshness watchdog marks the catalog stale
- optional extra interval sync can be enabled with `SYNC_INTERVAL_MINUTES`
- once the Shopify app is installed through `/auth/start`, sync prefers Storefront GraphQL with the managed Storefront token
- if no managed token exists yet, sync falls back to the public catalog until OAuth is completed
- lexical retrieval runs from normalized catalog fields in Postgres
- semantic retrieval uses embeddings stored in the catalog index
- size, type/use-case, gender, color, price, and availability answers are grounded in synced product/variant data

This means production deploys must apply Prisma migrations before serving traffic.

---

## Retrieval Debug Endpoint

For tuning search quality, the backend exposes a protected debug endpoint:

`POST /api/retrieval/debug`

Headers:
- `x-debug-secret: <RETRIEVAL_DEBUG_SECRET>`

Minimal payload:
```json
{
  "query": "do you have dunks size 44",
  "limit": 5
}
```

Response includes:
- query understanding
- extracted filters/entities
- lexical candidates
- semantic candidates
- reranked final results

Use this to inspect why a query retrieved the products it did before adjusting synonyms, ranking, or catalog metadata.

---

## Local Development

```bash
# Install dependencies
npm install

# Apply migrations
npx prisma migrate deploy

# Start dev server (backend + widget hot reload)
npm run dev
```

Backend runs on `http://localhost:3001`, widget on `http://localhost:5173`.

---

## Troubleshooting

- **Widget doesn't appear**: Check that the app embed is enabled in theme customizer
- **"Network error"**: Check that `CORS_ORIGIN` includes your store domain
- **OAuth install fails**: Verify `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_APP_URL`, and the redirect URL configured in Shopify
- **No products returned**: Verify the app was installed through `/auth/start` and the Shopify scopes include both Admin and Storefront scopes
- **Hybrid retrieval errors after deploy**: Make sure the latest Prisma migration ran successfully before the server starts
- **Unexpected ranking results**: Use `POST /api/retrieval/debug` with your debug secret to inspect lexical and semantic candidates
- **AI errors**: Check your OpenAI API key and billing status at https://platform.openai.com/usage
- **Database errors**: Verify `DATABASE_URL` and run `npx prisma migrate deploy`
