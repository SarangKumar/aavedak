"""Synthetic resume/JD pairs for calibration ordering checks."""

from __future__ import annotations

BACKEND_JD = """
Senior Backend Engineer
Requirements:
- Must have strong experience with Python and FastAPI
- Required: PostgreSQL, SQL, Docker
- Experience designing and building scalable backend APIs
- Deploy and monitor services in production
Preferred:
- Kubernetes, Kafka, AWS
Nice to have: Redis
"""

EXCELLENT_BE = """
Priya Sharma
priya@example.com | +1 555 0100 | linkedin.com/in/priya | github.com/priya

SUMMARY
Backend engineer with 5 years building production APIs.

EXPERIENCE
Senior Backend Engineer, Acme — Jan 2021 – Present
Designed and built scalable REST APIs in Python FastAPI serving 80k RPS.
Implemented PostgreSQL schemas and SQL query optimizations cutting p95 latency 40%.
Owned Docker-based deployments and production monitoring for customer-facing services.
Led migration of event pipelines using Kafka and Redis caching.

Backend Engineer, Beta — Mar 2018 – Dec 2020
Developed FastAPI microservices and PostgreSQL data models for billing.

EDUCATION
B.S. Computer Science

SKILLS
Python, FastAPI, PostgreSQL, SQL, Docker, Kubernetes, Kafka, Redis, AWS, Git
"""

STRONG_BE = """
Alex Chen
alex@example.com | +1 555 0101

EXPERIENCE
Backend Engineer, Gamma — Jun 2020 – Present
Built REST APIs with Python and FastAPI for internal tools.
Wrote PostgreSQL migrations and SQL reports used by ops.
Containerized services with Docker for staging.

SKILLS
Python, FastAPI, PostgreSQL, SQL, Docker, Git
"""

MODERATE_BE = """
Sam Lee
sam@example.com

EXPERIENCE
Software Engineer, Delta — 2021 – Present
Worked on backend tickets in Python.
Helped with database fixes and some Docker scripts.

SKILLS
Python, SQL, JavaScript, React, Docker
"""

WEAK_FE_FOR_BE = """
Jordan Kim
jordan@example.com | +1 555 0199

EXPERIENCE
Frontend Engineer, Pixel — 2020 – Present
Built React dashboards with TypeScript and Redux.
Shipped CSS and accessibility improvements for 200k users.

PROJECTS
Side Node API toy project with Express.

SKILLS
React, TypeScript, JavaScript, CSS, HTML, Redux, Node.js, Express
"""

STUFFED = """
Pat Stuff
pat@x.com

SKILLS
Python Python Python Python Python FastAPI FastAPI PostgreSQL PostgreSQL SQL Docker
Kubernetes Kafka AWS Redis Redis Redis Spring Java MongoDB GraphQL Terraform

EXPERIENCE
Engineer — 2022
Did various tasks using many technologies listed above.
"""

SKILLS_ONLY = """
Riley List
riley@example.com

SKILLS
Python, FastAPI, PostgreSQL, SQL, Docker, Kubernetes, Kafka, AWS, Redis
"""

UNRELATED = """
Morgan Arts
morgan@example.com

EXPERIENCE
Graphic Designer, Studio — 2019 – Present
Created brand identities in Figma and Illustrator.
Produced print layouts and marketing PDFs.

SKILLS
Figma, Illustrator, Photoshop, InDesign
"""

# Ordered best → worst for BACKEND_JD (relative ranking must hold)
ORDERING_CASES = [
    ("excellent", EXCELLENT_BE),
    ("strong", STRONG_BE),
    ("moderate", MODERATE_BE),
    ("skills_only", SKILLS_ONLY),
    ("stuffed", STUFFED),
    ("weak_fe", WEAK_FE_FOR_BE),
    ("unrelated", UNRELATED),
]

EXPECTED_ORDER = [name for name, _ in ORDERING_CASES]
