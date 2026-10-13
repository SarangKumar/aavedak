"""Read a job from a page's HTML when it has no JobPosting JSON-LD.

Uses the stdlib HTML parser (no scripts run, nothing evaluated) to build a small tree,
then tries, in order:

1. SAP SuccessFactors career sites (`careers.<company>.com/job/<title>/<id>-en_US`):
   `[data-careersite-propertyid=title|location|description|date|company]`, the
   `itemprop` microdata SuccessFactors renders, and `.jobdescription`.
2. schema.org microdata anywhere (`itemprop=title|description|jobLocation|datePosted`).
3. Generic: `og:title` / `og:description` / meta description / `<title>`, the first `<h1>`,
   and the largest block of text on the page.

Fields a page does not give stay empty; nothing is invented.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from html.parser import HTMLParser

from app.discovery.jobs.text import MAX_DESCRIPTION_CHARS, clean_line

_VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
    "source", "track", "wbr",
}
_SKIP = {"script", "style", "noscript", "template", "svg", "iframe"}
_BLOCK = {
    "p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "tr", "section",
    "article", "table", "header", "footer", "blockquote",
}
# Containers whose text is site chrome, not the posting.
_CHROME = {"nav", "header", "footer", "aside", "form", "button", "select"}


@dataclass
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list["Node | str"] = field(default_factory=list)
    parent: "Node | None" = None

    def attr(self, name: str) -> str:
        return self.attrs.get(name, "") or ""

    def classes(self) -> set[str]:
        return set(self.attr("class").lower().split())

    def iter(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.iter()

    def find_all(self, pred) -> list["Node"]:
        return [n for n in self.iter() if pred(n)]

    def find(self, pred) -> "Node | None":
        for n in self.iter():
            if pred(n):
                return n
        return None

    def text(self) -> str:
        """Readable text with paragraph and bullet structure kept."""
        out: list[str] = []

        def walk(node: Node) -> None:
            if node.tag == "li":
                out.append("\n• ")
            elif node.tag in _BLOCK:
                out.append("\n")
            for child in node.children:
                if isinstance(child, str):
                    out.append(child)
                else:
                    walk(child)
            if node.tag in _BLOCK and node.tag != "li":
                out.append("\n")

        walk(self)
        lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in "".join(out).splitlines()]
        text = re.sub(r"\n\s*\n\s*\n+", "\n\n", "\n".join(lines)).strip()
        text = re.sub(r"\n(• )\n", r"\n\1", text)
        return text[:MAX_DESCRIPTION_CHARS]

    def line(self) -> str:
        return clean_line(self.text().replace("\n", " "))


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.cur = self.root
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if self.skip_depth:
            if tag in _SKIP:
                self.skip_depth += 1
            return
        if tag in _SKIP:
            self.skip_depth = 1
            return
        node = Node(tag, {k.lower(): (v or "") for k, v in attrs}, parent=self.cur)
        self.cur.children.append(node)
        if tag not in _VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        if self.skip_depth:
            return
        self.cur.children.append(
            Node(tag.lower(), {k.lower(): (v or "") for k, v in attrs}, parent=self.cur)
        )

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.skip_depth:
            if tag in _SKIP:
                self.skip_depth -= 1
            return
        node = self.cur
        while node is not None and node.tag != tag:
            node = node.parent
        if node is not None and node.parent is not None:
            self.cur = node.parent

    def handle_data(self, data):
        if not self.skip_depth and data:
            self.cur.children.append(data)


def parse_tree(html: str) -> Node:
    builder = _TreeBuilder()
    try:
        builder.feed(html or "")
        builder.close()
    except Exception:  # malformed markup: keep what was parsed
        pass
    return builder.root


@dataclass
class PageJob:
    title: str = ""
    company: str = ""
    location: str = ""
    description: str = ""
    posted: str = ""
    method: str = ""

    def has_content(self) -> bool:
        return bool(self.title and (self.description or self.location))


def _meta(root: Node, *names: str) -> str:
    for name in names:
        node = root.find(
            lambda n, name=name: n.tag == "meta"
            and (n.attr("property").lower() == name or n.attr("name").lower() == name)
        )
        if node and clean_line(node.attr("content")):
            return clean_line(node.attr("content"))
    return ""


def _title_tag(root: Node) -> tuple[str, str]:
    """`<title>` split into (job title, site name): "Engineer Job Details | HCLTech"."""
    node = root.find(lambda n: n.tag == "title")
    raw = node.line() if node else ""
    if not raw:
        return "", ""
    parts = re.split(r"\s+[|–—-]\s+", raw)
    title = re.sub(r"\s+(job details|job|careers?)$", "", parts[0], flags=re.I).strip()
    site = parts[-1].strip() if len(parts) > 1 else ""
    return title, site


def _by_prop(root: Node, attr: str, *values: str) -> Node | None:
    wanted = {v.lower() for v in values}
    return root.find(lambda n: n.attr(attr).lower() in wanted)


def _value(node: Node | None) -> str:
    if node is None:
        return ""
    if node.tag == "meta":
        return clean_line(node.attr("content"))
    if node.attr("datetime"):
        return clean_line(node.attr("datetime"))
    return node.line()


def is_successfactors(url: str, html: str) -> bool:
    return bool(
        re.search(r"/job/[^/]+/\d+(?:-[a-z]{2}_[A-Z]{2})?/?(?:$|\?)", url)
        or "data-careersite-propertyid" in html
        or "sapsf" in html
        or "j2w." in html
    )


def _largest_block(root: Node) -> str:
    """Text of the element with the most direct paragraph-like text (outside site chrome)."""
    best, best_len = "", 0
    for node in root.iter():
        if node.tag not in {"div", "section", "article", "main", "td", "span"}:
            continue
        anc, chrome = node, False
        while anc is not None:
            if anc.tag in _CHROME or {"nav", "navbar", "footer", "header", "menu", "cookie"} & anc.classes():
                chrome = True
                break
            anc = anc.parent
        if chrome:
            continue
        # Score by text that belongs to this node and its p/li/br children, not nested blocks.
        own = 0
        for child in node.children:
            if isinstance(child, str):
                own += len(child.strip())
            elif child.tag in {"p", "li", "ul", "ol", "strong", "b", "em", "br", "h2", "h3", "h4", "span", "a"}:
                own += len(child.line())
        if own > best_len:
            best, best_len = node.text(), own
    return best if best_len >= 200 else ""


def extract(html: str, url: str) -> PageJob:
    root = parse_tree(html)
    job = PageJob()
    sf = is_successfactors(url, html)

    # 1. SuccessFactors property markup + microdata (2.).
    prop = "data-careersite-propertyid"
    job.title = _value(_by_prop(root, prop, "title")) or _value(_by_prop(root, "itemprop", "title"))
    desc = (
        _by_prop(root, prop, "description")
        or _by_prop(root, "itemprop", "description")
        or root.find(lambda n: "jobdescription" in n.classes())
    )
    if desc is not None and desc.tag != "meta":
        job.description = desc.text()
    job.location = (
        _value(_by_prop(root, prop, "location", "city"))
        or _value(_by_prop(root, "itemprop", "joblocation", "address"))
    )
    job.posted = _value(_by_prop(root, prop, "date")) or _value(_by_prop(root, "itemprop", "dateposted"))
    org = _by_prop(root, "itemprop", "hiringorganization")
    job.company = _value(_by_prop(root, prop, "company")) or (
        _value(org.find(lambda n: n.attr("itemprop").lower() == "name")) if org else ""
    )
    if job.title:
        job.method = "successfactors" if sf else "microdata"

    # 3. Generic fallbacks, field by field.
    tag_title, site = _title_tag(root)
    if not job.title:
        h1 = root.find(lambda n: n.tag == "h1")
        job.title = _meta(root, "og:title", "twitter:title") or (h1.line() if h1 else "") or tag_title
        job.method = job.method or "generic"
    if not job.company:
        job.company = _meta(root, "og:site_name") or site
    if not job.description:
        block = _largest_block(root)
        meta_desc = _meta(root, "og:description", "description", "twitter:description")
        # A meta description equal to the title (SuccessFactors does this) says nothing.
        if meta_desc and meta_desc.lower() == job.title.lower():
            meta_desc = ""
        job.description = block or meta_desc
    return job
