"""Normalized skill taxonomy with safe aliases and anti-confusion pairs."""

from __future__ import annotations

# canonical_id -> display + aliases (lowercase)
SKILL_ALIASES: dict[str, tuple[str, tuple[str, ...]]] = {
    "react": ("React", ("react", "react.js", "reactjs", "react js")),
    "nextjs": ("Next.js", ("next.js", "nextjs", "next js")),
    # Prefer unambiguous aliases — short forms like "go"/"node"/"js"/"ts"/"py"/"ml"/"tf"
    # false-positive on normal English and inflate skill coverage.
    "typescript": ("TypeScript", ("typescript",)),
    "javascript": ("JavaScript", ("javascript", "ecmascript")),
    "nodejs": ("Node.js", ("node.js", "nodejs", "node js")),
    "express": ("Express.js", ("express", "express.js", "expressjs")),
    "python": ("Python", ("python",)),
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
    "rest": ("REST API", ("rest api", "restful", "rest apis", "rest")),
    "graphql": ("GraphQL", ("graphql",)),
    "kafka": ("Kafka", ("kafka", "apache kafka")),
    "elasticsearch": ("Elasticsearch", ("elasticsearch", "elastic search")),
    "spark": ("Apache Spark", ("spark", "apache spark", "pyspark", "py spark")),
    "airflow": ("Apache Airflow", ("airflow", "apache airflow")),
    "snowflake": ("Snowflake", ("snowflake",)),
    "bigquery": ("BigQuery", ("bigquery", "big query")),
    "dbt": ("dbt", ("dbt", "data build tool")),
    "iceberg": ("Apache Iceberg", ("iceberg", "apache iceberg")),
    "delta_lake": ("Delta Lake", ("delta lake", "deltalake")),
    "duckdb": ("DuckDB", ("duckdb", "duck db")),
    "trino": ("Trino", ("trino", "presto")),
    "databricks": ("Databricks", ("databricks",)),
    "etl": ("ETL", ("etl", "elt", "data pipeline", "data pipelines")),
    "html": ("HTML", ("html", "html5")),
    "css": ("CSS", ("css", "css3")),
    "tailwind": ("Tailwind CSS", ("tailwind", "tailwindcss", "tailwind css")),
    "redux": ("Redux", ("redux",)),
    "vue": ("Vue.js", ("vue", "vue.js", "vuejs")),
    "angular": ("Angular", ("angular", "angularjs")),
    "figma": ("Figma", ("figma",)),
    "machine_learning": ("Machine Learning", ("machine learning",)),
    "pytorch": ("PyTorch", ("pytorch", "torch")),
    "tensorflow": ("TensorFlow", ("tensorflow",)),
    # ── ML / GenAI / data (job descriptions in these fields list many more skills than web roles) ──
    "deep_learning": ("Deep Learning", ("deep learning",)),
    "nlp": ("NLP", ("nlp", "natural language processing")),
    "computer_vision": ("Computer Vision", ("computer vision", "opencv")),
    "llm": ("LLMs", ("llm", "llms", "large language model", "large language models")),
    "generative_ai": ("Generative AI", ("generative ai", "genai", "gen ai", "gen-ai")),
    "rag": ("RAG", ("rag", "retrieval augmented generation", "retrieval-augmented generation")),
    "prompt_engineering": ("Prompt Engineering", ("prompt engineering", "prompt design", "prompting")),
    "fine_tuning": ("Fine-tuning", ("fine-tuning", "fine tuning", "finetuning", "fine-tune")),
    "embeddings": ("Embeddings", ("embeddings", "vector embeddings", "embedding models")),
    "vector_db": ("Vector Databases", ("vector database", "vector databases", "vector store", "pinecone", "faiss", "chromadb", "weaviate", "qdrant")),
    "langchain": ("LangChain", ("langchain", "langgraph", "llamaindex", "llama index")),
    "openai": ("OpenAI API", ("openai", "gpt-4", "gpt-3", "chatgpt")),
    "huggingface": ("Hugging Face", ("hugging face", "huggingface")),
    "ai_agents": ("AI Agents", ("ai agents", "agentic", "multi-agent", "llm agents")),
    "scikit_learn": ("scikit-learn", ("scikit-learn", "scikit learn", "sklearn")),
    "pandas": ("pandas", ("pandas",)),
    "numpy": ("NumPy", ("numpy",)),
    "xgboost": ("XGBoost", ("xgboost", "lightgbm", "gradient boosting")),
    "reinforcement_learning": ("Reinforcement Learning", ("reinforcement learning",)),
    "feature_engineering": ("Feature Engineering", ("feature engineering",)),
    "data_preprocessing": ("Data Preprocessing", ("data preprocessing", "data pre-processing", "data cleaning", "data wrangling", "data preparation")),
    "data_retrieval": ("Data Retrieval", ("data retrieval", "information retrieval")),
    "data_analysis": ("Data Analysis", ("data analysis", "data analytics", "exploratory data analysis")),
    "data_visualization": ("Data Visualization", ("data visualization", "data visualisation", "matplotlib", "seaborn")),
    "statistics": ("Statistics", ("statistics", "statistical modeling", "statistical analysis", "hypothesis testing")),
    "mlops": ("MLOps", ("mlops", "ml ops", "mlflow", "kubeflow", "model deployment", "model serving")),
    "model_evaluation": ("Model Evaluation", ("model evaluation", "model validation")),
    "tableau": ("Tableau", ("tableau",)),
    "power_bi": ("Power BI", ("power bi", "powerbi")),
    "jupyter": ("Jupyter", ("jupyter", "jupyter notebook", "jupyter notebooks")),
    # ── General engineering practice and tooling ──
    "software_development": ("Software Development", ("software development", "software engineering")),
    "data_structures": ("Data Structures", ("data structures",)),
    "algorithms": ("Algorithms", ("algorithms",)),
    "oop": ("OOP", ("object-oriented", "object oriented", "oop")),
    "system_design": ("System Design", ("system design", "distributed systems")),
    "microservices": ("Microservices", ("microservices", "microservice")),
    "api_development": ("API Development", ("api development", "api design", "apis")),
    "unit_testing": ("Unit Testing", ("unit testing", "unit tests", "test-driven development", "tdd")),
    "pytest": ("pytest", ("pytest",)),
    "jest": ("Jest", ("jest",)),
    "agile": ("Agile", ("agile", "scrum", "kanban")),
    "jira": ("Jira", ("jira",)),
    "jenkins": ("Jenkins", ("jenkins",)),
    "github_actions": ("GitHub Actions", ("github actions",)),
    "ansible": ("Ansible", ("ansible",)),
    "prometheus": ("Prometheus", ("prometheus", "grafana")),
    "nginx": ("Nginx", ("nginx",)),
    "rabbitmq": ("RabbitMQ", ("rabbitmq",)),
    "celery": ("Celery", ("celery",)),
    "grpc": ("gRPC", ("grpc",)),
    "websockets": ("WebSockets", ("websocket", "websockets")),
    "serverless": ("Serverless", ("serverless", "aws lambda")),
    "bash": ("Bash", ("bash", "shell scripting")),
    "dynamodb": ("DynamoDB", ("dynamodb",)),
    "cassandra": ("Cassandra", ("cassandra",)),
    "neo4j": ("Neo4j", ("neo4j", "graph database", "graph databases")),
    "firebase": ("Firebase", ("firebase",)),
    "sqlite": ("SQLite", ("sqlite",)),
    "scala": ("Scala", ("scala",)),
    "kotlin": ("Kotlin", ("kotlin",)),
    "swift": ("Swift", ("swift",)),
    "php": ("PHP", ("php", "laravel")),
    "ruby": ("Ruby", ("ruby on rails", "ruby")),
    "react_native": ("React Native", ("react native",)),
    "flutter": ("Flutter", ("flutter", "dart")),
    "android": ("Android", ("android",)),
    "ios": ("iOS", ("ios development", "swiftui")),
    "webpack": ("Webpack", ("webpack", "vite")),
    "bootstrap": ("Bootstrap", ("bootstrap",)),
    "jquery": ("jQuery", ("jquery",)),
    "cybersecurity": ("Security", ("owasp", "penetration testing", "application security", "oauth", "jwt")),
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
    "python": ("fastapi", "django", "flask", "spark"),
    "fastapi": ("python",),
    "spark": ("python", "kafka", "airflow"),
    "airflow": ("python", "spark", "etl"),
    "snowflake": ("sql", "dbt", "bigquery"),
    "bigquery": ("sql", "gcp", "snowflake"),
    "dbt": ("sql", "snowflake", "bigquery"),
    "iceberg": ("spark", "delta_lake"),
    "delta_lake": ("spark", "iceberg"),
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
        "core": ("python", "sql", "spark", "airflow"),
        "common": ("kafka", "snowflake", "aws", "dbt", "bigquery"),
        "optional": ("iceberg", "docker", "gcp", "duckdb", "etl"),
        "specialized": ("delta_lake", "trino", "databricks"),
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
    t = (title or "").lower().strip()
    if not t:
        return None
    # Common typos: "enginner" / "enginering"
    t = t.replace("enginner", "engineer").replace("enginering", "engineering")
    # order matters — more specific first
    keys = sorted(ROLE_PROFILES.keys(), key=len, reverse=True)
    for key in keys:
        if key in t:
            return key
    # Heuristics before generic "engineer"
    if "data" in t and ("engin" in t or "platform" in t or "pipeline" in t):
        return "data engineer"
    if "sde" in t or "software" in t or "developer" in t or "engineer" in t or "engin" in t:
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
