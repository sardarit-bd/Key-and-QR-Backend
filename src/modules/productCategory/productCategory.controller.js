import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import productCategoryService from "./productCategory.service.js";

const createProductCategory = catchAsync(async (req, res) => {
  const result = await productCategoryService.createProductCategory(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Product category created successfully",
    data: result,
  });
});

const getAllProductCategories = catchAsync(async (req, res) => {
  const result = await productCategoryService.getAllProductCategories(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product categories fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getProductCategoryById = catchAsync(async (req, res) => {
  const result = await productCategoryService.getProductCategoryById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product category fetched successfully",
    data: result,
  });
});

const getProductCategoryBySlug = catchAsync(async (req, res) => {
  const result = await productCategoryService.getProductCategoryBySlug(req.params.slug);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product category fetched successfully",
    data: result,
  });
});

const updateProductCategory = catchAsync(async (req, res) => {
  const result = await productCategoryService.updateProductCategory(req.params.id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product category updated successfully",
    data: result,
  });
});

const deleteProductCategory = catchAsync(async (req, res) => {
  await productCategoryService.deleteProductCategory(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product category deleted successfully",
    data: null,
  });
});

const toggleProductCategoryActive = catchAsync(async (req, res) => {
  const result = await productCategoryService.toggleProductCategoryActive(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Product category ${result.isActive ? "activated" : "deactivated"} successfully`,
    data: result,
  });
});

const reorderProductCategories = catchAsync(async (req, res) => {
  const result = await productCategoryService.reorderProductCategories(req.body.orderedIds);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product category order updated successfully",
    data: result,
  });
});

export default {
  createProductCategory,
  getAllProductCategories,
  getProductCategoryById,
  getProductCategoryBySlug,
  updateProductCategory,
  deleteProductCategory,
  toggleProductCategoryActive,
  reorderProductCategories,
};
