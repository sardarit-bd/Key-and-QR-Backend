import app from "../src/app/app.js";
import connectDB from "../src/config/database.js";
import { connectCloudinary } from "../src/config/cloudinary.js";

let isConnected = false;

export default async function handler(req, res) {
  if (!isConnected) {
    await connectDB();
    await connectCloudinary();
    isConnected = true;
  }

  return app(req, res);
}