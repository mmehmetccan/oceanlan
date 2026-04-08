// public/processors/rnnoise-processor.js
import "./rnnoise.js"; // RNNoise WASM kütüphanesi (global createRNNoiseModule sağlar)

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.alive = true;
    this.model = null;
    this.initStarted = false;

    // RNNoise 480 sample frame (48 kHz'de 10 ms)
    this.frameSize = 480;
    this.inputBuffer = new Float32Array(this.frameSize);
    this.outputBuffer = new Float32Array(this.frameSize);
    this.bufferPos = 0;

    this.port.onmessage = (event) => {
      if (event.data.type === 'init') {
        this.initModel();
      }
    };
  }

  async initModel() {
    if (this.initStarted) return;
    this.initStarted = true;

    try {
      if (typeof createRNNoiseModule !== 'undefined') {
        const module = await createRNNoiseModule();
        this.model = module.create();
        this.port.postMessage({ type: 'ready' });
        console.log('✅ RNNoise WASM hazır');
      } else {
        console.warn('⚠️ createRNNoiseModule bulunamadı');
      }
    } catch (e) {
      console.error('❌ RNNoise başlatılamadı:', e);
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0]) {
      return this.alive;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    // Model hazır değilse bypass (sesi aynen ilet)
    if (!this.model) {
      for (let i = 0; i < inputChannel.length; i++) {
        outputChannel[i] = inputChannel[i];
      }
      return this.alive;
    }

    // RNNoise ile 480 sample bloklar halinde işle
    for (let i = 0; i < inputChannel.length; i++) {
      this.inputBuffer[this.bufferPos] = inputChannel[i];

      // Çıkış için bir önceki işlenmiş bloğu kullan
      if (this.bufferPos < this.frameSize) {
        outputChannel[i] = this.outputBuffer[this.bufferPos] || 0;
      }

      this.bufferPos++;

      if (this.bufferPos >= this.frameSize) {
        const cleaned = this.model.process(this.inputBuffer);
        this.outputBuffer.set(cleaned);
        this.bufferPos = 0;
      }
    }

    return this.alive;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);