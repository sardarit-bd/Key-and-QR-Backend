import mongoose from "mongoose";

const heroCtaSchema = new mongoose.Schema(
  {
    label: { type: String, default: "", trim: true },
    href: { type: String, default: "/shop", trim: true },
  },
  { _id: false }
);

const heroImageSchema = new mongoose.Schema(
  {
    url: { type: String, default: "", trim: true },
    publicId: { type: String, default: "", trim: true },
    alt: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const heroFeatureSchema = new mongoose.Schema(
  {
    icon: { type: String, default: "Sparkles", trim: true },
    title: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const heroSectionSchema = new mongoose.Schema(
  {
    // Singleton key — ensures only ONE hero config exists.
    key: { type: String, default: "homepage-hero", unique: true, index: true },

    eyebrow: { type: String, default: "ONE SCAN. A BETTER YOU.", trim: true },
    title: { type: String, default: "Carry inspiration. Share what matters.", trim: true },
    description: {
      type: String,
      default:
        "A meaningful shell charm with a surprise inside. Scan to discover daily inspiration, heartfelt messages, and moments that stay with you.",
      trim: true,
    },

    primaryCta: { type: heroCtaSchema, default: () => ({ label: "Shop Collection", href: "/shop" }) },
    secondaryCta: { type: heroCtaSchema, default: () => ({ label: "How It Works", href: "/how-it-works" }) },

    heroImage: {
      type: heroImageSchema,
      default: () => ({ url: "/hero/hero-bg.png", publicId: "", alt: "" }),
    },

    features: {
      type: [heroFeatureSchema],
      default: () => [
        { icon: "Gift", title: "Gift a Personal Message", description: "", enabled: true, order: 1 },
        { icon: "Sun", title: "Discover Daily Inspiration", description: "", enabled: true, order: 2 },
        { icon: "Heart", title: "Keep What Matters", description: "", enabled: true, order: 3 },
      ],
    },

    shopHero: {
      type: new mongoose.Schema(
        {
          imageUrl: { type: String, default: "", trim: true },
          publicId: { type: String, default: "", trim: true },
        },
        { _id: false }
      ),
      default: () => ({ imageUrl: "", publicId: "" }),
    },

    announcementBanner: {
      type: new mongoose.Schema(
        {
          isEnabled: { type: Boolean, default: true },
          backgroundColor: { type: String, default: "#000000", trim: true },
          textColor: { type: String, default: "#ffffff", trim: true },
          isDismissible: { type: Boolean, default: true },
          rotationSpeed: { type: Number, default: 5, min: 2, max: 30 },
          messages: {
            type: [
              new mongoose.Schema(
                {
                  text: { type: String, required: true, trim: true },
                  icon: { type: String, default: "Sparkles", trim: true },
                  linkUrl: { type: String, default: "", trim: true },
                  enabled: { type: Boolean, default: true },
                },
                { _id: true }
              ),
            ],
            default: () => [
              { text: "FREE SHIPPING ON ORDERS OVER $50", icon: "Truck", linkUrl: "/shop", enabled: true },
              { text: "GET 10% OFF YOUR FIRST ORDER", icon: "Gift", linkUrl: "/shop", enabled: true },
              { text: "24/7 CUSTOMER SUPPORT", icon: "Clock", linkUrl: "/how-it-works", enabled: true },
            ],
          },
          // Legacy fields for backward compatibility
          text: { type: String, default: "FREE SHIPPING ON ORDERS OVER $50", trim: true },
          linkUrl: { type: String, default: "", trim: true },
        },
        { _id: false }
      ),
      default: () => ({
        isEnabled: true,
        backgroundColor: "#000000",
        textColor: "#ffffff",
        isDismissible: true,
        rotationSpeed: 5,
        messages: [
          { text: "FREE SHIPPING ON ORDERS OVER $50", icon: "Truck", linkUrl: "/shop", enabled: true },
          { text: "GET 10% OFF YOUR FIRST ORDER", icon: "Gift", linkUrl: "/shop", enabled: true },
          { text: "24/7 CUSTOMER SUPPORT", icon: "Clock", linkUrl: "/how-it-works", enabled: true },
        ],
        text: "FREE SHIPPING ON ORDERS OVER $50",
        linkUrl: "",
      }),
    },

    enabled: { type: Boolean, default: true },

    // Legacy fields retained for the frozen legacy admin page
    subtitle: { type: String, default: "" },
    buttonText: { type: String, default: "" },
    secondaryButtonText: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    steps: {
      type: [
        {
          title: { type: String, default: "" },
          description: { type: String, default: "" },
          icon: { type: String, default: "Sparkles" },
          bgColor: { type: String, default: "bg-blue-100" },
          iconColor: { type: String, default: "text-blue-600" },
        },
      ],
      default: [],
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const Hero = mongoose.model("Hero", heroSectionSchema);
export default Hero;
