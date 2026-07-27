use anyhow::Result;

use super::super::selection::ClipboardFormat;

/// How the platform names the entries it hands back for one clipboard payload.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum FormatNaming {
    /// macOS: names must be uniform type identifiers to be written back.
    UniformTypeIdentifiers,
    /// X11 atoms and Wayland MIME types, which the platform takes back as-is.
    Opaque,
}

/// Only entries the platform will accept back on restore.
pub(super) fn restorable_formats(
    naming: FormatNaming,
    names: impl IntoIterator<Item = String>,
    read: impl Fn(&str) -> Result<Vec<u8>>,
) -> Vec<ClipboardFormat> {
    names
        .into_iter()
        .filter(|name| is_restorable(naming, name))
        .filter_map(|name| {
            let data = read(&name).ok()?;
            Some(ClipboardFormat { name, data })
        })
        .collect()
}

fn is_restorable(naming: FormatNaming, name: &str) -> bool {
    if naming == FormatNaming::Opaque {
        return !name.is_empty();
    }
    is_uniform_type_identifier(name)
}

/// AppKit also reports legacy names (`NSStringPboardType`); writing one back fails with "not a valid UTI string".
fn is_uniform_type_identifier(name: &str) -> bool {
    name.contains('.')
        && !name.starts_with('.')
        && !name.ends_with('.')
        && !name.contains(char::is_whitespace)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn reader(entries: &[(&str, &[u8])]) -> impl Fn(&str) -> Result<Vec<u8>> {
        let map: HashMap<String, Vec<u8>> = entries
            .iter()
            .map(|(name, data)| ((*name).to_string(), data.to_vec()))
            .collect();
        move |name: &str| {
            map.get(name)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("no data"))
        }
    }

    fn names(formats: &[ClipboardFormat]) -> Vec<&str> {
        formats.iter().map(|format| format.name.as_str()).collect()
    }

    #[test]
    fn legacy_appkit_names_never_reach_the_restore() {
        let read = reader(&[
            ("NSStringPboardType", b"selected text"),
            ("public.utf8-plain-text", b"selected text"),
        ]);

        let formats = restorable_formats(
            FormatNaming::UniformTypeIdentifiers,
            [
                "NSStringPboardType".to_string(),
                "public.utf8-plain-text".to_string(),
            ],
            read,
        );

        assert_eq!(names(&formats), ["public.utf8-plain-text"]);
    }

    #[test]
    fn carbon_flavor_names_never_reach_the_restore() {
        let read = reader(&[("CorePasteboardFlavorType 0x75726C20", b"url")]);

        let formats = restorable_formats(
            FormatNaming::UniformTypeIdentifiers,
            ["CorePasteboardFlavorType 0x75726C20".to_string()],
            read,
        );

        assert!(formats.is_empty());
    }

    #[test]
    fn modern_and_dynamic_identifiers_are_kept() {
        let kept = [
            "public.html",
            "com.apple.webarchive",
            "dyn.ah62d4rv4gu8yc6durvwwaznwmuuha2",
        ];
        let read = reader(&[
            ("public.html", b"<p>"),
            ("com.apple.webarchive", b"archive"),
            ("dyn.ah62d4rv4gu8yc6durvwwaznwmuuha2", b"custom"),
        ]);

        let formats = restorable_formats(
            FormatNaming::UniformTypeIdentifiers,
            kept.map(str::to_string),
            read,
        );

        assert_eq!(names(&formats), kept);
    }

    #[test]
    fn an_unreadable_entry_is_skipped_instead_of_losing_the_whole_clipboard() {
        let read = reader(&[("public.utf8-plain-text", b"selected text")]);

        let formats = restorable_formats(
            FormatNaming::UniformTypeIdentifiers,
            [
                "public.png".to_string(),
                "public.utf8-plain-text".to_string(),
            ],
            read,
        );

        assert_eq!(names(&formats), ["public.utf8-plain-text"]);
    }

    #[test]
    fn platforms_without_type_identifiers_keep_their_own_names() {
        let read = reader(&[
            ("UTF8_STRING", b"selected text"),
            ("TEXT", b"selected text"),
        ]);

        let formats = restorable_formats(
            FormatNaming::Opaque,
            ["UTF8_STRING".to_string(), "TEXT".to_string()],
            read,
        );

        assert_eq!(names(&formats), ["UTF8_STRING", "TEXT"]);
    }
}
