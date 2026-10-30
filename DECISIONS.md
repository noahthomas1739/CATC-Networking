# Decisions needed from you or church leadership

## Must decide before launch
1. **Branding permission.** May the directory use the Church at the Cross name, logo and colors? Until someone says yes, the logo is a placeholder and the footer reads "A member-run community directory for Church at the Cross. Not an official church website." If leadership makes it official, the footer and the legal pages need updating.
2. **Who administers the site.** Name at least **two** admins, so one can recover if the other loses access. Each admin needs a passkey, ideally on two devices.
3. **Who can issue invites.** Right now only admins can. Options:
   - (a) admins only (current)
   - (b) any approved member can invite, and admins still approve every account
   - (c) only staff
4. **Approval criteria.** How does an admin confirm someone is actually a member? For example, they recognize the person, check the church member list, or a staff member confirms.
5. **Moderation policy.**
   - What counts as solicitation abuse (MLM recruiting, mass messages)?
   - How quickly will reports be reviewed?
   - What are the steps: warning, then suspension, then removal?
   - Who handles appeals?
6. **Legal review.** The Terms of Use and Privacy Policy are **drafts**. Fill in the `[DATE]` and `[ADMIN CONTACT EMAIL]` placeholders (also `[SECURITY CONTACT EMAIL]` in SECURITY.md), and have a lawyer and church leadership review them, especially the no-endorsement disclaimer and the limitation of liability.
7. **Domain and email.** Pick the site's domain and the sending address (e.g. `directory@<your domain>`), then verify it in Resend. Passkeys are tied to the domain, so choose it carefully.

## Defaults I chose (change any of them)
| Topic | Default |
|---|---|
| Introduction limits | 10 per day; **2 per day** during the first 7 days after approval; 60 replies per day |
| Sessions | Members: 24 hours idle, 7 days max. Admins: 30 minutes idle, 8 hours max |
| Invite lifetime | 7 days, single use, tied to one email address |
| Magic link | 15 minutes, single use |
| Deletion | Immediate in the live database; backups expire within 30 days |
| Audit log retention | 1 year |
| Categories | 21 starter categories (editable in Admin → Categories) |
| Admin reading messages | Only messages that have been reported |
| Recommendations | One per member per profile, up to 500 characters, shows the author's name; the owner can hide; the author can delete |
| Analytics | None |
| Time zone shown | America/Chicago |
| Invites | Delivered by email only. The link is not displayed to the admin, which keeps it off screens and out of browser history. The CLI admin invite also prints the link to the operator's terminal for bootstrapping |

## Nice-to-have later (deliberately left out to keep it simple)
- Member-issued invites (option 3b above)
- Email preferences (e.g. turning off reply notifications)
- Admin view of a suspended member's profile (currently admins see their name, business and email in the members list)
- A second admin factor for recovery, such as a hardware security key
