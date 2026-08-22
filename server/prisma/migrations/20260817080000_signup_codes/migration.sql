-- Six-digit codes for the self-service signup screen.
--
-- The invited person completes their own registration: they type their name and
-- choose a password, then confirm a code sent to the address the administrator
-- invited. The code lives on the existing account_tokens row rather than in a
-- table of its own — it is the same single-use, time-limited grant, just
-- delivered as digits instead of a link.
--
-- `attempts` is not decoration. Six digits is 1 000 000 combinations, a few
-- minutes of scripted traffic; the expiry alone would not stop it.

ALTER TABLE "account_tokens" ADD COLUMN "codeHash" TEXT;
ALTER TABLE "account_tokens" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
