import ProductCategory from "../modules/productCategory/productCategory.model.js";
import Product from "../models/product.model.js";
import Category from "../modules/category/category.model.js";
import logger from "../utils/logger.js";

const initialProductCategories = [
  {
    name: "NFC Tags",
    slug: "nfc-tags",
    description: "Physical adhesive and mountable NFC tags for daily inspiration",
    sortOrder: 0,
    isActive: true,
  },
  {
    name: "NFC Keychains",
    slug: "nfc-keychains",
    description: "Portable luxury keychains with integrated smart NFC and QR chips",
    sortOrder: 1,
    isActive: true,
  },
  {
    name: "Smart Cards",
    slug: "smart-cards",
    description: "Credit card sized NFC & QR tags for wallets and desk stands",
    sortOrder: 2,
    isActive: true,
  },
  {
    name: "Wristbands",
    slug: "wristbands",
    description: "Wearable silicone and leather NFC wristbands",
    sortOrder: 3,
    isActive: true,
  },
  {
    name: "Accessories",
    slug: "accessories",
    description: "Holders, displays, and mounting hardware for MyInspireTag devices",
    sortOrder: 4,
    isActive: true,
  },
];

const seedProductCategories = async () => {
  try {
    let created = 0;
    let skipped = 0;

    for (const cat of initialProductCategories) {
      const existing = await ProductCategory.findOne({ slug: cat.slug });

      if (existing) {
        skipped++;
        continue;
      }

      await ProductCategory.create(cat);
      created++;
    }

    logger.info(
      `ProductCategory seeder completed: ${created} created, ${skipped} already existed`
    );

    // Migration helper: check if any products reference the legacy Category collection
    const defaultCategory = await ProductCategory.findOne({ slug: "nfc-tags" }) || await ProductCategory.findOne();
    if (defaultCategory) {
      const productsWithLegacyCategory = await Product.find({
        categoryId: { $exists: true, $ne: null },
      });

      let migrated = 0;
      for (const prod of productsWithLegacyCategory) {
        const isProductCategory = await ProductCategory.findById(prod.categoryId);
        if (!isProductCategory) {
          // Check if it matches a legacy Category by ID
          const legacyCat = await Category.findById(prod.categoryId);
          let targetProductCat = null;
          if (legacyCat) {
            targetProductCat = await ProductCategory.findOne({ slug: legacyCat.slug });
            if (!targetProductCat) {
              targetProductCat = await ProductCategory.create({
                name: legacyCat.name,
                slug: legacyCat.slug,
                description: legacyCat.description || null,
                isActive: legacyCat.isActive !== false,
              });
            }
          }
          prod.categoryId = targetProductCat ? targetProductCat._id : defaultCategory._id;
          await prod.save();
          migrated++;
        }
      }

      if (migrated > 0) {
        logger.info(`Migrated ${migrated} products to ProductCategory collection.`);
      }
    }
  } catch (error) {
    logger.error(`ProductCategory seeder error: ${error.message}`);
  }
};

export default seedProductCategories;
