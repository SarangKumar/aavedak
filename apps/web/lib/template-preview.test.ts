import assert from "node:assert/strict";

import {
  mailPreviewVars,
  renderTemplateFinal,
  resolveTemplate,
  userTemplateVars,
} from "./template-preview";

const user = userTemplateVars({
  name: "Sarang Kumar",
  email: "s@example.com",
  links: { linkedin: "sarang" },
});
assert.equal(user.linkedin, "https://www.linkedin.com/in/sarang");

const vars = { ...user, company: "Stripe", role: "SDE", location: "", date: "13 October 2026" };
const r = resolveTemplate(
  "Dear {{hiring_manager}}, {{job_title}} at {{ company }} — {{from_email}} {{phone}}",
  vars,
);
assert.equal(r.text, "Dear {{hiring_manager}}, SDE at Stripe — s@example.com {{user_phone}}");
assert.deepEqual(r.missing, ["hiring_manager", "user_phone"]);
const final = renderTemplateFinal(
  "Dear {{hiring_manager}}, {{role}} at {{company}}. Call {{phone}}\nBye",
  vars,
);
assert.ok(!final.includes("{{"));
assert.equal(final, "Dear, SDE at Stripe. Call\nBye");

const mail = mailPreviewVars({ name: "Sarang Kumar", email: "s@example.com" });
assert.equal(mail.user_name, "Sarang Kumar");
assert.equal(mail.company, "Example Corp");
assert.equal(mail.person_name, "John Doe");
console.log("template-preview tests: ok");
