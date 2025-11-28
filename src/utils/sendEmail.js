const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Port 465 ise secure: true, değilse false
  const isSecure = process.env.SMTP_PORT == 465;

  console.log(`[EMAIL]: Bağlanılıyor... Host: ${process.env.SMTP_HOST}, Port: ${process.env.SMTP_PORT}, Secure: ${isSecure}`);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: isSecure,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
    // Yerel geliştirmede sertifika sorunlarını önlemek için:
    tls: {
        rejectUnauthorized: false
    },
    // Hata ayıklama modları
    debug: true,
    logger: true
  });

  const message = {
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.message.replace(/\n/g, '<br>')
  };

  try {
      const info = await transporter.sendMail(message);
      console.log(`[EMAIL]: Mesaj başarıyla gönderildi. ID: ${info.messageId}`);
  } catch (error) {
      console.error("[EMAIL HATA]: Gönderim başarısız!", error);
      // Hatayı yukarı (Controller'a) fırlat ki orada yakalayıp kullanıcıyı silebilelim
      throw new Error('E-posta sunucusu hatası: ' + error.message);
  }
};

module.exports = sendEmail;