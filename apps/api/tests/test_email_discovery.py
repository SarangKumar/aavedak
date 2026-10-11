"""Tests for published-email extraction from job postings.

Discovery only ever captures emails that are actually printed in a posting; it never
guesses or infers an address (see DISCOVERY.md: "Never invent jobs, emails, or
verification"). These tests pin that behaviour.
"""

from app.discovery.jobs.email_extractor import (
    best_application_email,
    extract_emails,
    is_application_inbox,
)
from app.discovery.people.discover import _choose


class TestEmailExtractor:
    """Tests for email extraction from job descriptions."""

    def test_extract_single_email(self) -> None:
        text = "Contact us at jobs@company.com for more information."
        result = extract_emails(text)

        assert len(result) == 1
        assert result[0].email == "jobs@company.com"
        assert result[0].confidence == "high"

    def test_extract_multiple_emails(self) -> None:
        text = "Contact hr@company.com or recruit@company.com"
        result = extract_emails(text)

        assert len(result) == 2
        assert result[0].confidence == "medium"
        assert {e.email for e in result} == {"hr@company.com", "recruit@company.com"}

    def test_deduplicate_emails(self) -> None:
        text = "Email us at contact@startup.io. Yes, contact@startup.io is the address."
        result = extract_emails(text)

        assert len(result) == 1
        assert result[0].email == "contact@startup.io"

    def test_normalize_to_lowercase(self) -> None:
        text = "Contact HR@Acme.COM or Jobs@COMPANY.COM"
        result = extract_emails(text)

        assert all(e.email == e.email.lower() for e in result)

    def test_filter_noreply_addresses(self) -> None:
        text = "noreply@company.com, no-reply@company.com, contact@company.com"
        result = extract_emails(text)

        assert len(result) == 1
        assert result[0].email == "contact@company.com"

    def test_filter_invalid_domains(self) -> None:
        text = "test@example.com, real@company.com, admin@test.org, support@real.co.uk"
        result = extract_emails(text)

        assert len(result) == 2
        assert {e.email for e in result} == {"real@company.com", "support@real.co.uk"}

    def test_empty_input(self) -> None:
        assert extract_emails(None) == []
        assert extract_emails("") == []
        assert extract_emails("No email here") == []

    def test_malformed_emails_ignored(self) -> None:
        text = "Valid: contact@company.com. Invalid: @company.com, contact@, @.com"
        result = extract_emails(text)

        assert len(result) == 1
        assert result[0].email == "contact@company.com"

    def test_emails_with_dots_and_underscores(self) -> None:
        text = "john.doe@company.com and jane_smith@company.co.uk"
        result = extract_emails(text)

        assert len(result) == 2
        assert {e.email for e in result} == {"john.doe@company.com", "jane_smith@company.co.uk"}


class TestBestApplicationEmail:
    """Tests for choosing a single application contact from a posting."""

    def test_none_when_no_email(self) -> None:
        assert best_application_email(None) is None
        assert best_application_email("Apply on our site.") is None

    def test_single_email_is_used(self) -> None:
        assert best_application_email("Send your CV to hello@startup.io") == "hello@startup.io"

    def test_prefers_application_inbox_among_many(self) -> None:
        text = "Questions to anita@company.com; apply via careers@company.com."
        assert best_application_email(text) == "careers@company.com"

    def test_recognises_dotted_application_local(self) -> None:
        text = "Reach anita@company.com or jobs.india@company.com to apply."
        assert best_application_email(text) == "jobs.india@company.com"

    def test_none_when_ambiguous(self) -> None:
        # Two personal-looking addresses, no recruiting marker → don't pick arbitrarily.
        text = "Reach out to anita@company.com or ravi@company.com with questions."
        assert best_application_email(text) is None

    def test_skips_noreply_then_uses_real(self) -> None:
        text = "noreply@company.com sent this. Apply: careers@company.com"
        assert best_application_email(text) == "careers@company.com"


class TestIsApplicationInbox:
    def test_recognises_recruiting_inboxes(self) -> None:
        for email in ("careers@acme.com", "jobs@acme.com", "hr@acme.com", "talent.india@acme.com"):
            assert is_application_inbox(email)

    def test_rejects_personal_mailboxes(self) -> None:
        for email in ("anita@acme.com", "r.sharma@acme.com", "hello@acme.com"):
            assert not is_application_inbox(email)


class TestPeopleDiscoveryChoose:
    """`_choose` keeps only a published recruiting inbox and never a personal address."""

    def test_prefers_application_inbox(self) -> None:
        got = _choose(
            [
                ("anita@acme.com", "job_posting", None),
                ("careers@acme.com", "career_page", "https://acme.com/careers"),
            ]
        )
        assert got == ("careers@acme.com", "career_page", "https://acme.com/careers")

    def test_none_when_only_personal(self) -> None:
        assert _choose([("anita@acme.com", "job_posting", None)]) is None

    def test_none_when_empty(self) -> None:
        assert _choose([]) is None

    def test_dedupes_and_keeps_first_inbox(self) -> None:
        got = _choose(
            [
                ("jobs@acme.com", "job_posting", None),
                ("JOBS@acme.com", "career_page", "https://acme.com/careers"),
            ]
        )
        assert got == ("jobs@acme.com", "job_posting", None)
