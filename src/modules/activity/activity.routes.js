import express from "express";
import favoriteController from "./favorite.controller.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(auth());

// ================================
// SPECIFIC ROUTES FIRST (No parameters)
// ================================

// Get user favorites with pagination & filtering
router.get("/", favoriteController.getUserFavorites);

// Add to favorites
router.post("/", favoriteController.addFavorite);

// Check if item is in favorites
router.get("/check", favoriteController.checkFavorite);  // ✅ Specific route

// Remove favorite by reference (product or quote)
router.delete("/remove-by-reference", favoriteController.removeFavoriteByReference);  // ✅ Specific route

// Batch add favorites
router.post("/batch", favoriteController.batchAddFavorites);  // ✅ Specific route

// Check multiple favorites at once
router.post("/check-batch", favoriteController.checkMultipleFavorites);  // ✅ Specific route

// Get favorite statistics
router.get("/stats", favoriteController.getFavoriteStats);  // ✅ Specific route

// ================================
// DYNAMIC ROUTES LAST (With parameters)
// ================================

// Get favorite by ID
router.get("/:id", favoriteController.getFavoriteById);  // ✅ Now this is LAST

// Remove from favorites
router.delete("/:id", favoriteController.removeFavorite);  // ✅ Now this is LAST

export default router;