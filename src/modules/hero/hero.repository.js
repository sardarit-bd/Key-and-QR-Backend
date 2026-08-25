import Hero from "./hero.model.js";

const HERO_KEY = "homepage-hero";

/**
 * Get the singleton hero document, creating it (with defaults) on first access.
 * The DB is the source of truth; defaults only seed the very first document.
 */
const getHero = async () => {
  let hero = await Hero.findOne({ key: HERO_KEY }).populate("updatedBy", "name email");
  if (!hero) {
    hero = await Hero.create({ key: HERO_KEY });
  }
  return hero;
};

/**
 * Upsert-style update for the singleton hero record.
 * Falls back to creating the record if it doesn't exist yet.
 */
const updateHero = async (payload, userId) => {
  const existing = await Hero.findOne({ key: HERO_KEY });

  if (!existing) {
    return Hero.create({ key: HERO_KEY, ...payload, updatedBy: userId });
  }

  return Hero.findByIdAndUpdate(
    existing._id,
    { ...payload, updatedBy: userId },
    { new: true, runValidators: true }
  ).populate("updatedBy", "name email");
};

/**
 * Get the Shop Hero data from the singleton hero document.
 */
const getShopHero = async () => {
  const hero = await getHero();
  return (
    hero.shopHero || {
      imageUrl: hero.imageUrl || "",
      publicId: "",
    }
  );
};

/**
 * Update the Shop Hero data on the singleton hero document.
 */
const updateShopHero = async (payload, userId) => {
  const existing = await getHero();

  return Hero.findByIdAndUpdate(
    existing._id,
    {
      shopHero: {
        imageUrl: payload.imageUrl || "",
        publicId: payload.publicId || "",
      },
      // Keep legacy imageUrl synced for backward compatibility
      imageUrl: payload.imageUrl || "",
      updatedBy: userId,
    },
    { new: true, runValidators: true }
  ).populate("updatedBy", "name email");
};

/**
 * Get the Announcement Banner data from the singleton hero document.
 */
const getAnnouncementBanner = async () => {
  const hero = await getHero();
  const banner = hero.announcementBanner;

  if (!banner) {
    return {
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
    };
  }

  // Ensure messages array exists and has at least fallback
  let messages = banner.messages;
  if (!messages || messages.length === 0) {
    if (banner.text) {
      messages = [
        { text: banner.text, icon: "Sparkles", linkUrl: banner.linkUrl || "", enabled: true },
      ];
    } else {
      messages = [
        { text: "FREE SHIPPING ON ORDERS OVER $50", icon: "Truck", linkUrl: "/shop", enabled: true },
        { text: "GET 10% OFF YOUR FIRST ORDER", icon: "Gift", linkUrl: "/shop", enabled: true },
        { text: "24/7 CUSTOMER SUPPORT", icon: "Clock", linkUrl: "/how-it-works", enabled: true },
      ];
    }
  }

  return {
    isEnabled: banner.isEnabled !== undefined ? banner.isEnabled : true,
    backgroundColor: banner.backgroundColor || "#000000",
    textColor: banner.textColor || "#ffffff",
    isDismissible: banner.isDismissible !== undefined ? banner.isDismissible : true,
    rotationSpeed: banner.rotationSpeed || 5,
    messages,
    text: banner.text || (messages[0]?.text ?? "FREE SHIPPING ON ORDERS OVER $50"),
    linkUrl: banner.linkUrl || (messages[0]?.linkUrl ?? ""),
    updatedAt: hero.updatedAt || new Date().toISOString(),
  };
};

/**
 * Update the Announcement Banner data on the singleton hero document.
 */
const updateAnnouncementBanner = async (payload, userId) => {
  const existing = await getHero();

  let formattedMessages = [];
  if (Array.isArray(payload.messages) && payload.messages.length > 0) {
    formattedMessages = payload.messages
      .filter((m) => m && m.text && m.text.trim())
      .map((m) => ({
        text: m.text.trim(),
        icon: m.icon ? m.icon.trim() : "Sparkles",
        linkUrl: m.linkUrl ? m.linkUrl.trim() : "",
        enabled: m.enabled !== undefined ? Boolean(m.enabled) : true,
      }));
  }

  if (formattedMessages.length === 0 && payload.text && payload.text.trim()) {
    formattedMessages = [
      {
        text: payload.text.trim(),
        icon: "Sparkles",
        linkUrl: payload.linkUrl ? payload.linkUrl.trim() : "",
        enabled: true,
      },
    ];
  }

  const primaryText = formattedMessages[0]?.text || payload.text || "FREE SHIPPING ON ORDERS OVER $50";
  const primaryLink = formattedMessages[0]?.linkUrl || payload.linkUrl || "";

  return Hero.findByIdAndUpdate(
    existing._id,
    {
      announcementBanner: {
        isEnabled: payload.isEnabled !== undefined ? payload.isEnabled : true,
        backgroundColor: payload.backgroundColor || "#000000",
        textColor: payload.textColor || "#ffffff",
        isDismissible: payload.isDismissible !== undefined ? payload.isDismissible : true,
        rotationSpeed: Number(payload.rotationSpeed) || 5,
        messages: formattedMessages.length > 0 ? formattedMessages : [
          { text: primaryText, icon: "Truck", linkUrl: primaryLink, enabled: true },
        ],
        text: primaryText,
        linkUrl: primaryLink,
      },
      updatedBy: userId,
    },
    { new: true, runValidators: true }
  ).populate("updatedBy", "name email");
};

export default {
  getHero,
  updateHero,
  getShopHero,
  updateShopHero,
  getAnnouncementBanner,
  updateAnnouncementBanner,
};

