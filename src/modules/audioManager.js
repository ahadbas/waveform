export function createAudioManager() {
  let audioContext = null;
  let analyser = null;
  let source = null;
  let mediaStream = null;

  const fftSize = 1024;

  async function start() {
    if (audioContext && audioContext.state === "suspended") {
      await audioContext.resume();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia is not supported in this browser");
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;
    // Lower smoothing on mobile for more responsive feel
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                     (window.innerWidth <= 768);
    analyser.smoothingTimeConstant = isMobile ? 0.7 : 0.9;

    source.connect(analyser);
  }

  function stop() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    analyser = null;
    source = null;
  }

  function getFrequencyData() {
    if (!analyser) return null;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  function getTimeDomainData() {
    if (!analyser) return null;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    return dataArray;
  }

  function getFeatures() {
    const freq = getFrequencyData();
    const time = getTimeDomainData();
    if (!freq || !time) {
      return {
        freq: null,
        time: null,
        bands: null,
        loudness: 0,
      };
    }

    const bands = computeBands(freq, 5);
    const loudness = computeRms(time);

    return {
      freq,
      time,
      bands,
      loudness,
    };
  }

  return {
    start,
    stop,
    getFrequencyData,
    getTimeDomainData,
    getFeatures,
  };
}

function computeBands(freqArray, bandCount) {
  const bands = new Array(bandCount).fill(0);
  const len = freqArray.length;
  const bandSize = Math.floor(len / bandCount);

  for (let i = 0; i < bandCount; i++) {
    let sum = 0;
    const start = i * bandSize;
    const end = i === bandCount - 1 ? len : start + bandSize;
    for (let j = start; j < end; j++) {
      sum += freqArray[j];
    }
    bands[i] = sum / (end - start || 1);
  }

  return bands;
}

function computeRms(timeArray) {
  let sumSquares = 0;
  const len = timeArray.length;
  for (let i = 0; i < len; i++) {
    const v = (timeArray[i] - 128) / 128;
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / len);
  return rms;
}

