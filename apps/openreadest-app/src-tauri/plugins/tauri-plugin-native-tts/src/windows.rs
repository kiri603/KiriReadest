use std::{marker::PhantomData, sync::mpsc, thread, time::Duration};

use serde::{de::DeserializeOwned, Serialize};
use tauri::{plugin::PluginApi, AppHandle, Emitter, Runtime};
use windows::{
    core::{w, HSTRING, PCWSTR, PWSTR},
    Win32::{
        Globalization::LCIDToLocaleName,
        Media::Speech::{
            ISpObjectToken, ISpObjectTokenCategory, ISpVoice, SpObjectTokenCategory, SpVoice,
            SPCAT_VOICES, SPF_ASYNC, SPF_IS_XML, SPF_PURGEBEFORESPEAK, SPRS_DONE, SPVOICESTATUS,
        },
        System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED},
    },
};

use crate::{models::*, Error, Result};

type Job = Box<dyn FnOnce(&mut std::result::Result<SpeechEngine, String>) + Send>;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SpeechEvent {
    utterance_id: String,
    code: String,
    message: Option<String>,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<NativeTts<R>> {
    let (sender, receiver) = mpsc::channel::<Job>();
    let app = app.clone();
    thread::Builder::new().name("windows-tts".into()).spawn(move || {
        // All COM interfaces are created, used and dropped on this one thread.
        let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok() };
        let mut engine = com.as_ref().map_err(ToString::to_string).and_then(|_| {
            SpeechEngine::new(Box::new(move |event| {
                let _ = app.emit("native-tts-events", event);
            })).map_err(|error| error.to_string())
        });
        loop {
            match receiver.recv_timeout(Duration::from_millis(30)) {
                Ok(job) => job(&mut engine),
                Err(mpsc::RecvTimeoutError::Timeout) => {},
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            if let Ok(engine) = &mut engine { engine.poll(); }
        }
        drop(engine);
        if com.is_ok() { unsafe { CoUninitialize() }; }
    })?;
    Ok(NativeTts { sender, runtime: PhantomData })
}

pub struct NativeTts<R: Runtime> {
    sender: mpsc::Sender<Job>,
    runtime: PhantomData<fn() -> R>,
}

impl<R: Runtime> NativeTts<R> {
    fn request<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&mut SpeechEngine) -> windows::core::Result<T> + Send + 'static,
    ) -> Result<T> {
        let (sender, receiver) = mpsc::sync_channel(1);
        self.sender.send(Box::new(move |engine| {
            let result = match engine {
                Ok(engine) => operation(engine).map_err(|error| error.to_string()),
                Err(error) => Err(error.clone()),
            };
            let _ = sender.send(result);
        })).map_err(|error| Error::NativeTTSError(error.to_string()))?;
        receiver.recv_timeout(Duration::from_secs(10))
            .map_err(|error| Error::NativeTTSError(error.to_string()))?
            .map_err(Error::NativeTTSError)
    }

    pub fn init(&self) -> Result<InitResponse> {
        self.request(|engine| Ok(InitResponse { success: !engine.voices.is_empty() }))
    }
    pub fn speak(&self, args: SpeakArgs) -> Result<SpeakResponse> {
        self.request(move |engine| engine.speak(args))
    }
    pub fn stop(&self) -> Result<()> { self.request(|engine| engine.stop()) }
    pub fn pause(&self) -> Result<()> {
        self.request(|engine| {
            if !engine.paused { unsafe { engine.voice.Pause()? }; engine.paused = true; }
            Ok(())
        })
    }
    pub fn resume(&self) -> Result<()> {
        self.request(|engine| {
            if engine.paused { unsafe { engine.voice.Resume()? }; engine.paused = false; }
            Ok(())
        })
    }
    pub fn set_rate(&self, args: SetRateArgs) -> Result<()> {
        self.request(move |engine| {
            let rate = (args.rate.clamp(0.1, 10.0).log2() * 6.0).round().clamp(-10.0, 10.0) as i32;
            unsafe { engine.voice.SetRate(rate) }
        })
    }
    pub fn set_pitch(&self, args: SetPitchArgs) -> Result<()> {
        self.request(move |engine| { engine.pitch = args.pitch.clamp(0.5, 2.0); Ok(()) })
    }
    pub fn set_voice(&self, args: SetVoiceArgs) -> Result<()> {
        self.request(move |engine| {
            if let Some((_, token)) = engine.voices.iter().find(|(voice, _)| voice.id == args.voice) {
                unsafe { engine.voice.SetVoice(token) }
            } else {
                Err(windows::core::Error::new(windows::Win32::Foundation::E_INVALIDARG, "Windows voice is unavailable"))
            }
        })
    }
    pub fn get_all_voices(&self) -> Result<GetVoicesResponse> {
        self.request(|engine| Ok(GetVoicesResponse { voices: engine.voices.iter().map(|(voice, _)| voice.clone()).collect() }))
    }
    pub fn set_media_session_active(&self, _: SetMediaSessionActiveRequest) -> Result<()> { Ok(()) }
    pub fn update_media_session_state(&self, _: UpdateMediaSessionStateRequest) -> Result<()> { Ok(()) }
    pub fn update_media_session_metadata(&self, _: UpdateMediaSessionMetadataRequest) -> Result<()> { Ok(()) }
}

struct SpeechEngine {
    voice: ISpVoice,
    voices: Vec<(TTSVoice, ISpObjectToken)>,
    active: Option<String>,
    paused: bool,
    pitch: f32,
    emit: Box<dyn Fn(SpeechEvent)>,
}

impl SpeechEngine {
    fn new(emit: Box<dyn Fn(SpeechEvent)>) -> windows::core::Result<Self> {
        unsafe {
            let voice: ISpVoice = CoCreateInstance(&SpVoice, None, CLSCTX_ALL)?;
            let category: ISpObjectTokenCategory = CoCreateInstance(&SpObjectTokenCategory, None, CLSCTX_ALL)?;
            category.SetId(SPCAT_VOICES, false)?;
            let tokens = category.EnumTokens(PCWSTR::null(), PCWSTR::null())?;
            let mut count = 0;
            tokens.GetCount(&mut count)?;
            let mut voices = Vec::new();
            for index in 0..count {
                let token = tokens.Item(index)?;
                let id = take_string(token.GetId()?);
                let name = take_string(token.GetStringValue(PCWSTR::null())?);
                let attributes = token.OpenKey(w!("Attributes"))?;
                let languages = take_string(attributes.GetStringValue(w!("Language"))?);
                let lcid = u32::from_str_radix(languages.split(';').next().unwrap_or("409"), 16).unwrap_or(0x409);
                let mut locale = [0u16; 85];
                let length = LCIDToLocaleName(lcid, Some(&mut locale), 0);
                if length <= 1 { continue; }
                let lang = String::from_utf16_lossy(&locale[..length as usize - 1]);
                voices.push((TTSVoice { id, name, lang, disabled: false }, token));
            }
            Ok(Self { voice, voices, active: None, paused: false, pitch: 1.0, emit })
        }
    }

    fn finish(&mut self, code: &str, message: Option<String>) {
        if let Some(utterance_id) = self.active.take() {
            (self.emit)(SpeechEvent { utterance_id, code: code.into(), message });
        }
    }

    fn stop(&mut self) -> windows::core::Result<()> {
        unsafe {
            self.voice.Speak(PCWSTR::null(), (SPF_ASYNC.0 | SPF_PURGEBEFORESPEAK.0) as u32, None)?;
            if self.paused { self.voice.Resume()?; self.paused = false; }
        }
        self.finish("end", None);
        Ok(())
    }

    fn speak(&mut self, args: SpeakArgs) -> windows::core::Result<SpeakResponse> {
        self.stop()?;
        // The client registers this ID before invoking, so completion cannot race registration.
        let id = args.utterance_id.ok_or_else(|| windows::core::Error::new(
            windows::Win32::Foundation::E_INVALIDARG, "An utterance ID is required"))?;
        self.active = Some(id.clone());
        if args.preload || args.text.trim().is_empty() { self.finish("end", None); }
        else {
            let pitch = (self.pitch.log2() * 12.0).round().clamp(-10.0, 10.0) as i32;
            let xml = HSTRING::from(format!("<pitch absmiddle=\"{pitch}\">{}</pitch>", escape_text(&args.text)));
            if let Err(error) = unsafe { self.voice.Speak(&xml, (SPF_ASYNC.0 | SPF_IS_XML.0) as u32, None) } {
                self.finish("error", Some(error.to_string()));
                return Err(error);
            }
        }
        Ok(SpeakResponse { utterance_id: id })
    }

    fn poll(&mut self) {
        if self.active.is_none() || self.paused { return; }
        let mut status = SPVOICESTATUS::default();
        match unsafe { self.voice.GetStatus(&mut status, std::ptr::null_mut()) } {
            Err(error) => self.finish("error", Some(error.to_string())),
            Ok(()) if status.hrLastResult.is_err() => self.finish("error", Some(status.hrLastResult.to_string())),
            Ok(()) if status.dwRunningState == SPRS_DONE.0 as u32 => self.finish("end", None),
            _ => {},
        }
    }
}

fn escape_text(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

unsafe fn take_string(value: PWSTR) -> String {
    let text = value.to_string().unwrap_or_default();
    CoTaskMemFree(Some(value.0.cast()));
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn treats_book_xml_as_spoken_text() {
        assert_eq!(escape_text("<silence msec='9999'/> & 中文"), "&lt;silence msec='9999'/&gt; &amp; 中文");
    }

    #[test]
    #[ignore = "plays audio through installed Windows voices"]
    fn speaks_installed_chinese_and_japanese_voices() {
        use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
        use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap(); }
        {
            let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).unwrap() };
            let output = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eConsole).unwrap() };
            let meter: IAudioMeterInformation = unsafe { output.Activate(CLSCTX_ALL, None).unwrap() };
            let volume: IAudioEndpointVolume = unsafe { output.Activate(CLSCTX_ALL, None).unwrap() };
            println!("Output muted: {}, volume: {}", unsafe { volume.GetMute().unwrap().as_bool() }, unsafe { volume.GetMasterVolumeLevelScalar().unwrap() });
            let (sender, receiver) = mpsc::channel();
            let mut engine = SpeechEngine::new(Box::new(move |event| { sender.send(event).unwrap(); })).unwrap();
            for (language, text) in [("zh", "你好，这是中文语音测试。"), ("ja", "こんにちは。日本語の音声テストです。") ] {
                let (voice, token) = engine.voices.iter().find(|(voice, _)| voice.lang.starts_with(language)).unwrap();
                println!("Testing {} ({})", voice.name, voice.lang);
                unsafe { engine.voice.SetVoice(token).unwrap(); }
                engine.speak(SpeakArgs { text: text.into(), utterance_id: Some(language.into()), preload: false }).unwrap();
                let deadline = std::time::Instant::now() + Duration::from_secs(20);
                let mut peak = 0.0f32;
                loop {
                    peak = peak.max(unsafe { meter.GetPeakValue().unwrap() });
                    engine.poll();
                    if let Ok(event) = receiver.try_recv() {
                        assert_eq!(event.utterance_id, language);
                        assert_eq!(event.code, "end", "{:?}", event.message);
                        println!("{language} output peak: {peak}");
                        assert!(peak > 0.0001, "No audio reached the default output");
                        break;
                    }
                    assert!(std::time::Instant::now() < deadline, "speech timed out");
                    thread::sleep(Duration::from_millis(30));
                }
            }
            engine.speak(SpeakArgs { text: "测试暂停、继续和停止。".repeat(5), utterance_id: Some("controls".into()), preload: false }).unwrap();
            unsafe { engine.voice.Pause().unwrap(); }
            engine.paused = true;
            thread::sleep(Duration::from_millis(250));
            engine.poll();
            assert!(engine.active.is_some());
            assert!(receiver.try_recv().is_err());
            unsafe { engine.voice.Resume().unwrap(); }
            engine.paused = false;
            engine.stop().unwrap();
            assert_eq!(receiver.recv_timeout(Duration::from_secs(1)).unwrap().code, "end");
            assert!(engine.active.is_none());
        }
        unsafe { CoUninitialize(); }
    }
}
