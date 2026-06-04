# repo-map v1
@meta
  root: .
  depth: 3
  generated: 2026-06-03T09:00:00Z

@nodes
  web package "Web App" apps/web
  api package "API"

@edges
  web api imports
  web ghost calls

@foo
  x y z
