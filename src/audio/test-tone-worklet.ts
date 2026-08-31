class TestToneProcessor extends AudioWorkletProcessor {
  private phase = 0;

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0][0];
    const inc = (2 * Math.PI * 440) / sampleRate;
    for (let i = 0; i < out.length; i++) {
      out[i] = 0.15 * Math.sin(this.phase);
      this.phase = (this.phase + inc) % (2 * Math.PI);
    }
    return true;
  }
}

registerProcessor("test-tone", TestToneProcessor);
