import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import env from "../config/env.js";

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

export const uploadImageBuffer = (buffer, folder = "key-and-qr/products") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

export const deleteCloudinaryImage = async (publicId) => {
  return cloudinary.uploader.destroy(publicId);
};

export default cloudinary;