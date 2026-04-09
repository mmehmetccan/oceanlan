const jwt = require('jsonwebtoken');
const User = require('../models/UserModel');

const protect = async (req, res, next) => {
  let token;

  // 1. Durum: Header kontrolü (Normal API istekleri için)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } 
  // 🟢 2. Durum: URL Query kontrolü (Steam yönlendirmesi gibi özel durumlar için)
  else if (req.query && req.query.token) {
    token = req.query.token;
  }
console.log("Gelen Query:", req.query);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Yetkisiz erişim: Token bulunamadı' });
  }

  try {
    // 3. Token'ı doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Kullanıcıyı bul
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    // 4.1 Presence güncellemesi
    await User.updateOne(
      { _id: decoded.id },
      { $set: { onlineStatus: 'online', lastSeenAt: new Date() } }
    );

    next();
  } catch (error) {
    console.error("Auth Hatası:", error);
    return res.status(401).json({ success: false, message: 'Yetkisiz erişim: Geçersiz token' });
  }
};

module.exports = { protect };