
const jwt = require('jsonwebtoken');
const User = require('../models/UserModel');

const protect = async (req, res, next) => {
  let token;

  // 1. Istegin 'headers' (baslik) kismina bak: Authorization var mi ve Bearer ile mi basliyor?
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 2. Token'i al ('Bearer ' kismini at, kalan token'i al)
      token = req.headers.authorization.split(' ')[1];

      // 3. Token'i dogrula (bizim JWT_SECRET ile imzalanmis mi?)
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 4. Token gecerliyse, kullaniciyi bul ve 'req.user'a ekle (sifreyi gosterme)
      req.user = await User.findById(decoded.id).select('-password');

      // 4.1 Presence: her istekte online/son gorulme guncelle
      await User.updateOne(
        { _id: decoded.id },
        { $set: { onlineStatus: 'online', lastSeenAt: new Date() } }
      );

      // 5. Devam et
      return next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Yetkisiz erisim: Gecersiz token' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Yetkisiz erisim: Token bulunamadi' });
  }
};

module.exports = { protect };
