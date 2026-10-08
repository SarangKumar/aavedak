"""Normalized skill taxonomy with safe aliases and anti-confusion pairs."""

from __future__ import annotations

# canonical_id -> display + aliases (lowercase)
SKILL_ALIASES: dict[str, tuple[str, tuple[str, ...]]] = {
    "react": ("React", ("react", "react.js", "reactjs", "react js")),
    "nextjs": ("Next.js", ("next.js", "nextjs", "next js")),
    "typescript": ("TypeScript", ("typescript", "ts")),
    "javascript": ("JavaScript", ("javascript", "js", "ecmascript")),
    "nodejs": ("Node.js", ("node.js", "nodejs", "node js", "node")),
    "express": ("Express.js", ("express", "express.js", "expressjs")),
    "python": ("Python", ("python", "py")),
    "fastapi": ("FastAPI", ("fastapi", "fast api")),
    "django": ("Django", ("django",)),
    "flask": ("Flask", ("flask",)),
    "java": ("Java", ("java",)),
    "spring": ("Spring Boot", ("spring boot", "springboot", "spring")),
    "csharp": ("C#", ("c#", "csharp", "c sharp")),
    "cplusplus": ("C++", ("c++", "cpp", "cplusplus")),
    "go": ("Go", ("golang", "go lang")),
    "rust": ("Rust", ("rust",)),
    "postgresql": ("PostgreSQL", ("postgresql", "postgres", "psql")),
    "mysql": ("MySQL", ("mysql",)),
    "mongodb": ("MongoDB", ("mongodb", "mongo")),
    "redis": ("Redis", ("redis",)),
    "sql": ("SQL", ("sql", "structured query language")),
    "aws": ("AWS", ("aws", "amazon web services")),
    "gcp": ("Google Cloud", ("gcp", "google cloud", "google cloud platform")),
    "azure": ("Azure", ("azure", "microsoft azure")),
    "docker": ("Docker", ("docker", "containers")),
    "kubernetes": ("Kubernetes", ("kubernetes", "k8s")),
    "terraform": ("Terraform", ("terraform",)),
    "linux": ("Linux", ("linux", "unix")),
    "git": ("Git", ("git", "github", "gitlab")),
    "ci_cd": ("CI/CD", ("ci/cd", "cicd", "continuous integration", "continuous delivery")),
    "rest": ("REST API", ("rest", "rest api", "restful", "rest apis")),
    "graphql": ("GraphQL", ("graphql",)),
    "kafka": ("Kafka", ("kafka", "apache kafka")),
    "elasticsearch": ("Elasticsearch", ("elasticsearch", "elastic search")),
    "html": ("HTML", ("html", "html5")),
    "css": ("CSS", ("css", "css3")),
    "tailwind": ("Tailwind CSS", ("tailwind", "tailwindcss", "tailwind css")),
    "redux": ("Redux", ("redux",)),
    "vue": ("Vue.js", ("vue", "vue.js", "vuejs")),
    "angular": ("Angular", ("angular", "angularjs")),
    "figma": ("Figma", ("figma",)),
    "machine_learning": ("Machine Learning", ("machine learning", "ml")),
    "pytorch": ("PyTorch", ("pytorch", "torch")),
    "tensorflow": ("TensorFlow", ("tensorflow", "tf")),
}

# Pairs that must NEVER be treated as the same (canonical ids)
ANTI_CONFUSION: set[frozenset[str]] = {
    frozenset({"java", "javascript"}),
    frozenset({"cplusplus", "csharp"}),
    frozenset({"aws", "azure"}),
    frozenset({"aws", "gcp"}),
    frozenset({"azure", "gcp"}),
    frozenset({"postgresql", "mysql"}),
    frozenset({"react", "angular"}),
    frozenset({"react", "vue"}),
    frozenset({"docker", "kubernetes"}),
}

# Related (partial credit) — not exact
RELATED: dict[str, tuple[str, ...]] = {
    "nodejs": ("express",),
    "express": ("nodejs",),
    "react": ("nextjs", "redux"),
    "nextjs": ("react",),
    "postgresql": ("sql",),
    "mysql": ("sql",),
    "sql": ("postgresql", "mysql"),
    "docker": ("kubernetes", "ci_cd"),
    "kubernetes": ("docker",),
    "aws": ("terraform", "docker"),
    "python": ("fastapi", "django", "flask"),
    "fastapi": ("python",),
}

# Role title -> core / common / optional / specialized skill ids
ROLE_PROFILES: dict[str, dict[str, tuple[str, ...]]] = {
    "software engineer": {
        "core": ("javascript", "typescript", "git", "sql"),
        "common": ("react", "nodejs", "python", "rest", "ci_cd"),
        "optional": ("docker", "aws", "graphql"),
        "specialized": ("kubernetes", "kafka"),
    },
    "frontend engineer": {
        "core": ("javascript", "typescript", "react", "html", "css"),
        "common": ("nextjs", "redux", "tailwind", "git"),
        "optional": ("graphql", "figma"),
        "specialized": ("vue", "angular"),
    },
    "backend engineer": {
        "core": ("nodejs", "python", "sql", "rest", "git"),
        "common": ("postgresql", "docker", "ci_cd", "fastapi"),
        "optional": ("redis", "kafka", "graphql"),
        "specialized": ("kubernetes", "aws"),
    },
    "full stack": {
        "core": ("javascript", "typescript", "react", "nodejs", "sql"),
        "common": ("nextjs", "postgresql", "rest", "git"),
        "optional": ("docker", "aws", "ci_cd"),
        "specialized": ("kubernetes",),
    },
    "cloud engineer": {
        "core": ("aws", "linux", "docker", "ci_cd", "terraform"),
        "common": ("kubernetes", "python", "git", "rest"),
        "optional": ("gcp", "azure", "redis"),
        "specialized": ("kafka", "elasticsearch"),
    },
    "data engineer": {
        "core": ("python", "sql", "postgresql"),
        "common": ("aws", "kafka", "docker", "git"),
        "optional": ("redis", "elasticsearch"),
        "specialized": ("machine_learning",),
    },
    "product designer": {
        "core": ("figma",),
        "common": ("html", "css"),
        "optional": ("react",),
        "specialized": (),
    },
}


def _alias_lookup() -> dict[str, str]:
    table: dict[str, str] = {}
    for canonical, (_display, aliases) in SKILL_ALIASES.items():
        for alias in aliases:
            table[alias.lower()] = canonical
        table[canonical] = canonical
    return table


ALIAS_TO_CANONICAL = _alias_lookup()


def display_name(canonical: str) -> str:
    entry = SKILL_ALIASES.get(canonical)
    return entry[0] if entry else canonical


def normalize_skill(text: str) -> str | None:
    raw = (text or "").strip().lower()
    if not raw:
        return None
    if raw in ALIAS_TO_CANONICAL:
        return ALIAS_TO_CANONICAL[raw]
    # try without punctuation
    cleaned = raw.replace(".", "").replace("-", " ").strip()
    if cleaned in ALIAS_TO_CANONICAL:
        return ALIAS_TO_CANONICAL[cleaned]
    return None


def are_confused(a: str, b: str) -> bool:
    return frozenset({a, b}) in ANTI_CONFUSION


def related_skills(canonical: str) -> tuple[str, ...]:
    return RELATED.get(canonical, ())


def infer_role_key(title: str) -> str | None:
    t = (title or "").lower()
    if not t:
        return None
    # order matters — more specific first
    keys = sorted(ROLE_PROFILES.keys(), key=len, reverse=True)
    for key in keys:
        if key in t:
            return key
    if "sde" in t or "software" in t or "developer" in t or "engineer" in t:
        if "front" in t:
            return "frontend engineer"
        if "back" in t:
            return "backend engineer"
        if "cloud" in t or "devops" in t or "sre" in t:
            return "cloud engineer"
        if "full" in t:
            return "full stack"
        if "data" in t:
            return "data engineer"
        if "design" in t or "ux" in t or "ui" in t:
            return "product designer"
        return "software engineer"
    if "design" in t:
        return "product designer"
    return None


def role_skill_buckets(title: str) -> dict[str, list[str]]:
    key = infer_role_key(title)
    if not key:
        return {"core": [], "common": [], "optional": [], "specialized": []}
    profile = ROLE_PROFILES[key]
    return {k: list(v) for k, v in profile.items()}
