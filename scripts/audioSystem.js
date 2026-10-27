// audioSystem.js
class AudioSystem {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.buffers = {}; // store loaded audio buffers
    this.loops = {};   // store currently playing loops
  }

  // Load a sound file
  async loadSound(name, url) {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    this.buffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
  }

  // Play a one-shot sound
  playOneShot(name, volume = 1.0, pitch, pan=0) {
    // console.log("Playing Sound: " + name)
    if (!this.buffers[name]) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers[name];

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = volume;
    gainNode.pan = pan

    source.connect(gainNode).connect(this.ctx.destination);
    source.start(0);
  }

  // Play a looping sound
  playLoop(name, volume = 1.0, pan=0, loopId = null) {
    // console.log("Playing loop: " + name)
    if (!this.buffers[name]) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers[name];
    source.loop = true;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode).connect(this.ctx.destination);
    source.start(0);

    if (loopId) this.loops[loopId] = { source, gainNode };
    return source;
  }

  // Stop a looping sound
  stopLoop(loopId) {
    if (this.loops[loopId]) {
      this.loops[loopId].source.stop();
      delete this.loops[loopId];
    }
  }

  // Adjust volume of a loop
  setLoopVolume(loopId, volume) {
    if (this.loops[loopId]) this.loops[loopId].gainNode.gain.value = volume;
  }
}

export {AudioSystem}