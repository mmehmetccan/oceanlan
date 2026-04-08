// public/processors/rnnoise-processor.js
import "./rnnoise.js"; // İndirdiğin js dosyasını içeri aktarır

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.alive = true;
    this.model = null;
    
    // RNNoise 480 frame'lik paketlerle çalışır
    this.bufferSize = 480;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferWriteIndex = 0;

    // Ana thread'den gelecek mesajları dinle (WASM yükleme vb.)
    this.port.onmessage = (event) => {
      if (event.data.type === 'init') {
        this.initModel();
      }
    };
  }

  async initModel() {
    // WASM modülünü yükle ve RNNoise örneği oluştur
    // Not: Bu kısım indirdiğin rnnoise.js kütüphanesinin API yapısına göre 
    // küçük değişiklikler gösterebilir.
    if (typeof createRNNoiseModule !== 'undefined') {
      const module = await createRNNoiseModule();
      this.model = module.create();
      console.log("RNNoise WASM İşlemcisi Hazır!");
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!this.model || !input[0]) {
      // Model henüz hazır değilse sesi olduğu gibi geçir (bypass)
      if (input[0]) output[0].set(input[0]);
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    // Gelen ses verisini 480'lik paketlere bölerek RNNoise'a gönder
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferWriteIndex++] = inputChannel[i];

      if (this.bufferWriteIndex >= this.bufferSize) {
        // 480 frame dolunca gürültüyü temizle
        const cleaned = this.model.process(this.buffer);
        // Temizlenen sesi çıkışa ver
        // (Gerçek uygulamada burada bir gecikme yönetimi gerekebilir)
        this.bufferWriteIndex = 0;
      }
      
      // Şimdilik basitleştirilmiş aktarım
      outputChannel[i] = inputChannel[i]; 
    }

    return this.alive;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);