import multer from "multer";
import AppError from "../utils/AppError.js";
import httpStatus from "../constants/httpStatus.js";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("audio/")) {
        return cb(new AppError(httpStatus.BAD_REQUEST, "Only image and audio files are allowed"), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter,
});

export const uploadProductImages = upload.fields([
    { name: "image", maxCount: 1 },
    { name: "gallery", maxCount: 5 },
]);

export const uploadSingleImage = upload.single("image");