import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import productService from "./product.service.js";

const createProduct = catchAsync(async (req, res) => {
  const image = req.files?.image?.[0];
  const gallery = req.files?.gallery || [];

  const result = await productService.createProduct(req.body, image, gallery);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Product created successfully",
    data: result,
  });
});

const getAllProducts = catchAsync(async (req, res) => {
  const result = await productService.getAllProducts(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Products fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getProductById = catchAsync(async (req, res) => {
  const result = await productService.getProductById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product fetched successfully",
    data: result,
  });
});

const updateProduct = catchAsync(async (req, res) => {
  const image = req.files?.image?.[0];
  const gallery = req.files?.gallery || [];

  const result = await productService.updateProduct(
    req.params.id,
    req.body,
    image,
    gallery
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product updated successfully",
    data: result,
  });
});

const deleteProduct = catchAsync(async (req, res) => {
  const result = await productService.softDeleteProduct(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product moved to trash successfully",
    data: result,
  });
});

const restoreProduct = catchAsync(async (req, res) => {
  const result = await productService.restoreProduct(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product restored successfully",
    data: result,
  });
});

const permanentDeleteProduct = catchAsync(async (req, res) => {
  const result = await productService.permanentDeleteProduct(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product permanently deleted successfully",
    data: result,
  });
});

export default {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  restoreProduct,
  permanentDeleteProduct,
};