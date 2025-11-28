const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // .env dosyasındaki MONGO_URI'yi kullanarak bağlanmayı dener
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(`[DB]: MongoDB başarıyla bağlandı: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[DB HATA]: ${error.message}`);
    // Hata durumunda uygulamayı sonlandır
    process.exit(1);
  }
};

// Bu fonksiyonu başka dosyalarda kullanmak için dışa aktar
module.exports = connectDB;