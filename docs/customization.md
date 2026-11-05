# Client customization

Edit `src/config/site.ts` and rebuild. The constants at the top control the merchant name, email, phone, address and return window; policy templates reference them. `site.theme` drives CSS variables in the root layout. `site.copy`, navigation, categories, contacts, social links, currency/locale settings and feature switches control public presentation. Product content and prices live in MongoDB, not this file.

For a new merchant, change `site.id` as well: it namespaces browser storage, cookies and media object paths. Use a separate deployment and database with unique secrets and provider accounts. This is a reusable single-merchant application, not a shared-database SaaS tenancy system. Changing the ID on an existing store intentionally invalidates its browser storage/session namespace; plan that migration.

Leron's current address is the supplied business contact, not a validated dispatch/returns warehouse. `supportHours`, registration details and social links are blank until supplied. Do not invent them. Shipping/returns/privacy/terms are editable drafts and `site.policy.approved` stays false until merchant approval. The proposed return window is 14 days and handling time 1–2 business days; neither is a legal determination or an operational commitment before approval.

## Catalog and money

Populate actual products, SKU variants, images, specifications, tax codes, stock locations and market prices through admin. Prices stored in MongoDB and JSON APIs are integer minor units; the product editor accepts ordinary decimal currency amounts. Existing stock is changed through inventory adjustments/transfers, not listing edits. A variant is a separately stock-controlled SKU linked by `parentSku` and options.

`site.currencies` is configurable, but adding a display currency does not create prices, provider support, tax registration or shipping support. Fixed merchant prices are the default. Optional OpenExchangeRates conversion requires `site.fx.enabled`, `FX_API_KEY`, a valid base currency and current rates; the worker materializes sortable market prices. Server checkout uses current validated prices and rejects stale/missing conversion data. Test every selected currency, including zero/three-decimal currencies if offered. M-Pesa remains Kenya/KES only.

`site.launchCountries` controls destination selection. Add approved country/currency pairs to `SHIPPING_RATES_JSON` in deployment settings. Customer shipping is currently an approved fixed rate per order; Shippo integration supplies staff quotes, labels and tracking. Duties, DDP, customs declarations and returns logistics require merchant/carrier arrangements.

## Theme and content checks

Change theme values in one place. Keep text/background contrast accessible, then run the browser/accessibility checks. CSS semantic shades derive from the theme using variables and color mixing. A new font requires licensing and appropriate loading/CSP decisions; the defaults use system fonts. Replace draft illustrations with approved licensed media. Uploaded raster images are sanitized and served through the media route.

Feature switches hide optional entry points and selected server workflows; they do not remove historical records or change legal retention obligations. Accounts and transactional email need deployment settings. Configure credentials in the secret manager, never in this public configuration, screenshots, support tickets or source control.
