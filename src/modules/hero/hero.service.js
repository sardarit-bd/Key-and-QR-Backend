import AppError from "../../utils/AppError.js";
import httpStatus from "../../constants/httpStatus.js";
import heroRepository from "./hero.repository.js";

const getHeroContent = async () => {
  return await heroRepository.getHeroContent();
};

const updateHeroContent = async (id, payload, userId) => {
  const hero = await heroRepository.getHeroContent();
  
  if (!hero) {
    throw new AppError(httpStatus.NOT_FOUND, "Hero content not found");
  }
  
  return await heroRepository.updateHeroContent(id, payload, userId);
};

export default {
  getHeroContent,
  updateHeroContent,
};