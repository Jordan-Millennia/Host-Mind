# Lock-Account Registry

Last updated: NOT YET POPULATED - run Registry Discovery to populate this file.

This file maps each CoSpace Management property to the TTLock account that holds its locks. The `padsplit-message-responder` skill reads this file at the start of each lock batch when using the TTLock web portal fallback, so it can go directly to the correct account without searching.

Do not store passwords, MFA codes, recovery codes, API keys, or private credentials in this file. Use Jordan-approved credential storage or current session context when a login is required.

Format: each account section lists properties and their lock names. When performing a lock action, find the property address below, note the account number, and log into that account on `lock2.ttlock.com`.

## Account 1: Access@MillenniaRealtors.com

Run Registry Discovery to populate. Log into this account at `lock2.ttlock.com` and catalog all locks.

## Account 2: eliteequitypartners@hotmail.com

Run Registry Discovery to populate.

## Account 3: visionarynexus@outlook.com

Run Registry Discovery to populate.

## Account 4: Zach@zachgerlack.com

Run Registry Discovery to populate.

## Registry Discovery

Run Registry Discovery when:

- This file is still unpopulated.
- A property cannot be matched to a lock account.
- A lock name has changed.
- Jordan asks for a refresh.

For each TTLock account:

1. Log into the account on `lock2.ttlock.com`.
2. Catalog every property address visible in the account.
3. Record exact lock names as shown in TTLock.
4. Group all locks for the same property together.
5. Replace the placeholder under the account with the property blocks.

Use this block format:

```markdown
**[Street Address]**
- [Lock Name 1] (e.g., "3300 NW 15th - Front Door")
- [Lock Name 2] (e.g., "3300 NW 15th - Room 1")
- [Lock Name 3]
```

Use exact lock names. Future lock lookups depend on matching these strings quickly.

## Update Rules

- Use targeted edits only.
- Do not remove an account section unless Jordan explicitly says the account is retired.
- If a property appears under multiple accounts, do not guess. Flag P1 and log the ambiguity.
- If a lock appears stale or no longer present in TTLock, append a dated note instead of deleting it.
- Keep this registry free of passwords, MFA codes, recovery codes, or private credentials.
