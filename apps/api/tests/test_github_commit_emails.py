from app.discovery.people.sources.github import pick_commit_email


def test_prefers_company_domain():
    authors = [("John Doe", "john@gmail.com"), ("John Doe", "john.doe@example.org")]
    assert pick_commit_email(authors, name="John Doe", domain="example.org") == "john.doe@example.org"


def test_skips_noreply_and_needs_name_match():
    authors = [("John Doe", "123+jd@users.noreply.github.com"), ("Someone Else", "else@gmail.com")]
    assert pick_commit_email(authors, name="John Doe", domain="example.org") is None
    authors.append(("john doe", "jd@gmail.com"))
    assert pick_commit_email(authors, name="John Doe", domain=None) == "jd@gmail.com"
