const User = require('../models/UserModel'); // Kullanıcı modelimizi içe aktardık
const bcrypt = require('bcryptjs'); // Şifre karşılaştırma için
const jwt = require('jsonwebtoken'); // Token oluşturmak için
const crypto = require('crypto'); // 1. EKLENDİ: Anahtar oluşturmak için
const sendEmail = require('../utils/sendEmail'); // YENİ


const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Kullanıcı Kaydı
const registerUser = async (req, res) => {
  let user = null;
  try {
    const { username, email, password, firstName, lastName, phoneNumber } = req.body;

    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Bu e-posta veya kullanıcı adı zaten kullanımda.' });
    }

    user = await User.create({
      firstName, lastName, phoneNumber, username, email, password, isVerified: false
    });

    // 👇 YENİ: Kod oluştur
    const verificationCode = user.createVerificationCode();
    await user.save({ validateBeforeSave: false });

    // 👇 YENİ: Link yerine Kod gönder
    const message = `
      <h1>Hoş Geldiniz, ${firstName}!</h1>
      <p>OceanLan hesap doğrulama kodunuz:</p>
      <h2 style="color: #5865f2; letter-spacing: 5px;">${verificationCode}</h2>
      <p>Bu kodu doğrulama ekranına giriniz. Kod 10 dakika geçerlidir.</p>
    `;

    try {
      await sendEmail({ email: user.email, subject: 'Doğrulama Kodunuz', message });

      return res.status(200).json({
        success: true,
        message: 'Doğrulama kodu gönderildi.',
        email: user.email // Frontend'e email'i geri dön ki sayfaya taşıyabilelim
      });

    } catch (emailError) {
      if (user) await User.findByIdAndDelete(user._id);
      return res.status(500).json({ success: false, message: 'E-posta gönderilemedi.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    E-posta Doğrulama (Linke tıklanınca çalışır)
const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if(!email || !code) {
        return res.status(400).json({ success: false, message: 'E-posta ve kod gereklidir.' });
    }

    // Gelen kodu hashle ve veritabanındakiyle karşılaştır
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

    const user = await User.findOne({
      email: email,
      verificationToken: hashedCode,
      verificationExpire: { $gt: Date.now() }, // Süresi dolmamış olmalı
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Geçersiz veya süresi dolmuş kod.' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpire = undefined;
    await user.save();

    res.status(200).json({ success: true, message: 'Hesap başarıyla doğrulandı!' });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resendCode = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
        if (user.isVerified) return res.status(400).json({ success: false, message: 'Hesap zaten doğrulanmış.' });

        const verificationCode = user.createVerificationCode();
        await user.save({ validateBeforeSave: false });

        const message = `
          <h1>Yeni Doğrulama Kodunuz</h1>
          <h2 style="color: #5865f2; letter-spacing: 5px;">${verificationCode}</h2>
        `;

        await sendEmail({ email: user.email, subject: 'Yeni Doğrulama Kodu', message });

        res.status(200).json({ success: true, message: 'Yeni kod gönderildi.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Giriş Yapma
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Şifreyi de (select +password) getir
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Geçersiz e-posta veya şifre.' });
    }

    // 🛑 KONTROL: Kullanıcı doğrulanmış mı?
    // Eğer veritabanında isVerified: false ise BURADAN GEÇEMEZ.
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: 'Giriş yapmadan önce lütfen e-posta adresinizi doğrulayın.'
      });
    }

    // Başarılı ise token ver
    res.status(200).json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Bu e-posta ile kayıtlı kullanıcı bulunamadı' });
    }

    // 1. Reset token oluştur (Modeldeki metot)
    const resetToken = user.getResetPasswordToken();

    // 2. Token'ı DB'ye kaydet
    await user.save({ validateBeforeSave: false });

    // 3. Link oluştur (Frontend URL'si)
    const resetUrl = `http://oceanlan.com/resetpassword/${resetToken}`;

    // 4. E-posta İçeriği (HTML)
    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #5865f2;">Şifre Sıfırlama İsteği</h2>
        <p>Hesabınız için bir şifre sıfırlama talebi aldık.</p>
        <p>Şifrenizi yenilemek için lütfen aşağıdaki butona tıklayın:</p>
        <a href="${resetUrl}" style="background-color: #5865f2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Şifremi Sıfırla</a>
        <p style="margin-top: 20px; font-size: 12px; color: #777;">Bu işlemi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
      </div>
    `;

    try {
      // 5. Gerçek E-postayı Gönder
      await sendEmail({
        email: user.email,
        subject: 'OceanLan Şifre Sıfırlama',
        message, // HTML içeriği sendEmail içinde işleniyor
      });

      res.status(200).json({
        success: true,
        message: 'Sıfırlama bağlantısı e-posta adresinize gönderildi.',
      });

    } catch (err) {
      console.error("Şifre sıfırlama mail hatası:", err);

      // Hata olursa token'ı temizle ki kullanıcı tekrar deneyebilsin
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({ success: false, message: 'E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.' });
    }

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- YENİ: ŞİFRE SIFIRLAMA ---
// @desc    Yeni şifreyi kaydeder
// @route   PUT /api/v1/auth/resetpassword/:resetToken
const resetPassword = async (req, res) => {
  try {
    // URL'den gelen token'ı hashleyip DB'dekiyle karşılaştıracağız
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resetToken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }, // Süresi dolmamış olmalı
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Geçersiz veya süresi dolmuş token' });
    }

    // Yeni şifreyi ata
    user.password = req.body.password;

    // Token alanlarını temizle
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    // Kaydet (pre-save hook çalışıp şifreyi hashleyecek)
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Şifre başarıyla güncellendi. Giriş yapabilirsiniz.',
      token: generateToken(user._id),
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getStreamKey = async (req, res) => {
  try {
    // 1. Kullanıcıyı bul
    const user = await User.findById(req.user.id).select('+streamKey');

    // 2. Kullanıcının anahtarı yoksa (örn: eski kullanıcı), ŞİMDİ oluştur
    if (!user.streamKey) {
      console.log(`[StreamKey]: ${user.username} için anahtar bulunamadı. Yenisi oluşturuluyor...`);
      // a. Yeni anahtar oluştur
      const newKey = `sk_live_${crypto.randomBytes(10).toString('hex')}`;

      // b. Kullanıcıya ata
      user.streamKey = newKey;

      // c. Veritabanına kaydet (sadece bu kullanıcıyı)
      await user.save();

      // d. Yeni anahtarı döndür
      return res.status(201).json({ // 201: Oluşturuldu
        success: true,
        message: 'Yeni yayın anahtarı oluşturuldu',
        streamKey: newKey,
      });
    }
const baseUrl = 'http://localhost';

// 3. Anahtar zaten varsa, onu döndür
res.status(200).json({
  success: true,
  message: 'Mevcut yayın anahtarı getirildi',
  streamKey: user.streamKey,

  // YENİ EKLENEN SATIR: İzleme URL'sini oluştur
  streamUrl: `${baseUrl}:8000/live/${user.streamKey}/index.m3u8`,

});

  } catch (error) {
    res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};



// module.exports'u GÜNCELLE
module.exports = {
  registerUser,
  loginUser,
  verifyEmail,
  resendCode,
  getStreamKey,
  forgotPassword,
  resetPassword,
};