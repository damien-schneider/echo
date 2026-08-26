//! macOS serves the promise through `NSPasteboardItemDataProvider`: the pasteboard asks Echo for
//! the data the moment an app actually pastes. It never says which app asked.

use objc2::rc::Retained;
use objc2::runtime::{NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
use objc2_app_kit::{
    NSPasteboard, NSPasteboardItem, NSPasteboardItemDataProvider, NSPasteboardType,
    NSPasteboardTypeString,
};
use objc2_foundation::{NSArray, NSString};
use std::sync::Mutex;
use std::time::Instant;
use tokio::sync::oneshot;

use super::{Fetcher, Generation, PromisedTranscript, Receipt};

/// Asks conforming clipboard managers to skip this change, so their polling cannot fake a paste.
const TRANSIENT_TYPE: &str = "org.nspasteboard.TransientType";

struct PromiseState {
    text: String,
    consumed_tx: Mutex<Option<oneshot::Sender<Receipt>>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "EchoTranscriptPromise"]
    #[ivars = PromiseState]
    struct TranscriptPromise;

    unsafe impl NSObjectProtocol for TranscriptPromise {}

    unsafe impl NSPasteboardItemDataProvider for TranscriptPromise {
        #[unsafe(method(pasteboard:item:provideDataForType:))]
        fn provide_data(
            &self,
            _pasteboard: Option<&NSPasteboard>,
            item: &NSPasteboardItem,
            requested_type: &NSPasteboardType,
        ) {
            item.setString_forType(&NSString::from_str(&self.ivars().text), requested_type);
            let taken = self
                .ivars()
                .consumed_tx
                .lock()
                .ok()
                .and_then(|mut tx| tx.take());
            if let Some(tx) = taken {
                let _ = tx.send(Receipt {
                    at: Instant::now(),
                    by: Fetcher::Unknown,
                });
            }
        }
    }
);

impl TranscriptPromise {
    fn new(text: String, consumed_tx: oneshot::Sender<Receipt>) -> Retained<Self> {
        let this = Self::alloc().set_ivars(PromiseState {
            text,
            consumed_tx: Mutex::new(Some(consumed_tx)),
        });
        unsafe { msg_send![super(this), init] }
    }
}

pub(super) fn is_available() -> bool {
    true
}

pub(super) fn write_promised_transcript(text: &str) -> Result<PromisedTranscript, String> {
    write_promised_to(&NSPasteboard::generalPasteboard(), text)
}

fn write_promised_to(pasteboard: &NSPasteboard, text: &str) -> Result<PromisedTranscript, String> {
    let (consumed_tx, consumed) = oneshot::channel();
    let provider = TranscriptPromise::new(text.to_string(), consumed_tx);
    let item = NSPasteboardItem::new();
    let types = NSArray::from_slice(&[unsafe { NSPasteboardTypeString }]);
    if !item.setDataProvider_forTypes(ProtocolObject::from_ref(&*provider), &types) {
        return Err("Pasteboard refused the promised transcript".to_string());
    }
    item.setString_forType(&NSString::from_str(""), &NSString::from_str(TRANSIENT_TYPE));
    pasteboard.clearContents();
    if !pasteboard.writeObjects(&NSArray::from_slice(&[ProtocolObject::from_ref(&*item)])) {
        return Err("Pasteboard refused the transcript item".to_string());
    }
    Ok(PromisedTranscript {
        consumed,
        generation: revision_of(pasteboard),
    })
}

pub(super) fn generation() -> Generation {
    revision_of(&NSPasteboard::generalPasteboard())
}

fn revision_of(pasteboard: &NSPasteboard) -> Generation {
    Generation(u64::try_from(pasteboard.changeCount()).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::{write_promised_to, NSPasteboard, NSPasteboardTypeString, NSString};

    /// The whole design rests on this receipt: a read of the promised type must both deliver the
    /// text and fire the consumption signal — and silence must stay silent until then.
    #[test]
    fn a_pasteboard_read_delivers_the_text_and_fires_the_receipt() {
        let name = NSString::from_str("echo.tests.transcript-promise");
        let pasteboard = NSPasteboard::pasteboardWithName(&name);
        let mut promise = write_promised_to(&pasteboard, "spoken words").expect("promise written");

        assert!(
            promise.consumed.try_recv().is_err(),
            "no read yet, no receipt"
        );

        let delivered = pasteboard.stringForType(unsafe { NSPasteboardTypeString });
        assert_eq!(
            delivered.expect("promise resolves").to_string(),
            "spoken words"
        );
        assert!(
            promise.consumed.try_recv().is_ok(),
            "the read is the receipt"
        );
    }
}
