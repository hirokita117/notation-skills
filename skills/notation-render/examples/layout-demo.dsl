# repo-map v1
# @layout の rank= / group= と、依存のみノード・既定グループを示す小さな例。
@meta
  root: services/auth
  depth: 2
  focus: handlers
  generated: 2026-06-03T09:30:00Z

@nodes
  authsvc   package    "Auth Service"   services/auth
  handlers  file-group "HTTP Handlers"  src/handlers
  usecases  file-group "Use Cases"      src/usecases
  repo      file-group "Repositories"   src/repo
  db        datastore  Postgres

@edges
  authsvc   handlers  contains
  authsvc   usecases  contains
  authsvc   repo      contains
  handlers  usecases  calls
  usecases  repo      calls
  repo      db        reads

@layout
  handlers  group=api
  usecases  group=api
  repo      group=data
  db        rank=4
