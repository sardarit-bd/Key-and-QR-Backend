import express from "express";
import favoriteController from "./favorite.controller.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(auth());

// Get user favorites with pagination & filtering
router.get("/", favoriteController.getUserFavorites);

// Add to favorites
router.post("/", favoriteController.addFavorite);

// Get favorite by ID
router.get("/:id", favoriteController.getFavoriteById);

// Remove from favorites
router.delete("/:id", favoriteController.removeFavorite);

// Check if item is in favorites
router.get("/check", favoriteController.checkFavorite);

// Remove favorite by reference (product or quote)
router.delete("/remove-by-reference", favoriteController.removeFavoriteByReference);

// Batch add favorites
router.post("/batch", favoriteController.batchAddFavorites);

// Check multiple favorites at once
router.post("/check-batch", favoriteController.checkMultipleFavorites);

// Get favorite statistics
router.get("/stats", favoriteController.getFavoriteStats);

export default router;