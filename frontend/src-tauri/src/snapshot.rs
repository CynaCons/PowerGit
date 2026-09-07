//! The diagnostic snapshot package (v0.14.1, owner: "an emergency button
//! ... dump all the information that we need in a file or package, and
//! I'll bring it back to you"). One zip in the log directory holding the
//! shell's own facts, both logs, whatever the webview handed over, and the
//! engine's answers. Pure builder here; lib.rs assembles the parts.

use std::io::{Cursor, Write};

use zip::write::SimpleFileOptions;
use zip::ZipWriter;

pub struct Part {
    pub name: String,
    pub bytes: Vec<u8>,
}

impl Part {
    pub fn text(name: &str, text: impl Into<String>) -> Part {
        Part {
            name: name.to_string(),
            bytes: text.into().into_bytes(),
        }
    }
}

/// A zip with one entry per part, deflated. Empty parts are kept (an empty
/// frontend.json says "the webview did not answer" more clearly than a
/// missing file).
pub fn build_zip(parts: &[Part]) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut zip = ZipWriter::new(&mut cursor);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for part in parts {
            zip.start_file(&part.name, options)
                .map_err(|e| format!("zip {}: {e}", part.name))?;
            zip.write_all(&part.bytes)
                .map_err(|e| format!("zip {}: {e}", part.name))?;
        }
        zip.finish().map_err(|e| format!("zip finish: {e}"))?;
    }
    Ok(cursor.into_inner())
}

/// `shell.txt`: the facts only the shell knows.
pub fn shell_facts(fields: &[(&str, String)]) -> String {
    let mut out = String::new();
    for (k, v) in fields {
        out.push_str(k);
        out.push_str(": ");
        out.push_str(v);
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn zip_holds_every_part_by_name() {
        let parts = [
            Part::text("shell.txt", "version: 1\n"),
            Part::text("frontend.json", ""),
            Part {
                name: "engine/health.json".into(),
                bytes: b"{\"status\":\"ok\"}".to_vec(),
            },
        ];
        let bytes = build_zip(&parts).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        assert_eq!(
            names,
            vec!["shell.txt", "frontend.json", "engine/health.json"]
        );
        let mut health = String::new();
        archive
            .by_name("engine/health.json")
            .unwrap()
            .read_to_string(&mut health)
            .unwrap();
        assert_eq!(health, "{\"status\":\"ok\"}");
    }

    #[test]
    fn shell_facts_are_one_per_line() {
        let s = shell_facts(&[("a", "1".into()), ("b", "two".into())]);
        assert_eq!(s, "a: 1\nb: two\n");
    }
}
