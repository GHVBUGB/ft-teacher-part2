/** Test pages only: exercise MediaRecorder without using a physical microphone. */
export function enableSyntheticMicrophone(onStart: () => void = () => {}) {
  navigator.mediaDevices.getUserMedia = async () => {
    onStart();
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const destination = context.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    await context.resume();
    const track = destination.stream.getAudioTracks()[0];
    const stop = track.stop.bind(track);
    let stopped = false;
    track.stop = () => {
      if (stopped) return;
      stopped = true;
      stop();
      oscillator.stop();
      void context.close();
    };
    return destination.stream;
  };
}
