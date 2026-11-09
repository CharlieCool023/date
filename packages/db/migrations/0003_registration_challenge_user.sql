-- Registration challenges carry the id the new member will receive, so the user row
-- doesn't exist yet when the challenge is stored. The foreign key rejected every
-- registration. Challenges expire after minutes and are deleted on use, by the
-- auth.cleanup job, and explicitly by account hard deletion.
-- Reversible: ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_user_id_fkey
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE auth_challenges DROP CONSTRAINT IF EXISTS auth_challenges_user_id_fkey;
