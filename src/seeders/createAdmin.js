import bcrypt from "bcryptjs";
import env from "../config/env.js";
import User from "../models/user.model.js";
import roles from "../constants/roles.js";
import logger from "../utils/logger.js";

const createAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({
      email: env.adminEmail,
    });

    if (existingAdmin) {
      logger.info("Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(
      env.adminPassword,
      env.bcryptSaltRounds
    );

    const admin = await User.create({
      name: "Super Admin",
      email: env.adminEmail,
      password: hashedPassword,
      role: roles.ADMIN,
    });

    logger.info(`Super Admin created: ${admin.email}`);
  } catch (error) {
    logger.error(`Admin seeder error: ${error.message}`);
  }
};

export default createAdmin;