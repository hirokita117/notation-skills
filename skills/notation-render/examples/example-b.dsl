# repo-map v1
# story: 1 サービスの深掘り（depth 2・9 ノード）
# desc: auth サービス内部を file-group/module 粒度で。handlers→usecases→repo の呼び出しと、DB/Redis/OAuth への依存先。
@meta
  root: services/auth
  depth: 2
  focus: handlers
  generated: 2026-06-03T09:30:00Z

@nodes
  authsvc   package    "Auth Service"     services/auth
  handlers  file-group "HTTP Handlers"    src/handlers
  usecases  file-group "Use Cases"        src/usecases
  repo      file-group "Repositories"     src/repo
  tokens    module     "Token Library"    src/tokens
  config    file-group Config             src/config
  db        datastore  Postgres
  cache     datastore  Redis
  oauth     external   "OAuth Provider"

@edges
  authsvc   handlers  contains
  authsvc   usecases  contains
  authsvc   repo      contains
  authsvc   tokens    contains
  authsvc   config    contains
  handlers  usecases  calls
  usecases  repo      calls
  usecases  tokens    imports
  repo      db        reads
  repo      cache     reads
  handlers  oauth     calls
  tokens    config    imports
