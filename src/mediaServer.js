const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const NodeMediaServer = require("node-media-server");

// GÜVENLİK İÇİN EKLENDİ (Faz 10.C)
const User = require('./models/UserModel');

console.log("--- MEDIA_SERVER.JS (Manuel FFmpeg + GÜVENLİK) ---");

const mediaPath = path.join(__dirname, "..", "media");
console.log("📁 Mediaroot yolu:", mediaPath);

const config = {
  rtmp: {
    port: 1935,
    host: "127.0.0.1",
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: 8000,
    host: "127.0.0.1",
    mediaroot: mediaPath,
    allow_origin: "*",
  },
  // 'trans' bloğu yok, çünkü manuel yapıyoruz (SİZİN TERCİHİNİZ)
};

const nms = new NodeMediaServer(config);

// ----------------------------------------------------
// --- FAZ 10.C: YAYIN GÜVENLİK KONTROLÜ (YENİ EKLENDİ) ---
// ----------------------------------------------------
// Bu, 'postPublish'ten ÖNCE çalışır
nms.on('prePublish', async (id, StreamPath, args) => {
  console.log(`[NMS GÜVENLİK] Yayın Kontrol Ediliyor: ${StreamPath}`);

  // StreamPath şuna benzer: /live/ANAHTAR
  // 'ANAHTAR' kısmını yoldan (path) ayıklıyoruz
  const streamKey = StreamPath.split('/').pop(); // 'pop()' son elemanı alır

  if (!streamKey) {
     console.error("[NMS GÜVENLİK] YAYIN REDDEDİLDİ: Yayın anahtarı yok.");
     let session = nms.getSession(id);
     return session.reject(); // Yayını reddet
  }

  try {
    // 1. Anahtarı veritabanında ara
    const user = await User.findOne({ streamKey: streamKey }).select('+streamKey');

    if (user) {
      // 2. BAŞARILI: Anahtar bulundu
      console.log(`[NMS GÜVENLİK] YAYIN KABUL EDİLDİ: Anahtar, ${user.username} kullanıcısına ait.`);
      // İzin ver, postPublish tetiklenecek
    } else {
      // 3. BAŞARISIZ: Anahtar geçersiz
      console.error(`[NMS GÜVENLİK] YAYIN REDDEDİLDİ: Geçersiz anahtar (${streamKey})`);
      let session = nms.getSession(id);
      return session.reject(); // Yayını reddet
    }
  } catch (error) {
     console.error(`[NMS GÜVENLİK] Veritabanı hatası: ${error.message}`);
     let session = nms.getSession(id);
     return session.reject(); // Hata durumunda daima reddet
  }
});

// ----------------------------------------------------
// --- SİZİN ORİJİNAL KODUNUZ (FFmpeg'i Manuel Çalıştırma) ---
// ----------------------------------------------------
// Bu, sadece 'prePublish' başarılı olursa çalışır
nms.on("postPublish", (id, streamPath, args) => {
  console.log(`[NMS] Yayın Başladı (Manuel): ${streamPath}`);

  const streamKey = streamPath.split("/").pop();
  const outputDir = path.join(mediaPath, "live", streamKey);

  // 🔧 Klasör yoksa oluştur
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📂 Klasör oluşturuldu: ${outputDir}`);
  }

  // GÜVENLİ MOD AYARLARI (ac: 'aac', vc: 'libx264' yerine 'copy')
  // Sizin orijinal kodunuz 'copy' ve 'aac' kullanıyordu, bu daha hızlıdır.
  const ffmpegArgs = [
    "-i",
    `rtmp://127.0.0.1${streamPath}`,
    "-c:v", "copy", // Videoyu kopyala (Hızlı)
    "-c:a", "aac",  // Sesi AAC'ye dönüştür (Güvenli)
    "-f", "hls",
    "-hls_time", "2",
    "-hls_list_size", "10",
    "-hls_segment_filename", `${outputDir}/segment%03d.ts`,
    `${outputDir}/index.m3u8`,
  ];

  console.log("▶️ FFmpeg başlatılıyor (Manuel):", ffmpegArgs.join(" "));

  // FFmpeg yolunu (\\ yerine /) terminalde çalıştığını bildiğimiz formatla değiştirdim
  const ffmpeg = spawn("C:/ffmpeg/bin/ffmpeg.exe", ffmpegArgs);

  ffmpeg.stderr.on("data", (data) =>
    console.log(`[FFmpeg]: ${data.toString()}`)
  );
  ffmpeg.on("close", (code) =>
    console.log(`[FFmpeg] işlem bitti, kod: ${code}`)
  );

  // FFmpeg prosesini sakla ki yayın bitince durdurabilelim
  nms.getSession(id).ffmpegProcess = ffmpeg;
});

// Sizin orijinal kodunuzda bu yoktu, ancak bu GEREKLİ.
// Yayın bittiğinde, 'spawn' ettiğimiz FFmpeg işlemini manuel olarak durdurmalıyız,
// yoksa sunucuda "zombi" prosesler olarak sonsuza kadar çalışırlar.
nms.on('donePublish', (id, StreamPath, args) => {
  console.log(`[NMS] Yayın Bitti: ${StreamPath}`);
  let session = nms.getSession(id);
  if (session && session.ffmpegProcess) {
    console.log('[FFmpeg] Manuel işlem durduruluyor...');
    session.ffmpegProcess.kill('SIGINT'); // FFmpeg'i güvenli kapat
  }
});


nms.run();
module.exports = nms;