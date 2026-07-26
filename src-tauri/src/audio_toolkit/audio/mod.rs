// Re-export all audio components
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
pub use utils::{load_wav_file, save_wav_file};
pub use visualizer::AudioVisualiser;
