# ORJN Concierge — Setup Guide

A complete setup guide for a non-technical store owner.

---

## What This Is

A custom AI chatbot for your Shopify store that:
- Recommends products based on what customers ask for
- Shows live prices, sizes, and stock
- Compares products side by side
- Adds items to cart directly from the chat
- Sends customers to checkout
- Answers policy questions (shipping, returns, authenticity, etc.)

---

## What You Need

1. **Shopify store** with Storefront API access
2. **Anthropic API key** (for the AI) — get one at https://console.anthropic.com
3. **PostgreSQL database** — any managed PostgreSQL (Supabase, Railway, Neon, or similar)
4. **A server to host the backend** — Railway, Render, Fly.io, or any Node.js host

---

## Step-by-Step Setup

### 1. Get Your Shopify Storefront API Token

1. In Shopify Admin, go to **Settings → Apps and sales channels → Develop apps**
2. Create a new app (name it "ORJN Concierge")
3. Under **Configuration → Storefront API scopes**, enable:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_write_checkouts`
   - `unauthenticated_read_checkouts`
4. Install the app and copy the **Storefront API access token**

### 2. Get Your Anthropic API Key

1. Go to https://console.anthropic.com
2. Create an account or sign in
3. Go to API Keys and create a new key
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
   SHOPIFY_STOREFRONT_ACCESS_TOKEN=your-token-here
   ANTHROPIC_API_KEY=sk-ant-...
   DATABASE_URL=postgresql://...
   PORT=3001
   NODE_ENV=production
   CORS_ORIGIN=https://your-store.myshopify.com
   ```
3. Install dependencies: `npm install`
4. Set up the database: `npm run db:push`
5. Build: `npm run build`
6. Start: `npm start`

If using **Railway**:
- Connect your GitHub repo
- Add the environment variables above
- Railway auto-detects Node.js and deploys

If using **Render**:
- Create a new Web Service
- Connect repo, set build command to `npm install && npm run build`
- Set start command to `npm start`
- Add environment variables

### 5. Build and Host the Widget

After deploying the backend:
1. Run `npm run build:widget`
2. The compiled widget is at `dist/widget/orjn-concierge.js`
3. Host this file on your server or a CDN
4. Note the URL (e.g. `https://your-server.com/orjn-concierge.js`)

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
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Yes | Storefront API token |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | No | Redis URL for caching |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | No | Allowed origins (default: `*`) |
| `VITE_API_URL` | No | API URL for local dev widget |

---

## Local Development

```bash
# Install dependencies
npm install

# Set up database
npm run db:push

# Start dev server (backend + widget hot reload)
npm run dev
```

Backend runs on `http://localhost:3001`, widget on `http://localhost:5173`.

---

## Troubleshooting

- **Widget doesn't appear**: Check that the app embed is enabled in theme customizer
- **"Network error"**: Check that `CORS_ORIGIN` includes your store domain
- **No products returned**: Verify your Storefront API token has the correct scopes
- **AI errors**: Check your Anthropic API key and billing status
- **Database errors**: Verify `DATABASE_URL` and run `npm run db:push`
