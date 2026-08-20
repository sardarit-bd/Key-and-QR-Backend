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

export default {
  getHero,
  updateHero,
  getShopHero,
  updateShopHero,
};
