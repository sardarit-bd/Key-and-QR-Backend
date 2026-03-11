import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import {
  deleteCloudinaryImage,
  uploadImageBuffer,
} from "../../utils/cloudinary.util.js";
import productRepository from "./product.repository.js";
import mediaCleanupService from "../media-cleanup/mediaCleanup.service.js";

const parseRemoveGallery = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

const createProduct = async (payload, image, gallery = []) => {
  if (!image) {
    throw new AppError(httpStatus.BAD_REQUEST, "Product image required");
  }

  const uploadedMainImage = await uploadImageBuffer(image.buffer);
  const uploadedGalleryImages = [];

  try {
    for (const img of gallery) {
      const uploaded = await uploadImageBuffer(img.buffer);
      uploadedGalleryImages.push({
        public_id: uploaded.public_id,
        url: uploaded.secure_url,
      });
    }

    return await productRepository.createProduct({
      ...payload,
      price: Number(payload.price),
      stock: Number(payload.stock || 0),
      image: {
        public_id: uploadedMainImage.public_id,
        url: uploadedMainImage.secure_url,
      },
      gallery: uploadedGalleryImages,
    });
  } catch (error) {
    if (uploadedMainImage?.public_id) {
      await mediaCleanupService.enqueueMediaCleanup(
        uploadedMainImage.public_id,
        "PRODUCT_CREATE_DB_FAILED"
      );
    }

    for (const img of uploadedGalleryImages) {
      await mediaCleanupService.enqueueMediaCleanup(
        img.public_id,
        "PRODUCT_CREATE_DB_FAILED"
      );
    }

    throw error;
  }
};

const getAllProducts = async (query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const search = query.search || "";
  const isTrash = String(query.trash).toLowerCase() === "true";

  return productRepository.getAllProducts({
    search,
    page,
    limit,
    isActive: !isTrash,
  });
};

const getProductById = async (id) => {
  const product = await productRepository.getProductById(id);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  return product;
};

const updateProduct = async (id, payload, image, gallery = []) => {
  const existingProduct = await productRepository.getProductById(id);

  if (!existingProduct) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  let imageData = existingProduct.image;
  let galleryData = [...(existingProduct.gallery || [])];

  const removeGalleryIds = parseRemoveGallery(payload.removeGallery);
  const replaceGallery =
    String(payload.replaceGallery).toLowerCase() === "true";

  delete payload.removeGallery;
  delete payload.replaceGallery;

  if (image) {
    const uploadedMainImage = await uploadImageBuffer(image.buffer);

    if (existingProduct.image?.public_id) {
      try {
        await deleteCloudinaryImage(existingProduct.image.public_id);
      } catch {
        await mediaCleanupService.enqueueMediaCleanup(
          existingProduct.image.public_id,
          "PRODUCT_UPDATE_OLD_IMAGE_DELETE_FAILED"
        );
      }
    }

    imageData = {
      public_id: uploadedMainImage.public_id,
      url: uploadedMainImage.secure_url,
    };
  }

  if (removeGalleryIds.length > 0) {
    const toRemove = galleryData.filter((img) =>
      removeGalleryIds.includes(img.public_id)
    );

    for (const img of toRemove) {
      try {
        await deleteCloudinaryImage(img.public_id);
      } catch {
        await mediaCleanupService.enqueueMediaCleanup(
          img.public_id,
          "PRODUCT_UPDATE_OLD_GALLERY_DELETE_FAILED"
        );
      }
    }

    galleryData = galleryData.filter(
      (img) => !removeGalleryIds.includes(img.public_id)
    );
  }

  if (replaceGallery) {
    for (const img of galleryData) {
      try {
        await deleteCloudinaryImage(img.public_id);
      } catch {
        await mediaCleanupService.enqueueMediaCleanup(
          img.public_id,
          "PRODUCT_UPDATE_OLD_GALLERY_DELETE_FAILED"
        );
      }
    }

    galleryData = [];

    for (const img of gallery) {
      const uploaded = await uploadImageBuffer(img.buffer);
      galleryData.push({
        public_id: uploaded.public_id,
        url: uploaded.secure_url,
      });
    }
  } else if (gallery.length > 0) {
    for (const img of gallery) {
      const uploaded = await uploadImageBuffer(img.buffer);
      galleryData.push({
        public_id: uploaded.public_id,
        url: uploaded.secure_url,
      });
    }
  }

  return productRepository.updateProduct(id, {
    ...payload,
    ...(payload.price !== undefined && { price: Number(payload.price) }),
    ...(payload.stock !== undefined && { stock: Number(payload.stock) }),
    image: imageData,
    gallery: galleryData,
  });
};

const softDeleteProduct = async (id) => {
  const product = await productRepository.getProductById(id);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  return productRepository.softDeleteProduct(id);
};

const restoreProduct = async (id) => {
  const product = await productRepository.getProductById(id);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  return productRepository.restoreProduct(id);
};

const permanentDeleteProduct = async (id) => {
  const product = await productRepository.getProductById(id);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  if (product.image?.public_id) {
    try {
      await deleteCloudinaryImage(product.image.public_id);
    } catch {
      await mediaCleanupService.enqueueMediaCleanup(
        product.image.public_id,
        "PRODUCT_PERMANENT_DELETE_IMAGE_DELETE_FAILED"
      );
    }
  }

  if (product.gallery?.length > 0) {
    for (const img of product.gallery) {
      try {
        await deleteCloudinaryImage(img.public_id);
      } catch {
        await mediaCleanupService.enqueueMediaCleanup(
          img.public_id,
          "PRODUCT_PERMANENT_DELETE_GALLERY_DELETE_FAILED"
        );
      }
    }
  }

  return productRepository.permanentDeleteProduct(id);
};

export default {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  softDeleteProduct,
  restoreProduct,
  permanentDeleteProduct,
};