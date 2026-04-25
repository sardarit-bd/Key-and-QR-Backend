import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import quoteRepository from "./quote.repository.js";
import cloudinary from "../../config/cloudinary.js";

/**
 * Upload image to cloudinary
 */
const uploadImageToCloudinary = async (file) => {
  if (!file) return null;

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "quotes" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(file.buffer);
  });

  return {
    public_id: result.public_id,
    url: result.secure_url,
  };
};

/**
 * Create Quote
 */
const createQuote = async (payload, imageFile) => {
  let image = null;

  if (imageFile) {
    image = await uploadImageToCloudinary(imageFile);
  }

  const data = {
    ...payload,
    image,
  };

  return quoteRepository.createQuote(data);
};

/**
 * Get all quotes (with filters)
 */
const getAllQuotes = async ({ page, limit, search, category, isActive, allowReuse }) => {
  return quoteRepository.getAllQuotes({
    page,
    limit,
    search,
    category,
    isActive,
    allowReuse,
  });
};

/**
 * Get single quote
 */
const getQuoteById = async (id) => {
  const quote = await quoteRepository.findById(id);

  if (!quote) {
    throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
  }

  return quote;
};

/**
 * Update Quote
 */
const updateQuote = async (id, payload, imageFile) => {
  const existingQuote = await quoteRepository.findById(id);

  if (!existingQuote) {
    throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
  }

  let image = existingQuote.image || null;

  // If new image uploaded
  if (imageFile) {
    // delete old image from cloudinary
    if (existingQuote.image?.public_id) {
      try {
        await cloudinary.uploader.destroy(existingQuote.image.public_id);
      } catch (err) {
        console.error("Failed to delete old image:", err.message);
      }
    }

    image = await uploadImageToCloudinary(imageFile);
  }

  const updatedData = {
    ...payload,
    image,
  };

  return quoteRepository.updateQuote(id, updatedData);
};

/**
 * Delete Quote
 */
const deleteQuote = async (id) => {
  const quote = await quoteRepository.findById(id);

  if (!quote) {
    throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
  }

  // delete image if exists
  if (quote.image?.public_id) {
    try {
      await cloudinary.uploader.destroy(quote.image.public_id);
    } catch (err) {
      console.error("Failed to delete image:", err.message);
    }
  }

  return quoteRepository.deleteQuote(id);
};

/**
 Toggle active
 */
const toggleQuoteActive = async (id) => {
  const quote = await quoteRepository.findById(id);

  if (!quote) {
    throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
  }

  return quoteRepository.toggleActive(id);
};

/**
 Get random quote
 */
const getRandomQuote = async (category = null) => {
  return quoteRepository.getRandomQuoteByCategory(category);
};

export default {
  createQuote,
  getAllQuotes,
  getQuoteById,
  updateQuote,
  deleteQuote,
  toggleQuoteActive,
  getRandomQuote,
};