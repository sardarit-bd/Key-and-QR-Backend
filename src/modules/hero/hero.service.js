import AppError from "../../utils/AppError.js";
import httpStatus from "../../constants/httpStatus.js";
import heroRepository from "./hero.repository.js";
import cloudinary from "../../config/cloudinary.js";

const getHeroContent = async () => {
  return await heroRepository.getHero();
};

const updateHeroContent = async (payload, userId) => {
  const current = await heroRepository.getHero();

  // If the hero image is being replaced with a different Cloudinary asset,
  // clean up the old asset (fire-and-forget; never block the save on it).
  const nextImageUrl = payload?.heroImage?.url;
  const currentImage = current?.heroImage;

  if (
    currentImage?.publicId &&
    nextImageUrl &&
    nextImageUrl !== currentImage.url &&
    currentImage.url?.includes("cloudinary.com")
  ) {
    const oldPublicId = currentImage.publicId;
    cloudinary.uploader
      .destroy(oldPublicId)
      .catch(() => {});
  }

  return await heroRepository.updateHero(payload, userId);
};

const getShopHeroContent = async () => {
  return await heroRepository.getShopHero();
};

const updateShopHeroContent = async (payload, userId) => {
  const current = await heroRepository.getShopHero();

  // Clean up old Cloudinary asset if replaced
  const nextImageUrl = payload?.imageUrl;
  const currentImageUrl = current?.imageUrl;
  const currentPublicId = current?.publicId;

  if (
    currentPublicId &&
    nextImageUrl &&
    nextImageUrl !== currentImageUrl &&
    currentImageUrl?.includes("cloudinary.com")
  ) {
    cloudinary.uploader
      .destroy(currentPublicId)
      .catch(() => {});
  }

  return await heroRepository.updateShopHero(payload, userId);
};

const getAnnouncementBanner = async () => {
  return await heroRepository.getAnnouncementBanner();
 };

const updateAnnouncementBanner = async (payload, userId) => {
  return await heroRepository.updateAnnouncementBanner(payload, userId);
};

export default {
  getHeroContent,
  updateHeroContent,
  getShopHeroContent,
  updateShopHeroContent,
  getAnnouncementBanner,
  updateAnnouncementBanner,
};

