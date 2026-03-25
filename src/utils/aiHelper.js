// src/utils/aiHelper.js

const { GoogleGenerativeAI } = require("@google/generative-ai");

// .env dosyasındaki anahtarı değişkene atıyoruz
const apiKey = process.env.GEMINI_API_KEY;

// Yapay zekayı bu anahtarla başlatıyoruz
const genAI = new GoogleGenerativeAI(apiKey);

async function askOceanAI(prompt) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("API Bağlantı Hatası:", error);
        return "Şu an teknik bir sorun nedeniyle cevap veremiyorum.";
    }
}

module.exports = { askOceanAI };