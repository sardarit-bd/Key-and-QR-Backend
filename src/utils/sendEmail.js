import nodemailer from "nodemailer";
import env from "../config/env.js";
import logger from "./logger.js";
import AppError from "./AppError.js";
import httpStatus from "../constants/httpStatus.js";

const sendEmail = async ({ to, subject, html }) => {
  // Check if SMTP credentials are configured
  if (!env.emailHost || !env.emailUser || !env.emailPass) {
    if (env.nodeEnv !== "production") {
      logger.warn(`[sendEmail] SMTP credentials (EMAIL_HOST, EMAIL_USER, EMAIL_PASS) not configured in development environment.`);
      console.log(`\n================== [DEV EMAIL SIMULATION] ==================`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Timestamp: ${new Date().toISOString()}`);
      console.log(`------------------------------------------------------------`);
      console.log(html);
      console.log(`============================================================\n`);
      return { messageId: "dev-simulated-" + Date.now() };
    }

    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "Email service is currently unavailable. Please contact support."
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host: env.emailHost,
      port: env.emailPort,
      secure: env.emailPort === 465,
      auth: {
        user: env.emailUser,
        pass: env.emailPass,
      },
    });

    const result = await transporter.sendMail({
      from: env.emailFrom || `InspireTag <${env.emailUser}>`,
      to,
      subject,
      html,
    });

    return result;
  } catch (error) {
    logger.error(`[sendEmail] Failed to send email to ${to}:`, {
      message: error.message,
      stack: error.stack,
    });

    if (env.nodeEnv !== "production") {
      throw new AppError(
        httpStatus.BAD_GATEWAY,
        `Failed to send email (${error.message}). Check SMTP configuration in backend .env.`
      );
    }

    throw new AppError(
      httpStatus.BAD_GATEWAY,
      "Unable to send email at this time. Please try again later."
    );
  }
};

export default sendEmail;