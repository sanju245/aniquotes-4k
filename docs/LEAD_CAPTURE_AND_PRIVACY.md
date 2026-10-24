# Lead Capture, Consent, and Privacy

## First-launch experience

- On first launch, show a registration screen requesting the person's name and email address.
- Explain the purpose of collection and link to the privacy notice before submission.
- Keep cross-app marketing consent separate from basic registration and unchecked by default.
- Use clear wording such as: "I want to receive updates and offers about your other apps and services by email." Do not bundle this into required app registration.
- Do not block core wallpaper browsing solely because a person declines optional marketing. If registration is not essential to a feature, allow skip/continue without sharing personal details.
- Avoid requesting unrelated personal information.

## Database and access

- Store leads in `public.app_leads`, separate from the public wallpaper catalog.
- `source_app` identifies where the person signed up, enabling cross-app attribution.
- Record the privacy notice version and timestamp, marketing opt-in state and timestamp, opt-out timestamp, and deletion request timestamp.
- `cross_app_marketing_opt_in` defaults to `false`. Only opted-in, non-unsubscribed, non-deletion-requested records are eligible for cross-app marketing exports.
- Row Level Security is enabled. Only the owner/admin can read or manage the table through the admin UI.
- Public registration must use a server-side endpoint such as a Supabase Edge Function. Validate inputs, normalize email, apply rate limiting and abuse protection, and use the Supabase service-role key only in server-side secrets. Never ship that key in the Android APK or Next.js browser bundle.
- Do not put name/email in analytics events, crash reports, URLs, or public API responses.

## User controls and retention

- Provide a way to unsubscribe from marketing emails and honor opt-outs across all apps using the shared lead record.
- Provide a contact path for access/correction/deletion requests and a documented process to fulfill them.
- Define a retention period and delete or anonymize records when no longer needed, subject to applicable legal obligations.
- Publish a privacy notice describing the data collected, purposes, sharing across apps, retention, user rights, contact details, and relevant service providers.
- Before launch, review applicable privacy and marketing laws in the countries where the app is offered, Google Play's User Data and Data safety requirements, and the email provider's consent rules. Obtain appropriate legal advice where needed.

## Admin lead management requirements

- Owner-only leads page with source-app, signup date, and marketing-consent filters.
- Export must default to eligible opted-in records only; any broader export should be restricted and clearly labeled for non-marketing operational use.
- Record admin exports and bulk changes in an audit log.
- Include unsubscribe, deletion-request, and suppression handling before any bulk email campaign is enabled.

## Current implementation status

The SQL migration establishes the protected lead table and consent fields. It does not by itself implement the Android onboarding screen, public registration endpoint, email verification, unsubscribe workflow, or admin lead-management UI. Those must be implemented and tested before collecting real users' data.

## Device and favorite-character preferences
The onboarding UI asks for device brand/model, screen pixel dimensions and favorite character choices. Migration `202610230003_personalization_ratings_and_subscriptions.sql` adds these fields to the private lead record. Explain each purpose in the published privacy notice, collect only what the feature needs, and provide a way to edit or delete it. The current Android UI stores these details locally only; it does not call the registration function yet.

The registration function in `supabase/functions/register-app-lead/index.ts` is a starter implementation. Before production deployment, add reliable per-IP/device rate limiting and abuse protection, restrict CORS where applicable, test opt-out/re-consent semantics, deploy it with server-side secrets, and connect the Android client using a safe public endpoint. Never ship a service-role key in the app.
