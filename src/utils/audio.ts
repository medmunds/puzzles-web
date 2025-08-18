import { sleep } from "./timing.ts";

let audioContext: AudioContext | undefined;

async function getAudioContext() {
  let justCreated = false;
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContext();
    justCreated = true;
  }
  if (audioContext.state === "suspended") {
    try {
      // "…When the audio is blocked by autoplay policy, the promise
      // from AudioContext.resume() will neither resolve or reject…"
      await Promise.race([audioContext.resume(), sleep(100)]);
    } catch {
      // If the AudioContext is "interrupted" it may have reported "suspended"
      // for privacy reasons. The attempt to resume causes this error, and
      // also transitions the reported state to "suspended".
    }
  }
  if (
    !justCreated &&
    audioContext.state !== "running" &&
    audioContext.state !== "interrupted"
  ) {
    // Possibly a zombie AudioContext on iOS. Attempt to recreate it.
    if (audioContext.state !== "closed") {
      // Make a best effort to release the dead resource first.
      try {
        await audioContext.close();
      } catch {}
    }
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Can't ramp exponentially down to or up from 0, so just get close.
const zeroGain = 0.001;

const C5 = 523.251; // Hz
// const C6 = 1046.5; // Hz

/**
 * Play a "click" audio sound.
 * (Only works after user interaction with the page.)
 */
export async function audioClick(options?: {
  duration?: number; // ms
  frequency?: number; // Hz
  volume?: number; // 0-100
  referenceGain?: number; // number, AudioContext gain at volume 100
}): Promise<void> {
  const {
    duration = 7,
    frequency = C5,
    volume = 50,
    referenceGain = 0.2,
  } = options ?? {};
  const durationSec = duration / 1000;

  const gain = (referenceGain * volume) / 100;
  if (gain <= zeroGain) {
    return;
  }

  const audioContext = await getAudioContext();
  const startTime = audioContext.currentTime;
  // To avoid pop, ramp up over 5ms or 10% of duration, whichever is smaller
  const attack = Math.min(0.005, durationSec * 0.1);
  const endTime = startTime + durationSec;

  const oscillator = audioContext.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);

  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + attack);
  gainNode.gain.exponentialRampToValueAtTime(zeroGain, endTime);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  return new Promise<void>((resolve) => {
    oscillator.addEventListener("ended", () => resolve());
    oscillator.start(startTime);
    oscillator.stop(endTime);
  });
}
