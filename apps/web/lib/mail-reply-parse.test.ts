/** Reply parsing checks (node:assert, same style as lib/ats-engines/run-tests.ts). */
import assert from "node:assert/strict";

import {
  bareAddress,
  decodeBase64Url,
  extractPlainText,
  headerValue,
  isAutomatedReply,
  trimQuotedReply,
} from "./mail-reply-parse";

function b64url(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// decode: unpadded base64url with non-ASCII text
assert.equal(decodeBase64Url(b64url("Hi — thanks!")), "Hi — thanks!");

// quoted history is dropped at the "On … wrote:" line
const reply = [
  "Sure, send me your resume.",
  "",
  "On Mon, 3 Mar 2026 at 10:00, Asha <asha@example.com> wrote:",
  "> Hi Asha, could you refer me?",
  "> Thanks",
].join("\n");
assert.equal(trimQuotedReply(reply), "Sure, send me your resume.");

// wrapped "On … wrote:" line
const wrapped =
  "Yes happy to.\n\nOn Mon, 3 Mar 2026 at 10:00,\nAsha <asha@example.com> wrote:\n> old";
assert.equal(trimQuotedReply(wrapped), "Yes happy to.");

// Outlook-style separator
assert.equal(trimQuotedReply("Done.\n-----Original Message-----\nFrom: x"), "Done.");

// From/Sent header block
assert.equal(
  trimQuotedReply("Interested.\nFrom: Asha <a@b.c>\nSent: Monday\nTo: me"),
  "Interested.",
);

// CRLF input and trailing spaces
assert.equal(trimQuotedReply("Line one  \r\nLine two\r\n"), "Line one  \nLine two");

// plain text is extracted from a multipart tree, snippet is the fallback
const payload = {
  mimeType: "multipart/alternative",
  parts: [
    { mimeType: "text/html", body: { data: b64url("<p>html</p>") } },
    { mimeType: "text/plain", body: { data: b64url("plain body") } },
  ],
};
assert.equal(extractPlainText(payload, "snip"), "plain body");
assert.equal(extractPlainText({ mimeType: "text/html", body: {} }, "snip"), "snip");

// headers and addresses
const withHeaders = { headers: [{ name: "From", value: "Asha <Asha@Example.com>" }] };
assert.equal(headerValue(withHeaders, "from"), "Asha <Asha@Example.com>");
assert.equal(bareAddress("Asha <Asha@Example.com>"), "asha@example.com");
assert.equal(bareAddress("asha@example.com"), "asha@example.com");

// automated replies never count as a human reply
const plain = { headers: [{ name: "From", value: "Asha <asha@example.com>" }] };
assert.equal(isAutomatedReply(plain, "asha@example.com", "Re: Referral for SDE I"), false);
assert.equal(
  isAutomatedReply(
    { headers: [{ name: "Auto-Submitted", value: "auto-replied" }] },
    "asha@example.com",
    "Re: Referral",
  ),
  true,
);
assert.equal(
  isAutomatedReply(
    { headers: [{ name: "Auto-Submitted", value: "no" }] },
    "asha@example.com",
    "Re: x",
  ),
  false,
);
assert.equal(
  isAutomatedReply(
    { headers: [{ name: "Precedence", value: "bulk" }] },
    "asha@example.com",
    "Re: x",
  ),
  true,
);
assert.equal(isAutomatedReply(plain, "asha@example.com", "Automatic reply: Referral"), true);
assert.equal(isAutomatedReply(plain, "asha@example.com", "Out of Office: back Monday"), true);
assert.equal(
  isAutomatedReply(plain, "mailer-daemon@googlemail.com", "Delivery Status Notification"),
  true,
);
assert.equal(isAutomatedReply(plain, "noreply@company.com", "Re: Referral"), true);

console.log("mail-reply-parse tests: ok");
