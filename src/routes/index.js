import express from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import productRoutes from "../modules/product/product.routes.js";
import tagRoutes from "../modules/tag/tag.routes.js";
import scanRoutes from "../modules/scan/scan.routes.js";
import quoteRoutes from "../modules/quote/quote.routes.js";
import orderRoutes from "../modules/order/order.routes.js";
import pendingQuoteRoutes from "../modules/pendingQuote/pendingQuote.routes.js";
import favoriteRoutes from "../modules/favorite/favorite.routes.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/products", productRoutes);
router.use("/tags", tagRoutes);
router.use("/scan", scanRoutes);
router.use("/quotes", quoteRoutes);
router.use("/orders", orderRoutes);
router.use("/pending-quotes", pendingQuoteRoutes);
router.use("/favorites", favoriteRoutes);

export default router;