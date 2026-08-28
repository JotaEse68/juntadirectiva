import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sql = await readFile(new URL('../supabase/migrations/20260828_auth_credits_and_reports.sql', import.meta.url), 'utf8')

test('purchase grant is permanently idempotent and transactional', () => {
  assert.match(sql, /stripe_session_id text primary key/i)
  assert.match(sql, /insert into public\.purchases[\s\S]+on conflict do nothing[\s\S]+update public\.profiles/i)
  assert.doesNotMatch(sql, /expire[^\n]+stripe_session/i)
})

test('report reservation supports atomic finalize and refund operations', () => {
  assert.match(sql, /create or replace function public\.reserve_report_credit/i)
  assert.match(sql, /create or replace function public\.finalize_report_reservation/i)
  assert.match(sql, /create or replace function public\.refund_report_reservation/i)
  assert.match(sql, /where id = p_reservation_id and user_id = p_user_id and status = 'reserved'/i)
})

