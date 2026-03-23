// src/utils/aiAssistant.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const askOceanAI = async (prompt) => {
    try {
        const fullPrompt = `Sen OceanLan platformunun asistanısın. 
        Kısa, samimi ve teknik cevaplar ver. Soru: ${prompt}`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("AI Hatası:", error);
        return "Dalgalar şu an çok yüksek, cevap veremiyorum! 🌊";
    }
};

module.exports = { askOceanAI };