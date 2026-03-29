import express from "express";
import favoriteController from "./favorite.controller.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(auth());

// Get user favorites
router.get("/", favoriteController.getUserFavorites);

// Add to favorites
router.post("/", favoriteController.addFavorite);

// Check if product/quote is favorite
router.get("/check", favoriteController.checkFavorite);

// Remove from favorites
router.delete("/:id", favoriteController.removeFavorite);

export default router;