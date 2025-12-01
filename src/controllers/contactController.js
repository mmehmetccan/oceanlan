const sendEmail = require('../utils/sendEmail');
const User = require('../models/UserModel');

const sendContactEmail = async (req, res) => {
    try {
        const { subject, message } = req.body;
        const userId = req.user.id;

        if (!subject || !message) {
            return res.status(400).json({ success: false, message: 'Konu ve mesaj zorunludur.' });
        }

        const user = await User.findById(userId);

        // E-posta içeriği (Admin'e gidecek)
        const emailContent = `
            <h3>Yeni İletişim Mesajı</h3>
            <p><strong>Kullanıcı:</strong> ${user.username} (${user.email})</p>
            <p><strong>ID:</strong> ${userId}</p>
            <hr />
            <p><strong>Konu:</strong> ${subject}</p>
            <p><strong>Mesaj:</strong></p>
            <p style="background:#f5f5f5; padding:10px; border-left: 4px solid #5865f2;">
                ${message.replace(/\n/g, '<br>')}
            </p>
        `;

        // Admin e-postasına gönder (SMTP_EMAIL genellikle admin adresidir)
        await sendEmail({
            email: process.env.SMTP_EMAIL,
            subject: `[OceanLan İletişim] ${subject}`,
            message: emailContent
        });

        res.status(200).json({ success: true, message: 'Mesajınız destek ekibine iletildi.' });

    } catch (error) {
        console.error("İletişim mail hatası:", error);
        res.status(500).json({ success: false, message: 'Mesaj gönderilemedi.', error: error.message });
    }
};

module.exports = { sendContactEmail };