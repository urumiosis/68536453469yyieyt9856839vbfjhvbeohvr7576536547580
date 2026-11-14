# Student sign-up setup — current guide

**Use [SUPABASE-STUDENT-SETUP.md](SUPABASE-STUDENT-SETUP.md).**

The former version of this file described an approved-email roster.
That is **no longer required**.

As of November 14, 2026, the Supabase hook and certificate eligibility
function accept every address matching
`e0000@edu.markaryd.se` through `e9999@edu.markaryd.se`
(case-insensitive) **when student registration is enabled**, and
Supabase email confirmation must be required to establish mailbox control.

No manual student-email inserts are necessary. The domain is configured,
but `public.student_signup_config.enabled` remains **false** until
certificate verification, private-code access restrictions, and Supabase
deployment are ready.
