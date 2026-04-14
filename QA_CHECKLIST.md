# ORJN Concierge — QA Checklist

## Widget Installation
- [ ] Widget installs via Shopify theme app embed
- [ ] Widget appears on storefront after enabling in theme customizer
- [ ] Launcher button visible bottom-right on desktop
- [ ] Launcher button visible on mobile
- [ ] Chat panel opens on click
- [ ] Chat panel closes on X button
- [ ] Mobile: panel is fullscreen
- [ ] Desktop: panel is 400×600px floating

## Product Search & Discovery
- [ ] "Show me black sneakers" returns relevant products
- [ ] "Show me Adidas shoes under $150" applies brand + price filters
- [ ] Product cards display image, vendor, title, price
- [ ] Compare-at price shows strikethrough when applicable
- [ ] "No results" handled gracefully
- [ ] Product cards have "View & Add to Cart" button

## Product Details & Variants
- [ ] "Do you have this in size 44?" resolves correct variant
- [ ] Unavailable variant suggests alternatives
- [ ] "What sizes are left?" returns live availability
- [ ] Price shown is from live API, not hallucinated

## Comparison
- [ ] "Compare X with Y" shows comparison table
- [ ] Table includes: price, sizes, brand, type, material
- [ ] AI provides recommendation summary

## Cart
- [ ] "Add size 43 to cart" resolves variant and adds to cart
- [ ] "Change that to 44" updates cart line
- [ ] Cart state persists across messages
- [ ] "Take me to checkout" provides valid Shopify checkout URL

## Policies
- [ ] "What's your return policy?" answers from knowledge base
- [ ] "Are your products authentic?" answers from knowledge base
- [ ] "How does shipping work?" answers from knowledge base
- [ ] Unknown policy questions handled gracefully

## UX & States
- [ ] Empty state shows welcome message
- [ ] Typing indicator shown while AI responds
- [ ] Error state shows message + retry button
- [ ] Retry re-sends last message
- [ ] Input disabled while loading
- [ ] Enter sends, Shift+Enter is newline

## Security
- [ ] No API keys in client-side code
- [ ] Rate limiting works (30 req/min)
- [ ] Invalid JSON body returns 400
- [ ] Server error returns 500 without stack trace

## Analytics
- [ ] chat_opened event logged
- [ ] first_message_sent event logged
- [ ] product_search event logged
- [ ] add_to_cart event logged
- [ ] checkout_started event logged
- [ ] fallback_triggered event logged on error

## Performance
- [ ] Widget JS bundle < 100KB gzipped
- [ ] Chat opens in < 200ms
- [ ] Product search responds in < 3s
- [ ] No memory leaks on repeated open/close
