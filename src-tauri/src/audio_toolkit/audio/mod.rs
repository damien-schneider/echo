mod decoder;
mod device;
pub mod recorder;
mod resampler;
pub mod system_capture;
mod utils;
mod visualizer;

pub use decoder::{decode_audio_file, AudioFormat};
pub(crate) use device::SelectedDeviceCache;
pub use device::{list_input_devices, list_output_devices, CpalDeviceInfo};
pub use recorder::{AudioRecorder, CapturedAudioFrame};
pub use resampler::FrameResampler;
pub use utils::{
    create_wav_file, load_wav_file, read_wav_range, save_wav_file, write_wav_samples, WavSink,
    WavWindows,
};
pub use visualizer::AudioVisualiser;
