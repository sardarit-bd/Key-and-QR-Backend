import nodemailer from "nodemailer";
import env from "../config/env.js";

const sendEmail = async ({ to, subject, html }) => {
  const transporter = nodemailer.createTransport({
    host: env.emailHost,
    port: env.emailPort,
    secure: false,
    auth: {
      user: env.emailUser,
      pass: env.emailPass,
    },
  });

  await transporter.sendMail({
    from: env.emailFrom,
    to,
    subject,
    html,
  });
};

export default sendEmail;