-- Invitation and password-reset links.
--
-- One table serves both: an invitation lets a new colleague choose their first
-- password, a reset lets an existing one replace a forgotten password. Both end
-- on the same screen doing the same thing.
--
-- users.password becomes nullable, which is the point of the invitation flow:
-- between an administrator creating the account and the invited person
-- following their link there is no password, because nobody typed one on their
-- behalf. Existing rows keep theirs.

CREATE TYPE "AccountTokenType" AS ENUM ('INVITATION', 'PASSWORD_RESET');

ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

CREATE TABLE "account_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccountTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_tokens_tokenHash_key" ON "account_tokens"("tokenHash");
CREATE INDEX "account_tokens_userId_idx" ON "account_tokens"("userId");
CREATE INDEX "account_tokens_expiresAt_idx" ON "account_tokens"("expiresAt");

ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
