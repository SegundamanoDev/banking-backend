const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  // 1. Create a transporter (Use Gmail, SendGrid, or Mailtrap for testing)
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // 2. Define email options
  const mailOptions = {
    from: `"Zondo Bank" <noreply@geminibank.com>`,
    to: options.email,
    subject: options.subject,
    html: options.html, // Sending HTML for a "Sweet UI" look in the inbox
  };

  // 3. Send it
  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
