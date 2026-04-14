You are my senior full-stack Shopify app engineer.
ana layth
You are building a production-ready, fully custom AI shopping concierge for my Shopify store, ORJN.

Context:
- Brand: ORJN
- Market: Lebanon
- Language: English only
- Business: premium culture-first retailer for authentic sneakers and sportswear
- Positioning: trusted home of original heat
- Tone: sharp, minimal, premium, direct, culturally fluent, not cheesy, not robotic, not corporate
- Goal: build a next-level chatbot that functions as a sales concierge, not a generic support bubble


1. Recommend products based on natural language queries
2. Search products by brand, style, color, category, price, and availability
3. Check live stock and size availability
4. Show live prices and compare-at prices if relevant
5. Compare products clearly
6. Answer product questions
7. Answer store policy questions using a curated knowledge base
8. Add exact variants to cart directly from the chatbot
9. Update cart quantities from chat
10. Redirect the user to checkout
11. Escalate cleanly when confidence is low
12. Log events and analytics so we can measure performance

Hard requirements:
- Do NOT use any plug-and-play chatbot SaaS
- Do NOT build a generic support widget
- Do NOT let the model invent stock, prices, or availability
- The AI must use live Shopify tools for all product, variant, price, stock, and cart answers
- The bot must feel premium and editorial, consistent with ORJN
- Keep UI clean, black-dominant, premium, sharp, minimal
- The output must be production-grade, not prototype-grade

Build path:
- Build a custom Shopify app
- Use a theme app extension with an app embed block to inject the floating chatbot widget into the storefront
- Build the chat frontend as a custom React widget
- Build the backend in Node.js + TypeScript
- Use Shopify Storefront API for product, variant, pricing, availability, cart, and checkout actions
- Use a server-side orchestration layer for all AI calls and tool routing
- Use a database for session memory, analytics, and event logging
- Use Redis or equivalent caching if helpful
- Use environment variables properly and keep secrets server-side only

Do not ask me broad conceptual questions. Make reasonable engineering decisions and move forward.
If something is missing, create a sensible default and clearly document it.

Project deliverables:
1. A complete Shopify app codebase
2. Theme app extension / app embed for the floating widget
3. Frontend chat UI
4. Backend API
5. AI orchestration layer with tool calling
6. Shopify tool adapters
7. Database schema and migrations
8. Seed scripts / example config
9. Admin/config docs
10. Local dev setup
11. Deployment instructions
12. QA checklist
13. Acceptance tests
14. A final setup guide written for a non-technical store owner

Core user flows to support:
- “Show me black sneakers under $150”
- “I want something like Samba but more versatile”
- “Show me daily wear options from Adidas”
- “Do you have this in size 44?”
- “Compare this pair with that pair”
- “Which one is better for daily wear?”
- “What sizes are left?”
- “Is this on sale?”
- “Add size 43 to cart”
- “Change that to 44”
- “Take me to checkout”
- “What is your exchange policy?”
- “Are your products authentic?”

System behavior rules:
- Never answer stock, price, or size questions without live API retrieval
- When the user references a product vaguely, search first and present top matches
- When a specific size/color is requested, resolve the exact variant before answering
- If the requested variant is unavailable, suggest the nearest alternatives automatically
- If comparing products, structure the comparison clearly:
  - price
  - available sizes
  - brand
  - product type
  - material/metafields if available
  - intended use
  - fit notes
  - recommendation summary
- If confidence is low, ask one short disambiguation question only
- If the answer is not product-related and is policy-related, use the knowledge base
- If the answer is unknown, say so clearly and offer the next best action

Architecture requirements:
A. Frontend
- Floating launcher button bottom-right by default
- Expandable chat panel
- Fast open/close
- Responsive on mobile and desktop
- Product cards inside chat
- Compare cards inside chat
- Add-to-cart buttons inside chat
- Quantity update controls when relevant
- “Go to checkout” CTA
- Smooth loading states
- Typing state
- Error state
- Empty state
- Reconnect/retry state

B. Backend
Create a clean service-oriented backend with:
- chat session service
- AI orchestration service
- Shopify storefront service
- product search service
- product comparison service
- knowledge base service
- analytics/event service
- cart service

C. Suggested stack
- Node.js
- TypeScript
- React
- Vite or Next.js if appropriate for the widget/dev workflow
- PostgreSQL
- Prisma or equivalent ORM
- Redis optional
- Zod for validation
- Vitest or Jest for testing

AI orchestration:
Implement a tool-driven architecture.
The model must not be the source of truth for commerce data.

Create these tools at minimum:
1. search_products(query, filters)
2. get_product(handle_or_id)
3. get_variant_by_options(product_handle_or_id, selected_options)
4. get_variant_availability(variant_id)
5. compare_products(product_ids_or_handles)
6. cart_create()
7. cart_add_lines(cart_id, variant_id, quantity)
8. cart_update_lines(cart_id, line_id, quantity)
9. get_cart(cart_id)
10. get_checkout_url(cart_id)
11. answer_policy_question(question)
12. log_event(name, payload)

Tool behavior:
- search_products should support brand, price, category, color, product type, and in-stock preference where possible
- get_product should return title, vendor, product type, images, options, price range, and selected/default variant details
- get_variant_by_options must resolve exact size/color/etc selections
- compare_products must return structured comparable data and a concise recommendation
- answer_policy_question must only use the local policy knowledge source, not model memory

Shopify data requirements:
Use product and variant data from Shopify live.
Support:
- title
- handle
- vendor / brand
- product type
- images
- options
- variants
- availableForSale
- quantityAvailable if accessible
- price
- compareAtPrice
- selected/default variant resolution

Metafields:
Design the system so it can read ORJN-specific product metafields when available.
Prepare support for:
- fit profile
- true-to-size note
- authenticity note
- style tags
- material summary
- recommended use
- compare highlights

Knowledge base:
Create a local structured knowledge layer for:
- shipping
- returns / exchanges
- authenticity
- sizing notes
- care instructions
- customer support escalation
The codebase should make it easy for me to edit these later without touching core logic.

UI and brand direction:
- black-dominant
- premium
- sharp
- editorial
- restrained
- no rounded playful nonsense
- no colorful SaaS look
- no generic bot avatar look
- tight spacing
- strong typography hierarchy
- product cards must look like ORJN, not like an app marketplace demo

Conversation UX:
- Keep answers concise and commercially useful
- Avoid fluff
- Ask precise follow-ups only when needed
- Suggest alternatives automatically when useful
- Present products cleanly with image, name, price, and CTA
- For comparisons, use a compact structured table/card layout
- Never dump raw JSON into the UI

Cart behavior:
- Create or retrieve a session cart
- Add exact variant directly from chat
- Reflect cart state in the UI
- Allow quantity updates
- Allow removal if simple to implement
- Offer checkout redirect using the Shopify checkout URL

Analytics:
Track at minimum:
- chat opened
- first message sent
- product search performed
- product clicked
- comparison requested
- add to cart from chat
- checkout started from chat
- fallback triggered
- no result returned
- policy question asked
- size availability requested

Persistence:
Store:
- session id
- cart id
- conversation history summary
- recent viewed products
- recent comparisons
- user preferences when inferred, such as favorite brand or size, if easy to support

Security:
- secrets server-side only
- validate all API inputs
- rate limit chat endpoint
- sanitize any knowledge base/admin-edited content
- do not expose admin credentials client-side
- fail safely on Shopify API errors

Important implementation rule:
Use live Shopify queries for all product and cart actions.
Do not hardcode catalog logic.

Acceptance criteria:
The shipped build is only acceptable if all these are true:
1. Widget installs cleanly into Shopify via app embed
2. Widget can be turned on in theme and appears correctly
3. User can ask for product recommendations and get relevant results
4. User can ask for availability and receive live variant-specific answers
5. User can compare products
6. User can add the exact selected variant to cart from chat
7. User can go to checkout from chat
8. Policy answers come from a controlled knowledge base
9. UI matches a premium ORJN-style experience
10. No hallucinated stock/price/variant answers

Build process:
Phase 1:
- scaffold app
- create theme app extension
- create frontend widget shell
- create backend API
- connect Shopify Storefront API
- implement product search, product details, variant resolution, availability, cart create/add/get, checkout

Phase 2:
- implement comparison flow
- implement knowledge base
- implement analytics and persistence
- refine conversation routing
- refine UI polish

Phase 3:
- tests
- edge cases
- performance improvements
- docs
- deployment and setup guide

Output format I want from you:
1. First, inspect the current repo if one exists
2. If there is no repo, scaffold the full project
3. Then present a short implementation plan
4. Then start building immediately
5. As you build, create files, run commands, and explain only key decisions
6. At the end, provide:
   - final file tree
   - env variables needed
   - how to run locally
   - how to deploy
   - how to install/activate on Shopify
   - how to edit policies later
   - what still needs my store-specific credentials

Code quality:
- typed end to end
- modular
- readable
- production-minded
- minimal tech debt
- no fake implementations unless clearly marked
- no TODO graveyard
- no mock answers in production paths

Now begin.
If no repository exists yet, scaffold the entire codebase from scratch and proceed.
