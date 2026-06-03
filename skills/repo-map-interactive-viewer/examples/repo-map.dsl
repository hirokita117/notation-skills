# repo-map v1
@meta
  root: .
  depth: 1
  focus: core
  generated: 2026-06-03T09:00:00Z

@nodes
  monorepo  system    "Acme Platform"
  web       package   "Web App"        apps/web
  core      package   "Shared Core"    packages/core
  db        datastore Postgres

@edges
  monorepo  web   contains
  monorepo  core  contains
  web       core  imports
  core      db    reads
