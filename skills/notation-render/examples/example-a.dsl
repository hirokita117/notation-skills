# repo-map v1
@meta
  root: .
  depth: 1
  focus: core
  generated: 2026-06-03T09:00:00Z

@nodes
  monorepo  system    "Acme Platform"
  web       package   "Web App"          apps/web
  mobile    package   "Mobile App"       apps/mobile
  core      package   "Shared Core"      packages/core
  authsvc   package   "Auth Service"     services/auth
  billsvc   package   "Billing Service"  services/billing
  db        datastore Postgres
  email     external  "Email Provider"

@edges
  monorepo  web      contains
  monorepo  mobile   contains
  monorepo  core     contains
  monorepo  authsvc  contains
  monorepo  billsvc  contains
  web       core     imports
  mobile    core     imports
  authsvc   core     imports
  billsvc   core     imports
  authsvc   db       reads
  billsvc   db       reads
  billsvc   email    calls
