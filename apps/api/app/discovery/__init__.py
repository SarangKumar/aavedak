"""Job + people discovery pipeline (scan, normalize, ingest, rank, expire, import).

Layout:
  config.py, db.py, schema.py, timeutil.py  — shared plumbing
  jobs/      — career-page providers, filters, ingest store, ranking, expiry
  people/    — import parsing, dedupe/enrich store, job relevance
  runs/      — persistent leased run items + budgeted tick worker
  router.py  — /svc/v1/discovery/* (cron + internal admin endpoints)

See DISCOVERY.md.
"""
