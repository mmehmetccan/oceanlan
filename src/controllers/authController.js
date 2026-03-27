const User = require('../models/UserModel'); // Kullanıcı modelimizi içe aktardık
const Member = require('../models/MemberModel'); // 🟢 EKLENDİ
const bcrypt = require('bcryptjs'); // Şifre karşılaştırma için
const jwt = require('jsonwebtoken'); // Token oluşturmak için
const crypto = require('crypto'); // 1. EKLENDİ: Anahtar oluşturmak için
const sendEmail = require('../utils/sendEmail'); // YENİ
const { processGamification } = require('../utils/gamificationEngine');

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

    const userExists = await User.findOne({
      $or: [
        { email },
        { username: { $regex: new RegExp(`^${username}$`, 'i') } } // 🟢 BURASI DEĞİŞTİ
      ]
    });

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

    if (!email || !code) {
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

    if (req.io) {
      // req.io varsa socket bildirimi de gider (Frontend'de konfetiler patlar 🎉)
      await processGamification(user._id, 'EMAIL_VERIFIED', req.io);
    } else {
      // Socket yoksa bile sessizce veritabanına işler
      await processGamification(user._id, 'EMAIL_VERIFIED', null);
    }

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
    const memberships = await Member.find({ user: user._id }).populate('server', '_id name iconUrl');

    const servers = memberships
      .filter(m => m.server)
      .map(m => ({
        _id: m.server._id,
        name: m.server.name,
        iconUrl: m.server.iconUrl
      }));

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
        lastName: user.lastName,
        level: user.level || 1,
        servers: servers
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// --- ŞİFRE UNUTTUM (KOD GÖNDERİR) ---
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Bu e-posta ile kayıtlı kullanıcı bulunamadı' });
    }

    // 1. 6 Haneli Sayısal Kod Oluştur (Örn: 542189)
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Kodu hashleyip veritabanına kaydet (Güvenlik için)
    user.resetPasswordToken = crypto.createHash('sha256').update(resetCode).digest('hex');
    
    // 3. Kodun geçerlilik süresini ayarla (Örn: 15 dakika)
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    // 4. E-posta İçeriği
    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; text-align: center;">
        <h2 style="color: #1ab199;">OceanLan Şifre Sıfırlama</h2>
        <p>Şifrenizi sıfırlamak için aşağıdaki kodu kullanın:</p>
        <h1 style="background: #f4f4f4; display: inline-block; padding: 10px 20px; letter-spacing: 5px; color: #1ab199; border-radius: 8px;">
          ${resetCode}
        </h1>
        <p style="margin-top: 20px; font-size: 12px; color: #777;">Bu kod 15 dakika geçerlidir. İşlemi siz yapmadıysanız lütfen bu maili dikkate almayın.</p>
      </div>
    `;

    await sendEmail({
      email: user.email,
      subject: 'OceanLan Şifre Sıfırlama Kodu',
      message,
    });

    res.status(200).json({
      success: true,
      message: 'Sıfırlama kodu e-posta adresinize gönderildi.',
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'E-posta gönderilemedi.' });
  }
};

// --- ŞİFRE SIFIRLAMA (KODU KONTROL EDER VE ŞİFREYİ DEĞİŞTİRİR) ---
const resetPassword = async (req, res) => {
  try {
    const { email, resetCode, password } = req.body;

    // Gelen kodu hashle
    const hashedCode = crypto.createHash('sha256').update(resetCode).digest('hex');

    // Kullanıcıyı mail, kod ve süre kontrolüyle bul
    const user = await User.findOne({
      email,
      resetPasswordToken: hashedCode,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Kod geçersiz veya süresi dolmuş' });
    }

    // Yeni şifreyi ata ve token alanlarını temizle
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Şifre başarıyla güncellendi. Giriş yapabilirsiniz.',
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