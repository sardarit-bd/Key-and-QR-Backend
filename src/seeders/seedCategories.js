import Category from "../modules/category/category.model.js";
import logger from "../utils/logger.js";

const initialCategories = [
  {
    name: "Inspire",
    slug: "inspire",
    description: "Daily inspiration to spark your day",
    icon: "Sparkles",
    color: "#f59e0b",
    sortOrder: 0,
    isActive: true,
    isPremium: false,
  },
  {
    name: "Love",
    slug: "love",
    description: "Quotes about love, connection and the heart",
    icon: "Heart",
    color: "#ef4444",
    sortOrder: 1,
    isActive: true,
    isPremium: false,
  },
  {
    name: "Faith",
    slug: "faith",
    description: "Quotes to strengthen faith and trust",
    icon: "Church",
    color: "#8b5cf6",
    sortOrder: 2,
    isActive: true,
    isPremium: false,
  },
  {
    name: "Courage",
    slug: "courage",
    description: "Quotes to face fear and take bold action",
    icon: "Shield",
    color: "#f97316",
    sortOrder: 3,
    isActive: true,
    isPremium: false,
  },
  {
    name: "Wisdom",
    slug: "wisdom",
    description: "Timeless wisdom for thoughtful living",
    icon: "BookOpen",
    color: "#10b981",
    sortOrder: 4,
    isActive: true,
    isPremium: false,
  },
  {
    name: "Gratitude",
    slug: "gratitude",
    description: "Quotes on thankfulness and appreciation",
    icon: "HandHeart",
    color: "#eab308",
    sortOrder: 5,
    isActive: true,
    isPremium: false,
  },
  {
    name: "Healing",
    slug: "healing",
    description: "Comforting words for recovery and renewal",
    icon: "Bandage",
    color: "#06b6d4",
    sortOrder: 6,
    isActive: true,
    isPremium: false,
  },
  {
    name: "Strength",
    slug: "strength",
    description: "Quotes on resilience, grit and inner power",
    icon: "Dumbbell",
    color: "#3b82f6",
    sortOrder: 7,
    isActive: true,
    isPremium: false,
  },
];

const seedCategories = async () => {
  try {
    let created = 0;
    let skipped = 0;

    for (const category of initialCategories) {
      const existing = await Category.findOne({ slug: category.slug });

      if (existing) {
        skipped++;
        continue;
      }

      await Category.create(category);
      created++;
    }

    logger.info(
      `Category seeder completed: ${created} created, ${skipped} already existed`
    );
  } catch (error) {
    logger.error(`Category seeder error: ${error.message}`);
  }
};

export default seedCategories;
