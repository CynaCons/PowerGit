#!/usr/bin/env node
// Assembles the Tauri updater manifest (latest.json) for one release from
// the signature files the build jobs produced (v0.14.0). The app checks
// https://github.com/CynaCons/PowerGit/releases/latest/download/latest.json
// and verifies each artifact's minisign signature against the public key in
// frontend/src-tauri/tauri.conf.json before installing.
//
//   node scripts/build-updater-manifest.mjs --tag v0.14.0 \
//     --linux-sig PowerGit_0.14.0_amd64.AppImage.sig \
//     --windows-sig PowerGit_0.14.0_x64-setup.exe.sig \
//     --out latest.json
//
// Version comes from frontend/package.json (the one source, see
// scripts/check-version.mjs); the tag must match it. Either platform may be
// omitted (the manifest then simply has no entry for it), but a signature
// file that is present must hold a minisign signature.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};

const root = resolve(
    new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);
const version = JSON.parse(
    readFileSync(resolve(root, "frontend/package.json"), "utf8"),
).version;
const tag = opt("--tag") ?? `v${version}`;
if (tag !== `v${version}`) {
    console.error(
        `tag ${tag} does not match frontend/package.json version ${version}`,
    );
    process.exit(1);
}
const repo = opt("--repo") ?? "CynaCons/PowerGit";
const base = `https://github.com/${repo}/releases/download/${tag}`;

function signature(path) {
    const text = readFileSync(path, "utf8").trim();
    // A minisign signature file: "untrusted comment: ..." then a base64 line
    // (tauri signer writes the whole file base64-encoded; both are accepted by
    // the updater, but it must not be empty or an error page).
    if (!text || /<html/i.test(text))
        throw new Error(`${path} is not a signature`);
    return text;
}

const platforms = {};
const linux = opt("--linux-sig");
if (linux) {
    platforms["linux-x86_64"] = {
        signature: signature(linux),
        url: `${base}/PowerGit_${version}_amd64.AppImage`,
    };
}
const windows = opt("--windows-sig");
if (windows) {
    platforms["windows-x86_64"] = {
        signature: signature(windows),
        url: `${base}/PowerGit_${version}_x64-setup.exe`,
    };
}
if (Object.keys(platforms).length === 0) {
    console.error("no --linux-sig or --windows-sig given");
    process.exit(1);
}

const manifest = {
    version,
    notes: `PowerGit ${tag}. Release notes: https://github.com/${repo}/releases/tag/${tag}`,
    pub_date: new Date().toISOString(),
    platforms,
};
const out = opt("--out") ?? "latest.json";
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log(
    `${out}: ${version}, platforms ${Object.keys(platforms).join(", ")}`,
);
