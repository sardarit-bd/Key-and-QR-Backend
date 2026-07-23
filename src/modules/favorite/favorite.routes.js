import express from "express";
import favoriteController from "./favorite.controller.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(auth());

// ================================
// 🟢 SPECIFIC ROUTES FIRST (No path parameters)
// ================================

// 1. Get user favorites with pagination & filtering
router.get("/", favoriteController.getUserFavorites);

// 2. Add to favorites
router.post("/", favoriteController.addFavorite);

// 3. Check if item is in favorites
router.get("/check", favoriteController.checkFavorite);

// 4. Remove favorite by reference (product or quote)
router.delete("/remove-by-reference", favoriteController.removeFavoriteByReference);

// 5. Batch add favorites
router.post("/batch", favoriteController.batchAddFavorites);

// 6. Check multiple favorites at once
router.post("/check-batch", favoriteController.checkMultipleFavorites);

// 7. Get favorite statistics
router.get("/stats", favoriteController.getFavoriteStats);

// ================================
// 🔴 DYNAMIC ROUTES LAST (With path parameters)
// ================================

// 8. Get favorite by ID
router.get("/:id", favoriteController.getFavoriteById);

// 9. Remove from favorites
router.delete("/:id", favoriteController.removeFavorite);

export default router;