# document-map v1
# story: 設計書の 1 セクションを depth 2 で深掘り
# desc: 認証フローの要件・依存・リスクと緩和策を詳細化（requirement / mitigates / decides）
@meta
  source: docs/design-auth.md#auth-flow
  depth: 2
  focus: r-mfa
  generated: 2026-06-04T10:00:00Z

@nodes
  auth      section       "認証フロー"            #auth-flow
  login     concept       "ログイン処理"
  session   concept       "セッション管理"
  r-mfa     requirement   "MFA 必須"
  r-sso     requirement   "SSO 連携 (SAML)"
  r-expiry  requirement   "セッション有効期限 24h"
  r-revoke  requirement   "即時失効できる"
  q-legacy  open-question "旧ログインの移行方法"
  risk-lock risk          "MFA 必須でロックアウト増"
  idp       external      "IdP (Okta)"
  d-mfa     decision      "MFA は TOTP + SMS"

@edges
  auth      login     contains
  auth      session   contains
  login     r-mfa     contains
  login     r-sso     contains
  session   r-expiry  contains
  session   r-revoke  contains
  r-sso     idp       depends-on
  r-mfa     idp       depends-on
  r-mfa     risk-lock raises
  d-mfa     r-mfa     decides
  d-mfa     risk-lock mitigates
  r-revoke  r-expiry  depends-on
  login     q-legacy  raises
