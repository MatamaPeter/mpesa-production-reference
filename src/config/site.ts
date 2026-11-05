const BRAND_NAME = "Leron Urban Electronics";
const CONTACT_EMAIL = "leron@gmail.com";
const CONTACT_PHONE = "+254712458796";
const BUSINESS_ADDRESS = "365-00216, Githunguri, Kenya";
const RETURN_WINDOW_DAYS = 14;
/** Public client configuration. No passwords, keys or other secrets belong here.
 * Each property is a single customization point. Rebuild after changing this file.
 * Deploy a separate database, secret set and domain for each merchant.
 */
export const site = {
  id: "leron",
  brand: {
    name: BRAND_NAME,
    wordmark: BRAND_NAME.split(" ")[0].toUpperCase(),
    descriptor: BRAND_NAME.split(" ").slice(1).join(" ").toUpperCase(),
    mark: "",
    tagline: "Tech for life in motion",
    description:
      "Electronics for life in motion. Explore audio, wearables, cameras and workspace essentials.",
    footer: "Good tech. Great possibilities. Made for your everyday.",
  },
  contact: {
    email: CONTACT_EMAIL,
    phone: CONTACT_PHONE,
    address: BUSINESS_ADDRESS,
    legalName: BRAND_NAME,
    registrationNumber: "",
    supportHours: "",
    whatsapp: "",
  },
  social: { instagram: "", facebook: "", youtube: "", tiktok: "" },
  locale: {
    language: "en",
    formatting: "en",
    timeZone: "Africa/Nairobi",
    defaultCurrency: "KES" as string,
  },
  theme: {
    ink: "#172b23",
    muted: "#53604f",
    background: "#fafbf7",
    border: "#dfe4da",
    accent: "#def391",
    primary: "#142821",
    onPrimary: "#f4f6ec",
    error: "#a13421",
    radius: "4px",
    fontBody: "Arial, Helvetica, sans-serif",
    fontDisplay: "Georgia, 'Times New Roman', serif",
  },
  navigation: [
    { label: "Shop all", href: "/#collection" },
    { label: "Audio", href: "/?category=Audio#collection" },
    { label: "Wearables", href: "/?category=Wearables#collection" },
    { label: "Our story", href: "/about" },
  ],
  launchCountries: ["KE"] as readonly string[],
  currencies: ["KES", "USD"] as readonly string[],
  fx: { enabled: false, baseCurrency: "USD", maxAgeSeconds: 21600 },
  categories: ["Audio", "Wearables", "Cameras", "Computing", "Accessories"],
  copy: {
    announcement: "Thoughtfully selected technology",
    previewAnnouncement:
      "THE NEXT CHAPTER IN EVERYDAY TECH — EXPLORE OUR DRAFT COLLECTION",
    announcementAside: "DESIGNED FOR LIFE IN MOTION ↗",
    heroEyebrow: "YOUR EVERYDAY, UPGRADED",
    heroTitle: "Less ordinary.",
    heroSecondLine: "More",
    heroAccent: "possibility.",
    heroDescription:
      "Turn up the sound. Find your focus. Meet the tech that moves with you.",
    heroFooter: "CURATED TECH. URBAN SPIRIT.",
    heroVertical: "LISTEN DIFFERENTLY",
    collectionEyebrow: "THE GOOD STUFF",
    collectionTitle: "Meet your next",
    collectionAccent: "essential.",
    collectionDescription:
      "Considered design. Everyday possibility. A new way to make it yours.",
    values: [
      "Thoughtfully selected",
      "Made for your everyday",
      "A world of possibility",
    ],
    editorialEyebrow: "SMALL DETAILS. BIG DIFFERENCE.",
    editorialTitle: "Technology should fit your life.",
    editorialAccent: "Beautifully.",
    editorialDescription:
      "From the first track of your morning to the last idea of the day. We’re building a collection that brings a little more possibility to every moment.",
    editorialPoster: "TAKE YOUR GOOD VIBES",
    editorialPosterAccent: "EVERYWHERE.",
    closingTitle: "Stay connected. Stay a little",
    closingAccent: "curious.",
    footerEyebrow: "STAY CURIOUS.",
    footerTitle: "A better everyday starts with a little tech.",
    aboutTitle: "Tech for life",
    aboutAccent: "in motion.",
    aboutIntro:
      "We believe technology should make everyday life more interesting, more connected and a little more your own.",
    aboutBody:
      "Our collection brings together audio, wearables, cameras and workspace essentials with market-specific prices and payment options.",
  },
  features: {
    accounts: true,
    wishlist: true,
    comparison: true,
    reviews: true,
    coupons: true,
    returns: true,
  },
  policy: {
    approved: false,
    returnWindowDays: RETURN_WINDOW_DAYS,
    shipping:
      "We deliver within Kenya to locations supported at checkout. Delivery charges and available delivery estimates are shown before payment. Our proposed processing time is 1–2 business days after payment verification, excluding public holidays; confirmed estimates will be communicated for each order. Dispatch and delivery depend on stock, the destination and courier availability. Tracking details will be provided where available. Check your delivery address and contact number before paying. If an item arrives damaged, photograph the packaging and contact us promptly. Do not accept a visibly opened parcel without recording the issue with the courier. Delays caused by incorrect contact details or events outside our control will be communicated where possible. Contact our support team for delivery questions. These are draft operating terms and require merchant review before launch.",
    returns: `Contact us within ${RETURN_WINDOW_DAYS} days of delivery to request a return review and obtain return instructions. Do not send goods back without an approved return reference. For change-of-mind requests, goods should be unused, complete, and in their original packaging with proof of purchase; eligibility and any return shipping cost will be confirmed before approval. Faulty, damaged, incorrect or misdescribed items will be assessed separately, without limiting rights provided by applicable Kenyan law. Back up and remove personal data, accounts and device locks before returning electronics. Refunds are processed to the original payment method after inspection and approval; your bank or payment provider determines when funds become available. Exchanges depend on replacement stock. Manufacturer warranty coverage, duration and exclusions must be stated on each approved product listing; no general warranty period is implied. These are draft operating terms and require merchant review before launch.`,
    privacy: `${BRAND_NAME} uses contact, delivery and order information to process purchases, provide customer support, prevent fraud and meet legal obligations. Essential cookies support the shopping bag, guest checkout and account sessions. Saved products can be stored in your browser; verified accounts can keep a server-side wishlist and address book. Card details are entered on Stripe-hosted checkout; this application does not store full card details. M-Pesa payments are processed through Safaricom. Delivery and transactional email providers receive only the information needed for their services. Access to order and support data is restricted to authorized staff roles. You may request access, correction or deletion by contacting ${CONTACT_EMAIL}; records required for legal, fraud-prevention or accounting purposes may need to be retained. The merchant must confirm retention periods, processor agreements, international data transfers and the applicable legal basis before launch. These draft terms do not replace a merchant-specific privacy assessment.`,
    terms: `The seller is ${BRAND_NAME}, contactable at ${CONTACT_EMAIL} or ${CONTACT_PHONE}, with the business contact address ${BUSINESS_ADDRESS}. Approved product listings describe the goods, prices, currency, availability and applicable warranty information. The server confirms prices and stock during checkout; placing an order does not itself confirm payment. An order is paid only after the payment provider evidence has been verified. Delivery charges and applicable taxes are disclosed before payment. Orders affected by stock, pricing or payment discrepancies may require review; no duplicate payment should be attempted while an outcome is uncertain. Cancellation, delivery, returns and refunds are handled under the store policies and applicable Kenyan consumer law. Nothing in these terms excludes mandatory consumer rights. Product descriptions, operating timelines, business registration details and these terms require merchant review before live trading.`,
  },
} as const;
export const storageKey = (suffix: string) => `${site.id}:${suffix}`;
export const sessionCookies = {
  customer: `${site.id}_customer`,
  admin: `${site.id}_admin`,
};
export const themeVariables = {
  "--ink": site.theme.ink,
  "--muted": site.theme.muted,
  "--paper": site.theme.background,
  "--line": site.theme.border,
  "--acid": site.theme.accent,
  "--deep": site.theme.primary,
  "--on-primary": site.theme.onPrimary,
  "--error": site.theme.error,
  "--radius": site.theme.radius,
  "--font-body": site.theme.fontBody,
  "--font-display": site.theme.fontDisplay,
};
